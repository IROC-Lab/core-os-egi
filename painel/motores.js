// Core OS · motores de IA. Cada conversa roda num motor: Claude Code, Codex (OpenAI) ou Antigravity (Google).
// Aqui fica o que muda de um pro outro: como abrir o terminal, como rodar sem tela (WhatsApp),
// e como ler o registro da conversa pra mostrar status e histórico no painel.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const casa = os.homedir();

export const MOTORES = {
  claude: {
    nome: 'Claude Code',
    bin: process.env.CLAUDE_BIN || 'claude',
    login: 'Entra sozinho na primeira conversa (conta Anthropic ou chave ANTHROPIC_API_KEY).',
  },
  codex: {
    nome: 'Codex',
    bin: process.env.CODEX_BIN || 'codex',
    login: 'No terminal do servidor: codex login --device-auth (conta ChatGPT) ou OPENAI_API_KEY no /opt/core-os/.env.',
  },
  antigravity: {
    nome: 'Antigravity',
    bin: process.env.AGY_BIN || 'agy',
    login: 'No terminal do servidor: rode agy e siga o link com código (conta Google) ou GEMINI_API_KEY no /opt/core-os/.env.',
  },
};
export const motorDe = (conv) => (MOTORES[conv?.motor] ? conv.motor : 'claude');

// acha o executável no PATH (ou caminho absoluto); ~/.local/bin entra mesmo se o serviço não tiver no PATH
const PASTAS = [...new Set([...(process.env.PATH || '').split(':'), path.join(casa, '.local', 'bin'), '/usr/local/bin', '/usr/bin'])];
export function caminhoBin(id) {
  const bin = MOTORES[id].bin;
  if (bin.includes('/')) return fs.existsSync(bin) ? bin : null;
  for (const p of PASTAS) { const f = path.join(p, bin); try { fs.accessSync(f, fs.constants.X_OK); return f; } catch { /* */ } }
  return null;
}
export const disponiveis = () => Object.fromEntries(Object.entries(MOTORES).map(([id, m]) => [id, { nome: m.nome, instalado: Boolean(caminhoBin(id)), login: m.login }]));

// texto vira string TOML (o Codex lê -c chave=valor como TOML)
const toml = (s) => JSON.stringify(String(s));

// ---------- terminal (uma conversa interativa) ----------
export function comandoTerminal(conv, { prompt, jaTemClaude }) {
  const id = motorDe(conv);
  const bin = caminhoBin(id) || MOTORES[id].bin;
  if (id === 'codex') {
    const base = ['-c', `developer_instructions=${toml(prompt)}`, '--sandbox', 'workspace-write', '--ask-for-approval', 'on-request'];
    return { bin, args: conv.sessaoMotor ? ['resume', ...base, conv.sessaoMotor] : base };
  }
  if (id === 'antigravity') {
    // o agy não tem flag de prompt de sistema: a regra vem do AGENTS.md + variável CORE_OS_SESSAO
    return { bin, args: conv.sessaoMotor ? ['--conversation', conv.sessaoMotor] : conv.iniciouTerminal ? ['--continue'] : [] };
  }
  return { bin, args: [jaTemClaude ? '--resume' : '--session-id', conv.id, '--append-system-prompt', prompt] };
}

// ---------- sem tela (WhatsApp): devolve { resposta, sessao } ----------
export function rodarSemTela(conv, texto, { prompt, env, cwd, jaTemClaude }) {
  const id = motorDe(conv);
  const bin = caminhoBin(id) || MOTORES[id].bin;
  let args; let saidaArq = null;
  if (id === 'codex') {
    saidaArq = path.join(os.tmpdir(), `core-os-codex-${conv.id}-${Date.now()}.txt`);
    const base = ['-c', `developer_instructions=${toml(prompt)}`, '-c', 'sandbox_mode="danger-full-access"', '-c', 'approval_policy="never"',
      '--skip-git-repo-check', '--json', '-o', saidaArq];
    args = conv.sessaoMotor ? ['exec', 'resume', ...base, '--', conv.sessaoMotor, texto] : ['exec', ...base, '--', texto];
  } else if (id === 'antigravity') {
    const primeira = !conv.sessaoMotor;
    const pedido = primeira ? `[Instruções do Core OS: ${prompt}]\n\n${texto}` : texto;
    args = ['-p', pedido, '--output-format', 'json', '--dangerously-skip-permissions', '--print-timeout', '20m',
      ...(conv.sessaoMotor ? ['--conversation', conv.sessaoMotor] : [])];
  } else {
    args = ['-p', texto, jaTemClaude ? '--resume' : '--session-id', conv.id,
      '--append-system-prompt', prompt, '--output-format', 'text', '--permission-mode', 'acceptEdits',
      '--allowedTools', 'Bash', 'Read', 'Write', 'Edit', 'Glob', 'Grep', 'Skill', 'Task', 'WebFetch', 'WebSearch'];
  }
  return new Promise((pronto) => {
    const proc = spawn(bin, args, { cwd, env, stdio: ['ignore', 'pipe', 'pipe'] });
    let out = ''; let err = '';
    proc.stdout.on('data', (d) => { out += d; });
    proc.stderr.on('data', (d) => { err += d; });
    const limite = setTimeout(() => proc.kill('SIGTERM'), 20 * 60_000);
    proc.on('error', (e) => { clearTimeout(limite); pronto({ resposta: `Não consegui abrir o ${MOTORES[id].nome}: ${e.message}` }); });
    proc.on('close', () => {
      clearTimeout(limite);
      if (id === 'codex') {
        let sessao = null;
        for (const l of out.split('\n')) { try { const o = JSON.parse(l); sessao = o.thread_id || o.session_id || o.payload?.id || sessao; } catch { /* */ } }
        let resposta = '';
        try { resposta = fs.readFileSync(saidaArq, 'utf8').trim(); fs.renameSync(saidaArq, `${saidaArq}.lido`); } catch { /* */ }
        pronto({ resposta: resposta || err.trim().split('\n').slice(-5).join('\n'), sessao });
      } else if (id === 'antigravity') {
        try {
          const o = JSON.parse(out);
          pronto({ resposta: String(o.response ?? o.result ?? o.text ?? out).trim(), sessao: o.conversation_id || o.conversationId || o.session_id || o.sessionId || null });
        } catch { pronto({ resposta: (out || err).trim() }); }
      } else pronto({ resposta: (out + err).trim() });
    });
  });
}

// ---------- registro do Codex (~/.codex/sessions/AAAA/MM/DD/rollout-*.jsonl) ----------
const SESSOES_CODEX = path.join(process.env.CODEX_HOME || path.join(casa, '.codex'), 'sessions');
function rolloutsRecentes(dias = 3) {
  const saida = [];
  for (let d = 0; d < dias; d++) {
    const t = new Date(Date.now() - d * 86400_000);
    const dir = path.join(SESSOES_CODEX, String(t.getFullYear()), String(t.getMonth() + 1).padStart(2, '0'), String(t.getDate()).padStart(2, '0'));
    try { for (const f of fs.readdirSync(dir)) if (f.endsWith('.jsonl')) saida.push(path.join(dir, f)); } catch { /* */ }
  }
  return saida;
}
const cacheArquivo = new Map();
export function arquivoCodex(sessao) {
  if (!sessao) return null;
  const c = cacheArquivo.get(sessao);
  if (c && fs.existsSync(c)) return c;
  const achar = (dir) => {
    let itens = []; try { itens = fs.readdirSync(dir, { withFileTypes: true }); } catch { return null; }
    for (const i of itens) {
      const p = path.join(dir, i.name);
      if (i.isDirectory()) { const r = achar(p); if (r) return r; } else if (i.name.includes(sessao)) return p;
    }
    return null;
  };
  const f = rolloutsRecentes(7).find((x) => x.includes(sessao)) || achar(SESSOES_CODEX);
  if (f) cacheArquivo.set(sessao, f);
  return f;
}

// conversa de Codex aberta no terminal ainda sem id: liga ao rollout novo com a mesma pasta
export function vincularCodex(conversas, vault) {
  const soltas = conversas.filter((c) => c.motor === 'codex' && !c.sessaoMotor && c.iniciouTerminal && !c.arquivada);
  if (!soltas.length) return false;
  const usados = new Set(conversas.map((c) => c.sessaoMotor).filter(Boolean));
  let mudou = false;
  for (const f of rolloutsRecentes(2)) {
    let meta; try { meta = JSON.parse(fs.readFileSync(f, 'utf8').split('\n')[0]).payload; } catch { continue; }
    if (!meta?.id || usados.has(meta.id) || path.resolve(meta.cwd || '') !== vault) continue;
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

// mesmo formato que o painel usa pro Claude: { ultimaAcao, terminou, mtime } e itens de histórico
export function lerCodex(sessao) {
  const f = arquivoCodex(sessao);
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
