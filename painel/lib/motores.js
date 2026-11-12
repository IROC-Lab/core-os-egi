// EGI Brand · motores de IA. Cada conversa roda num motor: Claude Code, Codex (OpenAI) ou Antigravity (Google),
// sempre com o login DO CLIENTE: o HOME do processo é a pasta da empresa (casa/.claude, casa/.codex, casa/.gemini),
// então cada empresa entra com a própria conta e uma nunca usa a assinatura da outra.
//
// `amb` (ambiente da empresa) = { casa, cwd, env, uid, gid, bins, limiteMinutos }
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export const MOTORES = {
  claude: { nome: 'Claude Code', login: 'Na primeira conversa o Claude Code mostra o login da conta Anthropic (ou use a variável ANTHROPIC_API_KEY da empresa).' },
  codex: { nome: 'Codex', login: 'Na primeira conversa o painel abre o login por código da conta ChatGPT (ou use a variável OPENAI_API_KEY da empresa).' },
  antigravity: { nome: 'Antigravity', login: 'Na primeira conversa aparece o link de login da conta Google; cole o código no terminal.' },
};
export const motorDe = (conv) => (MOTORES[conv?.motor] ? conv.motor : 'claude');
export const motorValido = (m) => Boolean(MOTORES[m]);

// acha o executável no PATH dos agentes (ou caminho absoluto)
export function caminhoBin(id, amb) {
  const bin = amb.bins?.[id] || id;
  if (bin.includes('/')) return fs.existsSync(bin) ? bin : null;
  const pastas = [...new Set(String(amb.env?.PATH || process.env.PATH || '').split(':').filter(Boolean))];
  for (const p of pastas) { const f = path.join(p, bin); try { fs.accessSync(f, fs.constants.X_OK); return f; } catch { /* */ } }
  return null;
}

const temArquivo = (f) => { try { return fs.statSync(f).size > 0; } catch { return false; } };
const codexHome = (amb) => path.join(amb.casa, '.codex');
export function logado(id, amb) {
  if (id === 'codex') return temArquivo(path.join(codexHome(amb), 'auth.json')) || Boolean(amb.env?.OPENAI_API_KEY);
  if (id === 'antigravity') return temArquivo(path.join(amb.casa, '.gemini', 'antigravity-cli', 'antigravity-oauth-token'));
  if (id === 'claude') return temArquivo(path.join(amb.casa, '.claude', '.credentials.json')) || temArquivo(path.join(amb.casa, '.claude.json')) || Boolean(amb.env?.ANTHROPIC_API_KEY);
  return false;
}
export const disponiveis = (amb) => Object.fromEntries(Object.entries(MOTORES).map(([id, m]) => [id, { nome: m.nome, instalado: Boolean(caminhoBin(id, amb)), logado: logado(id, amb), login: m.login }]));

const toml = (s) => JSON.stringify(String(s)); // o Codex lê -c chave=valor como TOML
const sh = (s) => `'${String(s).replace(/'/g, `'\\''`)}'`;
const dono = (amb) => (amb.uid != null ? { uid: amb.uid, gid: amb.gid ?? amb.uid } : {});

// ---------- terminal (conversa interativa no painel) ----------
export function comandoTerminal(conv, { prompt, jaTemClaude }, amb) {
  const id = motorDe(conv);
  const bin = caminhoBin(id, amb) || amb.bins?.[id] || id;
  if (id === 'codex') {
    const base = ['-c', `developer_instructions=${toml(prompt)}`, '--sandbox', 'workspace-write', '--ask-for-approval', 'on-request'];
    const args = conv.sessaoMotor ? ['resume', ...base, conv.sessaoMotor] : base;
    if (temArquivo(path.join(codexHome(amb), 'auth.json'))) return { bin, args };
    // sem login: "Sign in with ChatGPT" abre um localhost que não existe no servidor. Usa a chave da empresa (se
    // houver) ou o login por código (device auth), e só depois abre o Codex.
    const entrar = amb.env?.OPENAI_API_KEY
      ? `printenv OPENAI_API_KEY | ${sh(bin)} login --with-api-key`
      : `echo; echo '  Login do Codex: abra o link abaixo no seu navegador, entre com a sua conta ChatGPT e digite o código.'; echo; ${sh(bin)} login --device-auth`;
    return { bin: 'bash', args: ['-c', `${entrar} && exec ${sh(bin)} ${args.map(sh).join(' ')} || { echo; echo '  Login não concluído. Feche esta conversa e abra outra pra tentar de novo.'; sleep 3600; }`] };
  }
  if (id === 'antigravity') {
    const args = conv.sessaoMotor ? ['--conversation', conv.sessaoMotor] : conv.iniciouTerminal ? ['--continue'] : [];
    if (logado('antigravity', amb)) return { bin, args };
    return { bin: 'bash', args: ['-c', `echo; echo '  Login do Antigravity: abra o link que vai aparecer, entre com a conta Google e cole o código aqui (tem uns 30 segundos).'; echo; ${sh(bin)} -p 'Responda só: ok' && exec ${sh(bin)} ${args.map(sh).join(' ')} || { echo; echo '  Login não concluído. Feche esta conversa e abra outra pra tentar de novo.'; sleep 3600; }`] };
  }
  return { bin, args: [jaTemClaude ? '--resume' : '--session-id', conv.id, '--append-system-prompt', prompt] };
}
export const opcoesProcesso = (amb, extra = {}) => ({ cwd: amb.cwd, env: { ...amb.env, ...extra }, ...dono(amb) });

// ---------- sem tela (WhatsApp, Telegram, ponte): devolve { resposta, sessao } ----------
export function argumentosSemTela(conv, texto, { prompt, jaTemClaude, saidaArq }) {
  const id = motorDe(conv);
  if (id === 'codex') {
    const base = ['-c', `developer_instructions=${toml(prompt)}`, '-c', 'sandbox_mode="danger-full-access"', '-c', 'approval_policy="never"',
      '--skip-git-repo-check', '--json', '-o', saidaArq];
    return conv.sessaoMotor ? ['exec', 'resume', ...base, '--', conv.sessaoMotor, texto] : ['exec', ...base, '--', texto];
  }
  if (id === 'antigravity') {
    const pedido = conv.sessaoMotor ? texto : `[Instruções do EGI Brand: ${prompt}]\n\n${texto}`;
    return ['-p', pedido, '--output-format', 'json', '--dangerously-skip-permissions', '--print-timeout', '20m',
      ...(conv.sessaoMotor ? ['--conversation', conv.sessaoMotor] : [])];
  }
  return ['-p', texto, jaTemClaude ? '--resume' : '--session-id', conv.id,
    '--append-system-prompt', prompt, '--output-format', 'text', '--permission-mode', 'acceptEdits',
    '--allowedTools', 'Bash', 'Read', 'Write', 'Edit', 'Glob', 'Grep', 'Skill', 'Task', 'WebFetch', 'WebSearch'];
}

export function rodarSemTela(conv, texto, { prompt, jaTemClaude, extraEnv = {} }, amb) {
  const id = motorDe(conv);
  const bin = caminhoBin(id, amb) || amb.bins?.[id] || id;
  const saidaArq = id === 'codex' ? path.join(amb.tmp || os.tmpdir(), `codex-${conv.id}-${Date.now()}.txt`) : null;
  const args = argumentosSemTela(conv, texto, { prompt, jaTemClaude, saidaArq });
  return new Promise((pronto) => {
    let proc;
    try { proc = spawn(bin, args, { ...opcoesProcesso(amb, extraEnv), stdio: ['ignore', 'pipe', 'pipe'] }); } catch (e) {
      pronto({ resposta: `Não consegui abrir o ${MOTORES[id].nome}: ${e.message}`, erro: true }); return;
    }
    let out = ''; let err = '';
    proc.stdout.on('data', (d) => { out += d; if (out.length > 2_000_000) out = out.slice(-1_000_000); });
    proc.stderr.on('data', (d) => { err += d; if (err.length > 200_000) err = err.slice(-100_000); });
    const limite = setTimeout(() => proc.kill('SIGTERM'), (amb.limiteMinutos || 20) * 60_000);
    amb.aoIniciar?.(proc);
    proc.on('error', (e) => { clearTimeout(limite); pronto({ resposta: `Não consegui abrir o ${MOTORES[id].nome}: ${e.message}`, erro: true }); });
    proc.on('close', (codigo) => {
      clearTimeout(limite);
      amb.aoTerminar?.(proc);
      pronto({ ...lerSaida(id, out, err, saidaArq), codigo });
    });
  });
}

export function lerSaida(id, out, err, saidaArq) {
  if (id === 'codex') {
    let sessao = null;
    for (const l of out.split('\n')) { try { const o = JSON.parse(l); sessao = o.thread_id || o.session_id || o.payload?.id || sessao; } catch { /* */ } }
    let resposta = '';
    try { resposta = fs.readFileSync(saidaArq, 'utf8').trim(); fs.unlinkSync(saidaArq); } catch { /* */ }
    return { resposta: resposta || err.trim().split('\n').slice(-5).join('\n'), sessao };
  }
  if (id === 'antigravity') {
    try {
      const o = JSON.parse(out);
      return { resposta: String(o.response ?? o.result ?? o.text ?? out).trim(), sessao: o.conversation_id || o.conversationId || o.session_id || o.sessionId || null };
    } catch { return { resposta: (out || err).trim(), sessao: null }; }
  }
  return { resposta: (out || err).trim(), sessao: null };
}

// ---------- registro do Codex (casa/.codex/sessions/AAAA/MM/DD/rollout-*.jsonl) ----------
function rolloutsRecentes(amb, dias = 3) {
  const raiz = path.join(codexHome(amb), 'sessions');
  const saida = [];
  for (let d = 0; d < dias; d++) {
    const t = new Date(Date.now() - d * 86400_000);
    const dir = path.join(raiz, String(t.getFullYear()), String(t.getMonth() + 1).padStart(2, '0'), String(t.getDate()).padStart(2, '0'));
    try { for (const f of fs.readdirSync(dir)) if (f.endsWith('.jsonl')) saida.push(path.join(dir, f)); } catch { /* */ }
  }
  return saida;
}
const cacheArquivo = new Map();
export function arquivoCodex(sessao, amb) {
  if (!sessao) return null;
  const c = cacheArquivo.get(sessao);
  if (c && fs.existsSync(c)) return c;
  const achar = (dir, prof = 0) => {
    if (prof > 4) return null;
    let itens = []; try { itens = fs.readdirSync(dir, { withFileTypes: true }); } catch { return null; }
    for (const i of itens) {
      const p = path.join(dir, i.name);
      if (i.isDirectory()) { const r = achar(p, prof + 1); if (r) return r; } else if (i.name.includes(sessao)) return p;
    }
    return null;
  };
  const f = rolloutsRecentes(amb, 7).find((x) => x.includes(sessao)) || achar(path.join(codexHome(amb), 'sessions'));
  if (f) cacheArquivo.set(sessao, f);
  return f;
}

// conversa de Codex aberta no terminal ainda sem id: liga ao rollout novo com a mesma pasta
export function vincularCodex(conversas, amb) {
  const soltas = conversas.filter((c) => c.motor === 'codex' && !c.sessaoMotor && c.iniciouTerminal && !c.arquivada);
  if (!soltas.length) return false;
  const usados = new Set(conversas.map((c) => c.sessaoMotor).filter(Boolean));
  let mudou = false;
  for (const f of rolloutsRecentes(amb, 2)) {
    let meta; try { meta = JSON.parse(fs.readFileSync(f, 'utf8').split('\n')[0]).payload; } catch { continue; }
    if (!meta?.id || usados.has(meta.id) || path.resolve(meta.cwd || '') !== amb.cwd) continue;
    const criado = Date.parse(meta.timestamp) || fs.statSync(f).mtimeMs;
    const dona = soltas.filter((c) => !c.sessaoMotor && criado >= c.iniciouTerminal - 5000).sort((a, b) => b.iniciouTerminal - a.iniciouTerminal)[0];
    if (dona) { dona.sessaoMotor = meta.id; usados.add(meta.id); mudou = true; }
  }
  return mudou;
}

function descreverCodex(p) {
  let a = {}; try { a = typeof p.arguments === 'string' ? JSON.parse(p.arguments) : p.arguments || p.input || {}; } catch { /* */ }
  const cmd = Array.isArray(a.command) ? a.command.join(' ') : a.command || a.cmd || '';
  if (/sessoes\/[0-9a-f-]{36}\.md/.test(cmd + JSON.stringify(a))) return 'Atualizando a nota de status';
  const curto = (s) => String(s).replace(/\s+/g, ' ').slice(0, 90);
  return cmd ? `${p.name || 'shell'}: ${curto(cmd)}` : p.name || 'Ação';
}

export function lerCodex(sessao, amb) {
  const f = arquivoCodex(sessao, amb);
  if (!f) return { reg: null, itens: [] };
  let st; try { st = fs.statSync(f); } catch { return { reg: null, itens: [] }; }
  const itens = []; let ultimaAcao = null; let terminou = false;
  for (const l of fs.readFileSync(f, 'utf8').split('\n')) {
    if (!l) continue;
    let o; try { o = JSON.parse(l); } catch { continue; }
    const p = o.payload || {}; const quando = o.timestamp ? Date.parse(o.timestamp) : null;
    if (o.type === 'event_msg' && p.type === 'user_message' && p.message) { itens.push({ papel: 'voce', texto: p.message, quando }); terminou = false; }
    if (o.type === 'event_msg' && p.type === 'agent_message' && p.message) itens.push({ papel: 'claude', texto: p.message, quando });
    if (o.type === 'event_msg' && p.type === 'task_complete') terminou = true;
    if (o.type === 'response_item' && /call$/.test(p.type || '') && p.type !== 'function_call_output') {
      ultimaAcao = descreverCodex(p); terminou = false;
      itens.push({ papel: 'acao', texto: ultimaAcao, quando });
    }
  }
  return { reg: { ultimaAcao, terminou, escritos: [], mtime: st.mtimeMs }, itens };
}
