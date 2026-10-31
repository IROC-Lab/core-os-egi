// Core OS · painel web do segundo cérebro.
// Serve a árvore de arquivos, abre conversas reais do Claude Code (um terminal por conversa)
// e acompanha nota de status, subagentes e mídias geradas de cada conversa.
import express from 'express';
import { WebSocketServer } from 'ws';
import pty from '@homebridge/node-pty-prebuilt-multiarch';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { catalogo, PRIMEIROS_TESTES } from './extras.js';
import { MOTORES, motorDe, disponiveis, comandoTerminal, rodarSemTela, vincularCodex, lerCodex } from './motores.js';

const AQUI = path.dirname(fileURLToPath(import.meta.url));

// ---------- configuração ----------
carregarEnv(process.env.CORE_OS_ENV || '/opt/core-os/.env');
const CFG = {
  porta: Number(process.env.CORE_OS_PORT || 3000),
  host: process.env.CORE_OS_HOST || '127.0.0.1',
  vault: fs.realpathSync(path.resolve(process.env.CORE_OS_VAULT || path.join(AQUI, '..', 'cerebro-demo'))),
  dados: path.resolve(process.env.CORE_OS_DATA || path.join(AQUI, 'data')),
  senha: process.env.CORE_OS_PASSWORD || '',
  tokenPonte: process.env.CORE_OS_HOOK_TOKEN || '',
  claude: process.env.CLAUDE_BIN || 'claude',
};
fs.mkdirSync(CFG.dados, { recursive: true });
if (!CFG.senha) {
  CFG.senha = crypto.randomBytes(9).toString('base64url');
  console.log(`\n  CORE_OS_PASSWORD não definida. Senha desta execução: ${CFG.senha}\n`);
}
const PROJETOS = path.join(os.homedir(), '.claude', 'projects', CFG.vault.replace(/[^a-zA-Z0-9]/g, '-'));
const MIDIA = /\.(png|jpe?g|webp|gif|svg|mp4|mov|webm|m4v)$/i;

function carregarEnv(arquivo) {
  try {
    for (const linha of fs.readFileSync(arquivo, 'utf8').split('\n')) {
      const m = linha.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, '');
    }
  } catch { /* sem .env: segue com o ambiente */ }
}

// ---------- persistência simples em JSON ----------
const arq = (n) => path.join(CFG.dados, n);
const ler = (n, padrao) => { try { return JSON.parse(fs.readFileSync(arq(n), 'utf8')); } catch { return padrao; } };
const gravar = (n, v) => fs.writeFileSync(arq(n), JSON.stringify(v, null, 2));

// ---------- autenticação ----------
const sessoesLogin = new Set(ler('logins.json', []));
const falhas = new Map(); // ip -> [timestamps]
const hash = (s) => crypto.createHash('sha256').update(String(s)).digest();
function cookies(req) {
  return Object.fromEntries((req.headers.cookie || '').split(';').map((c) => c.trim().split('=')).filter((p) => p[0]));
}
const logado = (req) => sessoesLogin.has(cookies(req).coreos || '');

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 'loopback');
app.use(express.json({ limit: '1mb' }));
app.use((req, res, next) => {
  res.set({ 'X-Frame-Options': 'DENY', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer' });
  next();
});

app.post('/api/login', (req, res) => {
  const ip = req.ip;
  const agora = Date.now();
  const recentes = (falhas.get(ip) || []).filter((t) => agora - t < 60_000);
  if (recentes.length >= 5) return res.status(429).json({ erro: 'Muitas tentativas. Espere 1 minuto.' });
  if (!crypto.timingSafeEqual(hash(req.body?.senha || ''), hash(CFG.senha))) {
    falhas.set(ip, [...recentes, agora]);
    return res.status(401).json({ erro: 'Senha errada.' });
  }
  const token = crypto.randomBytes(32).toString('hex');
  sessoesLogin.add(token);
  gravar('logins.json', [...sessoesLogin].slice(-50));
  const seguro = req.secure ? '; Secure' : '';
  res.set('Set-Cookie', `coreos=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=2592000${seguro}`);
  res.json({ ok: true });
});

app.post('/api/logout', (req, res) => {
  sessoesLogin.delete(cookies(req).coreos || '');
  gravar('logins.json', [...sessoesLogin]);
  res.set('Set-Cookie', 'coreos=; Path=/; Max-Age=0').json({ ok: true });
});

app.get('/api/eu', (req, res) => res.json({ logado: logado(req) }));

// Ponte do WhatsApp (chamada pelo n8n com token próprio, antes do bloqueio de login).
app.post('/api/ponte/whatsapp', (req, res) => ponteWhatsapp(req, res));
// Ponte genérica de canais (Google Chat, Telegram, Slack...): o n8n manda a mensagem e recebe a resposta num callback.
app.post('/api/ponte/canal', (req, res) => ponteCanal(req, res));

app.use('/api', (req, res, next) => (logado(req) ? next() : res.status(401).json({ erro: 'Faça login.' })));

// ---------- arquivos ----------
function dentroDoVault(rel) {
  const alvo = path.resolve(CFG.vault, String(rel || '').replace(/^\/+/, ''));
  let real;
  try { real = fs.realpathSync(alvo); } catch { return null; }
  return real === CFG.vault || real.startsWith(CFG.vault + path.sep) ? real : null;
}
const OCULTOS = new Set(['.git', 'node_modules', '.DS_Store', '.obsidian', '.trash']);

function arvore(dir, rel = '', profundidade = 0) {
  if (profundidade > 8) return [];
  let itens = [];
  try { itens = fs.readdirSync(dir, { withFileTypes: true }); } catch { return []; }
  return itens
    .filter((d) => !OCULTOS.has(d.name) && (!d.name.startsWith('.') || d.name === '.claude'))
    .sort((a, b) => (b.isDirectory() - a.isDirectory()) || a.name.localeCompare(b.name, 'pt'))
    .map((d) => {
      const p = rel ? `${rel}/${d.name}` : d.name;
      return d.isDirectory()
        ? { nome: d.name, caminho: p, tipo: 'pasta', filhos: arvore(path.join(dir, d.name), p, profundidade + 1) }
        : { nome: d.name, caminho: p, tipo: 'arquivo' };
    });
}

app.get('/api/arvore', (req, res) => res.json(arvore(CFG.vault)));

app.get('/api/arquivo', (req, res) => {
  const real = dentroDoVault(req.query.caminho);
  if (!real || !fs.statSync(real).isFile()) return res.status(404).json({ erro: 'Arquivo não encontrado.' });
  if (req.query.baixar) return res.download(real, path.basename(real), { dotfiles: 'allow' });
  res.sendFile(real, { dotfiles: 'allow', headers: { 'Cache-Control': 'no-cache' } });
});

// ---------- conteúdos (pastas com capa, download e envio) ----------
const IMAGEM = /\.(png|jpe?g|webp|gif|svg)$/i;
const VIDEO = /\.(mp4|mov|webm|m4v)$/i;
const IGNORAR = (n) => n.startsWith('.') || n === 'CLAUDE.md' || n === 'AGENTS.md';

// todos os arquivos dentro de uma pasta (recursivo), com caminho relativo ao vault
function arquivosDe(absDir, relDir) {
  const lista = [];
  (function andar(dir, rel) {
    let itens = [];
    try { itens = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const d of itens) {
      if (IGNORAR(d.name)) continue;
      const abs = path.join(dir, d.name); const r = `${rel}/${d.name}`;
      if (d.isDirectory()) andar(abs, r);
      else { const st = fs.statSync(abs); lista.push({ caminho: r, nome: d.name, tamanho: st.size, mtime: st.mtimeMs }); }
    }
  })(absDir, relDir);
  return lista;
}

// a capa de um item: "capa.*" > primeira imagem da entrega > primeira imagem > vídeo mais "final"
function escolherCapa(arquivos) {
  const midia = arquivos.filter((a) => IMAGEM.test(a.nome) || VIDEO.test(a.nome)).sort((a, b) => a.caminho.localeCompare(b.caminho, 'pt', { numeric: true }));
  const peso = (a) => (/^capa\./i.test(a.nome) ? 0 : IMAGEM.test(a.nome) && a.caminho.includes('/entrega/') ? 1 : IMAGEM.test(a.nome) && !a.caminho.includes('/original/') ? 2
    : IMAGEM.test(a.nome) ? 3 : /depois|final|editado/i.test(a.nome) ? 4 : 5);
  const c = midia.sort((a, b) => peso(a) - peso(b))[0];
  return c ? { caminho: c.caminho, tipo: IMAGEM.test(c.nome) ? 'imagem' : 'video' } : null;
}

function listarConteudos() {
  const base = path.join(CFG.vault, 'conteudo');
  let tipos = [];
  try { tipos = fs.readdirSync(base, { withFileTypes: true }).filter((d) => d.isDirectory() && !IGNORAR(d.name)); } catch { return []; }
  return tipos.map((t) => {
    const absT = path.join(base, t.name); const relT = `conteudo/${t.name}`;
    const itens = fs.readdirSync(absT, { withFileTypes: true }).filter((d) => !IGNORAR(d.name)).map((d) => {
      const rel = `${relT}/${d.name}`;
      const arquivos = d.isDirectory() ? arquivosDe(path.join(absT, d.name), rel) : [(() => { const st = fs.statSync(path.join(absT, d.name)); return { caminho: rel, nome: d.name, tamanho: st.size, mtime: st.mtimeMs }; })()];
      return { nome: d.name, caminho: rel, pasta: d.isDirectory(), arquivos: arquivos.length,
        mtime: Math.max(0, ...arquivos.map((a) => a.mtime)), capa: escolherCapa(arquivos) };
    }).sort((a, b) => b.mtime - a.mtime);
    return { nome: t.name, caminho: relT, itens, mtime: Math.max(0, ...itens.map((i) => i.mtime)) };
  }).sort((a, b) => b.mtime - a.mtime);
}
app.get('/api/conteudos', (req, res) => res.json(listarConteudos()));

app.get('/api/pasta', (req, res) => {
  const real = dentroDoVault(req.query.caminho);
  if (!real || !fs.statSync(real).isDirectory()) return res.status(404).json({ erro: 'Pasta não encontrada.' });
  const rel = path.relative(CFG.vault, real).split(path.sep).join('/');
  res.json(arquivosDe(real, rel).sort((a, b) => a.caminho.localeCompare(b.caminho, 'pt', { numeric: true })));
});

// capa de vídeo: um quadro em JPG, gerado uma vez pelo ffmpeg e guardado no cache
const CAPAS = path.join(CFG.dados, 'capas'); fs.mkdirSync(CAPAS, { recursive: true });
const gerando = new Map();
const enviados = new Set(); // arquivos que vieram do computador do dono: não viram card de conversa
app.get('/api/capa', async (req, res) => {
  const real = dentroDoVault(req.query.caminho);
  if (!real || !VIDEO.test(real)) return res.status(404).end();
  const st = fs.statSync(real);
  const destino = path.join(CAPAS, crypto.createHash('sha1').update(`${real}:${st.mtimeMs}`).digest('hex') + '.jpg');
  if (!fs.existsSync(destino)) {
    if (!gerando.has(destino)) gerando.set(destino, new Promise((ok) => {
      const f = spawn('ffmpeg', ['-y', '-ss', '1', '-i', real, '-frames:v', '1', '-vf', 'scale=480:-2', '-q:v', '4', destino], { stdio: 'ignore' });
      f.on('error', () => ok()); f.on('close', () => ok());
    }).finally(() => gerando.delete(destino)));
    await gerando.get(destino);
  }
  if (!fs.existsSync(destino)) return res.status(404).end();
  res.sendFile(destino, { dotfiles: 'allow', headers: { 'Cache-Control': 'private, max-age=86400' } });
});

// envio de arquivo do computador pro servidor (corpo cru, um arquivo por requisição)
app.post('/api/enviar', (req, res) => {
  const pedida = path.resolve(CFG.vault, String(req.query.pasta || 'conteudo/enviados').replace(/^\/+/, ''));
  if (pedida.startsWith(CFG.vault + path.sep) && !fs.existsSync(pedida)) fs.mkdirSync(pedida, { recursive: true });
  const pasta = dentroDoVault(path.relative(CFG.vault, pedida));
  if (!pasta || !fs.statSync(pasta).isDirectory()) return res.status(400).json({ erro: 'Pasta inválida.' });
  let nome = path.basename(String(req.query.nome || '')).replace(/[\/\\\0]/g, '').trim();
  if (!nome || nome.startsWith('.')) return res.status(400).json({ erro: 'Nome de arquivo inválido.' });
  const ext = path.extname(nome); const raiz = nome.slice(0, nome.length - ext.length);
  for (let i = 2; fs.existsSync(path.join(pasta, nome)); i++) nome = `${raiz}-${i}${ext}`;
  const destino = path.join(pasta, nome); const tmp = `${destino}.enviando`;
  const out = fs.createWriteStream(tmp);
  req.pipe(out);
  out.on('finish', () => { fs.renameSync(tmp, destino); enviados.add(path.relative(CFG.vault, destino).split(path.sep).join('/')); res.json({ caminho: path.relative(CFG.vault, destino).split(path.sep).join('/') }); });
  const erro = () => { try { fs.unlinkSync(tmp); } catch { /* */ } if (!res.headersSent) res.status(500).json({ erro: 'Falhou no meio do envio.' }); };
  out.on('error', erro); req.on('aborted', erro);
});

// ---------- grafo (visão estilo Obsidian) ----------
function montarGrafo() {
  const nos = []; const ligacoes = []; const porNome = new Map(); const existe = new Set();
  (function andar(lista, pai) {
    for (const n of lista) {
      if (n.caminho.startsWith('.claude/hooks') || n.caminho === 'sessoes' || n.caminho.startsWith('sessoes/')) continue;
      const tipo = n.tipo === 'pasta' ? 'pasta' : /\.md$/i.test(n.nome) ? 'nota' : MIDIA.test(n.nome) ? 'midia' : 'outro';
      if (tipo === 'outro') continue;
      nos.push({ id: n.caminho, nome: n.nome.replace(/\.md$/i, ''), tipo });
      existe.add(n.caminho);
      if (tipo !== 'pasta') { const b = n.nome.replace(/\.md$/i, '').toLowerCase(); if (!porNome.has(b)) porNome.set(b, n.caminho); }
      if (pai) ligacoes.push({ de: pai, para: n.caminho, tipo: 'pasta' });
      if (n.filhos) andar(n.filhos, n.caminho);
    }
  })(arvore(CFG.vault), null);
  for (const n of nos.filter((x) => x.tipo === 'nota')) {
    let txt = ''; try { txt = fs.readFileSync(path.join(CFG.vault, n.id), 'utf8'); } catch { continue; }
    const dir = path.posix.dirname(n.id);
    const alvos = new Set();
    for (const m of txt.matchAll(/!?\[\[([^\]|#]+)/g)) { const c = porNome.get(path.posix.basename(m[1].trim()).replace(/\.md$/i, '').toLowerCase()); if (c) alvos.add(c); }
    for (const m of txt.matchAll(/\]\(([^)#\s]+)\)/g)) { const c = path.posix.normalize(path.posix.join(dir, decodeURI(m[1]))); if (existe.has(c)) alvos.add(c); }
    for (const m of txt.matchAll(/`([^`\s]+)`/g)) { const c = m[1].replace(/\/$/, ''); if (existe.has(c)) alvos.add(c); else { const r = path.posix.normalize(path.posix.join(dir, c)); if (existe.has(r)) alvos.add(r); } }
    for (const a of alvos) if (a !== n.id) ligacoes.push({ de: n.id, para: a, tipo: 'link' });
  }
  return { nos, ligacoes };
}
app.get('/api/grafo', (req, res) => res.json(montarGrafo()));

// ---------- configurações: canais ----------
async function evo(caminho, opcoes = {}) {
  const { EVO_URL, EVO_KEY } = process.env;
  if (!EVO_URL || !EVO_KEY) throw new Error('Evolution API não configurada neste servidor.');
  const r = await fetch(`${EVO_URL}${caminho}`, { ...opcoes, headers: { apikey: EVO_KEY, 'Content-Type': 'application/json', ...(opcoes.headers || {}) } });
  const corpo = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(corpo?.response?.message?.toString() || corpo?.message || `Evolution respondeu ${r.status}`);
  return corpo;
}
const INSTANCIA = () => process.env.EVO_INSTANCE || 'cerebro';
const WEBHOOK_N8N = () => process.env.WHATS_WEBHOOK || 'http://n8n:5678/webhook/core-os-whatsapp';
const estadoWhats = async () => { const e = await evo(`/instance/connectionState/${INSTANCIA()}`); return e?.instance?.state || e?.state || 'close'; };

// a instância some se alguém apagar pela Evolution: recria com o webhook do n8n
async function garantirInstancia() {
  let existe = false;
  try {
    const lista = await evo(`/instance/fetchInstances?instanceName=${INSTANCIA()}`);
    existe = (Array.isArray(lista) ? lista : [lista]).some((i) => (i?.name || i?.instance?.instanceName) === INSTANCIA());
  } catch { /* 404: não existe */ }
  if (existe) return;
  await evo('/instance/create', { method: 'POST', body: JSON.stringify({ instanceName: INSTANCIA(), integration: 'WHATSAPP-BAILEYS', qrcode: false }) });
  await evo(`/webhook/set/${INSTANCIA()}`, { method: 'POST', body: JSON.stringify({ webhook: { enabled: true, url: WEBHOOK_N8N(), byEvents: false, base64: false, events: ['MESSAGES_UPSERT'] } }) });
}

// quem pode dar ordens pelo WhatsApp (editável em Configurações; trocar aqui não mexe em código nem no n8n)
const acessoWhats = () => {
  const a = { numeros: [], chatVoce: true, ...ler('whatsapp-acesso.json', {}) };
  if (!a.numeros.length && process.env.WHATS_DONO && !ler('whatsapp-acesso.json', null)) a.numeros = [process.env.WHATS_DONO];
  return a;
};
// número comparável: só dígitos, com 55, sem o 9 extra do celular brasileiro (o WhatsApp às vezes usa sem)
function chaveNumero(n) {
  let d = String(n || '').split('@')[0].split(':')[0].replace(/\D/g, '');
  if (d.length === 10 || d.length === 11) d = `55${d}`;
  if (d.startsWith('55') && d.length === 13 && d[4] === '9') d = d.slice(0, 4) + d.slice(5);
  return d;
}

app.get('/api/config', async (req, res) => {
  const cfg = {
    whatsapp: { configurado: Boolean(process.env.EVO_URL && process.env.EVO_KEY), acesso: acessoWhats(), estado: 'indisponivel', numero: '' },
    n8n: { url: process.env.N8N_PUBLIC_URL || '' },
    servidor: { painel: `${req.protocol}://${req.get('host')}`, cerebro: CFG.vault },
  };
  if (cfg.whatsapp.configurado) {
    try {
      const est = await evo(`/instance/connectionState/${INSTANCIA()}`);
      cfg.whatsapp.estado = est?.instance?.state || est?.state || 'close';
      const lista = await evo(`/instance/fetchInstances?instanceName=${INSTANCIA()}`);
      const inst = (Array.isArray(lista) ? lista : [lista]).find((i) => (i.name || i.instance?.instanceName) === INSTANCIA());
      cfg.whatsapp.numero = String(inst?.ownerJid || inst?.instance?.owner || '').split('@')[0];
      cfg.whatsapp.nomePerfil = inst?.profileName || '';
    } catch (e) { cfg.whatsapp.erro = e.message; }
  }
  res.json(cfg);
});
// conectar: devolve o QR atual. novo=true zera a tentativa presa (logout) e começa outra do zero.
app.post('/api/config/whatsapp/conectar', async (req, res) => {
  try {
    meuNumeroCache = { n: '', t: 0 };
    await garantirInstancia();
    let estado = await estadoWhats();
    if (estado === 'open') return res.json({ estado });
    if (req.body?.novo && estado === 'connecting') {
      await evo(`/instance/logout/${INSTANCIA()}`, { method: 'DELETE' }).catch(() => {});
      estado = 'close';
    }
    const r = await evo(`/instance/connect/${INSTANCIA()}`);
    res.json({ qr: r.base64 || null, estado: 'connecting' });
  } catch (e) { res.status(502).json({ erro: e.message }); }
});
// o painel pergunta a cada 3s enquanto o QR está na tela: troca a imagem quando o WhatsApp gira o código
// e avisa quando conectou (ou quando o QR venceu de vez)
app.get('/api/config/whatsapp/qr', async (req, res) => {
  try {
    const estado = await estadoWhats();
    if (estado !== 'connecting') { if (estado === 'open') meuNumeroCache = { n: '', t: 0 }; return res.json({ estado }); }
    const r = await evo(`/instance/connect/${INSTANCIA()}`);
    res.json({ estado, qr: r.base64 || null });
  } catch (e) { res.status(502).json({ erro: e.message }); }
});
app.post('/api/config/whatsapp/desconectar', async (req, res) => {
  meuNumeroCache = { n: '', t: 0 };
  await evo(`/instance/logout/${INSTANCIA()}`, { method: 'DELETE' }).catch(() => {});
  try { res.json({ ok: true, estado: await estadoWhats() }); } catch (e) { res.status(502).json({ erro: e.message }); }
});
app.post('/api/config/whatsapp/acesso', (req, res) => {
  const numeros = [...new Set((Array.isArray(req.body?.numeros) ? req.body.numeros : [])
    .map((n) => String(n).replace(/\D/g, '')).filter((n) => n.length >= 10 && n.length <= 13)
    .map((n) => (n.length <= 11 ? `55${n}` : n)))].slice(0, 20);
  const acesso = { numeros, chatVoce: req.body?.chatVoce !== false };
  gravar('whatsapp-acesso.json', acesso);
  res.json(acesso);
});

// ---------- extras: aplicações, MCPs e primeiros testes (cada um vira pedido numa conversa) ----------
app.get('/api/extras', (req, res) => res.json(catalogo(CFG.vault)));
app.get('/api/primeiros-testes', (req, res) => res.json(PRIMEIROS_TESTES));

// ---------- motores de IA (Claude Code, Codex, Antigravity) ----------
const prefsMotor = () => ({ padrao: 'claude', whatsapp: 'claude', ...ler('motores.json', {}) });
app.get('/api/config/motores', (req, res) => res.json({ ...prefsMotor(), motores: disponiveis() }));
app.post('/api/config/motores', (req, res) => {
  const atual = prefsMotor();
  for (const k of ['padrao', 'whatsapp']) if (MOTORES[req.body?.[k]]) atual[k] = req.body[k];
  gravar('motores.json', atual);
  res.json(atual);
});

// ---------- conversas (um agente real por conversa, no motor escolhido) ----------
let conversas = ler('conversas.json', []);
for (const c of conversas) c.processando = false; // painel reiniciou: nada está rodando
const vivos = new Map(); // id -> { proc, buffer, clientes:Set }
const salvarConversas = () => gravar('conversas.json', conversas);

function promptSistema(id) {
  return [
    'Você está rodando dentro do painel do Core OS.',
    `A nota de status desta conversa é sessoes/${id}.md (caminho relativo à pasta do cérebro).`,
    'Siga o CLAUDE.md §6: crie essa nota na primeira ação de qualquer tarefa, com título, resumo de 1 ou 2 frases e checklist, e marque cada etapa ao terminar.',
  ].join(' ');
}

// Ambiente limpo: sem segredos do painel e sem variáveis de uma sessão-mãe do Claude Code
// (elas fazem o filho se achar subsessão e não gravar histórico).
function envLimpo(extra = {}) {
  // WHATS_PARA: pra quem vai o "me manda no zap" (quem falou pelo WhatsApp, ou o primeiro número autorizado)
  const env = { ...process.env, WHATS_PARA: acessoWhats().numeros[0] || '', ...extra };
  for (const k of Object.keys(env)) if (/^(CLAUDECODE|CLAUDE_CODE_|CLAUDE_PID|CLAUDE_EFFORT|AI_AGENT|CORE_OS_PASSWORD|CORE_OS_HOOK_TOKEN)/.test(k)) delete env[k];
  return env;
}

function iniciarTerminal(conv, cols = 120, rows = 32, pedido = '') {
  const jaTemClaude = fs.existsSync(path.join(PROJETOS, `${conv.id}.jsonl`));
  const { bin, args } = comandoTerminal(conv, { prompt: promptSistema(conv.id), jaTemClaude });
  const env = envLimpo({ TERM: 'xterm-256color', COLORTERM: 'truecolor', CORE_OS_SESSAO: conv.id });
  let proc;
  try { proc = pty.spawn(bin, args, { name: 'xterm-256color', cwd: CFG.vault, env, cols, rows }); } catch (e) {
    proc = pty.spawn('bash', ['-c', `echo; echo "  ${MOTORES[motorDe(conv)].nome} não está instalado neste servidor (${e.message})."; echo "  ${MOTORES[motorDe(conv)].login}"; sleep 3600`], { name: 'xterm-256color', cwd: CFG.vault, env, cols, rows });
  }
  if (!conv.sessaoMotor) { conv.iniciouTerminal = Date.now(); salvarConversas(); }
  // pedido pronto (Comece aqui, extras): o servidor escreve na caixa assim que o agente mostra o prompt, sem enviar
  const vivo = { proc, buffer: '', clientes: new Set(), pedido: String(pedido || '').replace(/[\r\n]+/g, ' ').slice(0, 2000) };
  if (vivo.pedido) setTimeout(() => { vivo.pedido = ''; }, 90_000);
  proc.onData((d) => {
    vivo.buffer = (vivo.buffer + d).slice(-300_000);
    if (vivo.pedido) {
      const tela = vivo.buffer.slice(-6000).replace(/\x1b\[[0-9;?]*[a-zA-Z]/g, '');
      if (!/trust this folder|sign in|choose how/i.test(tela) && /[❯›]/.test(tela)) {
        const texto = vivo.pedido; vivo.pedido = '';
        setTimeout(() => { try { proc.write(texto); } catch { /* encerrou */ } }, 600);
      }
    }
    conv.ultimaAtividade = Date.now();
    for (const ws of vivo.clientes) if (ws.readyState === 1) ws.send(d);
  });
  proc.onExit(() => {
    vivos.delete(conv.id);
    for (const ws of vivo.clientes) if (ws.readyState === 1) ws.send('\r\n\x1b[2m[conversa encerrada. Clique no terminal pra retomar]\x1b[0m\r\n');
  });
  vivos.set(conv.id, vivo);
  return vivo;
}

function criarConversa(extra = {}) {
  const conv = { id: crypto.randomUUID(), criada: Date.now(), ultimaAtividade: Date.now(), midias: [], numero: conversas.length + 1, motor: prefsMotor().padrao, ...extra };
  conversas.push(conv);
  salvarConversas();
  return conv;
}

app.post('/api/conversas', (req, res) => {
  const conv = criarConversa(MOTORES[req.body?.motor] ? { motor: req.body.motor } : {});
  const cols = Number(req.body?.cols) || 120;
  const rows = Number(req.body?.rows) || 32;
  iniciarTerminal(conv, Math.min(cols, 400), Math.min(rows, 200), typeof req.body?.pedido === 'string' ? req.body.pedido : '');
  res.json(conv);
});

app.delete('/api/conversas/:id', (req, res) => {
  const conv = conversas.find((c) => c.id === req.params.id);
  if (!conv) return res.status(404).end();
  vivos.get(conv.id)?.proc.kill();
  conv.arquivada = true;
  salvarConversas();
  res.json({ ok: true });
});

// ---------- leitura do registro do Claude Code ----------
const cacheRegistro = new Map(); // arquivo -> { tamanho, dados }
function lerRegistro(arquivo) {
  let st;
  try { st = fs.statSync(arquivo); } catch { return null; }
  const c = cacheRegistro.get(arquivo);
  if (c && c.tamanho === st.size) return c.dados;
  const linhas = fs.readFileSync(arquivo, 'utf8').split('\n');
  let ultimaAcao = null; let terminou = false; const escritos = [];
  for (const l of linhas) {
    if (!l) continue;
    let o; try { o = JSON.parse(l); } catch { continue; }
    const conteudo = o.message?.content;
    if (o.type !== 'assistant' || !Array.isArray(conteudo)) continue;
    const usos = conteudo.filter((b) => b.type === 'tool_use');
    if (usos.length) {
      const u = usos[usos.length - 1];
      ultimaAcao = descreverAcao(u);
      terminou = false;
      for (const x of usos) if (['Write', 'Edit'].includes(x.name) && x.input?.file_path) escritos.push(x.input.file_path);
    } else if (o.message?.stop_reason === 'end_turn') terminou = true;
  }
  const dados = { ultimaAcao, terminou, escritos, mtime: st.mtimeMs };
  cacheRegistro.set(arquivo, { tamanho: st.size, dados });
  return dados;
}

function descreverAcao(u) {
  const i = u.input || {};
  const curto = (s) => String(s || '').replace(/\s+/g, ' ').slice(0, 90);
  if (/sessoes\/[0-9a-f-]{36}\.md/.test(i.file_path || '')) return 'Atualizando a nota de status';
  if (i.description) return `${u.name}: ${curto(i.description)}`;
  if (i.file_path) return `${u.name}: ${path.basename(i.file_path)}`;
  if (i.command) return `${u.name}: ${curto(i.command)}`;
  if (i.pattern) return `${u.name}: ${curto(i.pattern)}`;
  return u.name;
}

function subagentes(id) {
  const dir = path.join(PROJETOS, id, 'subagents');
  let itens = [];
  try { itens = fs.readdirSync(dir).filter((f) => f.endsWith('.meta.json')); } catch { return []; }
  return itens.map((f) => {
    let meta = {}; try { meta = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')); } catch { /* */ }
    const reg = lerRegistro(path.join(dir, f.replace('.meta.json', '.jsonl'))) || {};
    const recente = reg.mtime && Date.now() - reg.mtime < 30_000;
    return {
      id: f.replace('.meta.json', ''),
      descricao: meta.description || 'Subagente',
      tipo: meta.agentType || '',
      status: reg.terminou ? 'concluido' : recente ? 'trabalhando' : 'parado',
      ultimaAcao: reg.ultimaAcao,
      inicio: reg.mtime,
    };
  }).sort((a, b) => (a.inicio || 0) - (b.inicio || 0));
}

function registroDe(c) {
  const m = motorDe(c);
  if (m === 'claude') return lerRegistro(path.join(PROJETOS, `${c.id}.jsonl`)) || {};
  if (m === 'codex') return lerCodex(c.sessaoMotor).reg || {};
  return {};
}

function lerNota(id) {
  try { return fs.readFileSync(path.join(CFG.vault, 'sessoes', `${id}.md`), 'utf8'); } catch { return ''; }
}

app.get('/api/estado', (req, res) => {
  res.json(conversas.filter((c) => !c.arquivada).map((c) => {
    const reg = registroDe(c);
    const nota = lerNota(c.id);
    const NOMES_CANAL = { whatsapp: 'WhatsApp', gchat: 'Google Chat', telegram: 'Telegram', slack: 'Slack' };
    const externa = c.origem && c.origem !== 'painel';
    const padrao = externa
      ? `${NOMES_CANAL[c.origem] || c.origem}${c.agente ? ` · ${c.agente}` : ''}${c.canalNome ? ` · ${c.canalNome}` : ''} · ${new Date(c.criada).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}`
      : `Conversa ${c.numero}`;
    const titulo = nota.match(/^#\s+(.+)$/m)?.[1]?.trim() || padrao;
    return {
      id: c.id, motor: motorDe(c), motorNome: MOTORES[motorDe(c)].nome, titulo, nota, numero: c.numero, criada: c.criada, origem: c.origem || 'painel', processando: Boolean(c.processando),
      ativo: vivos.has(c.id),
      trabalhando: Boolean(c.processando) || (reg.mtime ? Date.now() - reg.mtime < 8000 && !reg.terminou : false),
      ultimaAcao: reg.ultimaAcao, midias: c.midias || [], subagentes: motorDe(c) === 'claude' ? subagentes(c.id) : [],
    };
  }));
});

// histórico legível (o que foi pedido, o que o Claude respondeu e o que ele fez)
app.get('/api/conversas/:id/historico', (req, res) => {
  if (!/^[0-9a-f-]{36}$/.test(req.params.id)) return res.status(400).end();
  const conv = conversas.find((c) => c.id === req.params.id);
  if (conv && motorDe(conv) === 'codex') return res.json(lerCodex(conv.sessaoMotor).itens.slice(-300));
  if (conv && motorDe(conv) !== 'claude') return res.json((conv.historico || []).slice(-300));
  let linhas = [];
  try { linhas = fs.readFileSync(path.join(PROJETOS, `${req.params.id}.jsonl`), 'utf8').split('\n'); } catch { return res.json([]); }
  const itens = [];
  for (const l of linhas) {
    if (!l) continue;
    let o; try { o = JSON.parse(l); } catch { continue; }
    const quando = o.timestamp ? Date.parse(o.timestamp) : null;
    const c = o.message?.content;
    if (o.type === 'user' && !o.isMeta) {
      const texto = typeof c === 'string' ? c : Array.isArray(c) ? c.filter((b) => b.type === 'text').map((b) => b.text).join('\n') : '';
      if (texto && !texto.startsWith('<')) itens.push({ papel: 'voce', texto, quando });
    } else if (o.type === 'assistant' && Array.isArray(c)) {
      for (const b of c) {
        if (b.type === 'text' && b.text.trim()) itens.push({ papel: 'claude', texto: b.text.trim(), quando });
        if (b.type === 'tool_use') itens.push({ papel: 'acao', texto: descreverAcao(b), quando });
      }
    }
  }
  res.json(itens.slice(-300));
});

setInterval(() => { if (vincularCodex(conversas, CFG.vault)) salvarConversas(); }, 4000);

// ---------- mídias novas em conteudo/ viram cards da conversa que as gerou ----------
let vistos = null;
setInterval(() => {
  const atual = new Map(arquivosDe(path.join(CFG.vault, 'conteudo'), 'conteudo').filter((f) => MIDIA.test(f.caminho) && !enviados.has(f.caminho)).map((f) => [f.caminho, f.mtime]));
  if (vistos) {
    for (const [p, m] of atual) {
      if (vistos.get(p) === m) continue;
      const dona = conversas
        .filter((c) => !c.arquivada)
        .map((c) => ({ c, t: Math.max(c.ultimaAtividade || 0, registroDe(c).mtime || 0) }))
        .filter((x) => Date.now() - x.t < 180_000)
        .sort((a, b) => b.t - a.t)[0]?.c;
      if (dona && !dona.midias.includes(p)) { dona.midias.push(p); salvarConversas(); }
    }
  }
  vistos = atual;
}, 3000);

// ---------- ponte do WhatsApp: só números autorizados dão ordens; a resposta volta pra quem mandou ----------
// O n8n repassa toda mensagem de conversa individual; quem decide quem é atendido é este painel
// (Configurações › WhatsApp › Quem pode dar ordens). Cada conversa vira um item do painel (origem: whatsapp).
// "/nova" (ou /clear) abre outra; depois de 6h parado, a próxima mensagem também abre outra.
const SEIS_HORAS = 6 * 3600_000;
const COMANDO_NOVA = /^\s*\/(nova|novo|clear|limpar)\b\s*/i;
const PROMPT_WHATS = [
  'Esta conversa acontece pelo WhatsApp: o dono te mandou mensagem e a sua resposta final volta pra ele como mensagem.',
  'Responda curto, em texto simples de WhatsApp (sem tabela, sem título, no máximo um negrito com *asteriscos*).',
  'Pra ler conversas, achar contato ou mandar mensagem e arquivo pra outra pessoa ou pro dono, use a skill whatsapp e siga as regras dela.',
].join(' ');
const filaWhats = [];
let whatsOcupado = false;

// devolve o número pra onde a resposta vai, ou null se quem mandou não está autorizado
function autorizado({ deMim, chat, eu }) {
  const a = acessoWhats();
  const c = chaveNumero(chat);
  if (!c) return null;
  if (deMim) return a.chatVoce && c === chaveNumero(eu) ? String(chat).split('@')[0] : null; // chat "Você"
  return a.numeros.some((n) => chaveNumero(n) === c) ? String(chat).split('@')[0] : null;
}

function ponteWhatsapp(req, res) {
  const token = req.get('x-core-os-token') || '';
  if (!CFG.tokenPonte || !crypto.timingSafeEqual(hash(token), hash(CFG.tokenPonte))) return res.status(401).json({ erro: 'token' });
  const b = req.body || {};
  const texto = String(b.texto || '').trim();
  const tipo = String(b.tipo || 'texto');
  // formato antigo do fluxo (só chat "Você"): continua funcionando até o n8n ser atualizado
  const para = b.chat ? autorizado({ deMim: Boolean(b.deMim), chat: b.chat, eu: b.eu }) : (acessoWhats().chatVoce ? '' : null);
  if (para === null) return res.status(202).json({ ok: true, ignorado: true });
  if (tipo === 'texto' && !texto) return res.status(400).json({ erro: 'texto vazio' });
  filaWhats.push({ texto, tipo, para });
  res.status(202).json({ ok: true, posicao: filaWhats.length });
  processarWhats();
}

// uma conversa ativa por número que fala com o cérebro
function conversaDoWhats(para, forcarNova) {
  const todos = ler('whatsapp.json', {});
  const chave = chaveNumero(para) || 'dono';
  const est = todos[chave] || {};
  const atual = conversas.find((c) => c.id === est.conversa && !c.arquivada);
  const parada = !est.ultima || Date.now() - est.ultima > SEIS_HORAS;
  // se o dono assumiu essa conversa pelo terminal do painel, o WhatsApp abre outra pra não brigarem
  if (atual && !forcarNova && !parada && !vivos.has(atual.id) && motorDe(atual) === prefsMotor().whatsapp) return atual;
  const nova = criarConversa({ origem: 'whatsapp', motor: prefsMotor().whatsapp, whatsDe: para });
  marcarWhats(para, nova.id);
  return nova;
}
function marcarWhats(para, conversa) {
  const todos = ler('whatsapp.json', {});
  delete todos.conversa; delete todos.ultima; // formato antigo
  todos[chaveNumero(para) || 'dono'] = { conversa, ultima: Date.now() };
  gravar('whatsapp.json', todos);
}

async function rodarClaude(conv, texto, para) {
  const jaTemClaude = fs.existsSync(path.join(PROJETOS, `${conv.id}.jsonl`));
  const { resposta, sessao } = await rodarSemTela(conv, texto, {
    prompt: `${promptSistema(conv.id)} ${PROMPT_WHATS}`, env: envLimpo({ CORE_OS_SESSAO: conv.id, WHATS_PARA: para || '' }), cwd: CFG.vault, jaTemClaude,
  });
  if (sessao && !conv.sessaoMotor) conv.sessaoMotor = sessao;
  if (motorDe(conv) === 'antigravity') {
    conv.historico = [...(conv.historico || []), { papel: 'voce', texto, quando: Date.now() - 1 }, { papel: 'claude', texto: resposta, quando: Date.now() }].slice(-300);
  }
  salvarConversas();
  return resposta;
}

async function processarWhats() {
  if (whatsOcupado || !filaWhats.length) return;
  whatsOcupado = true;
  const { texto: bruto, tipo, para } = filaWhats.shift();
  try {
    if (tipo !== 'texto') { await responderWhats('Por enquanto eu só leio texto. Escreve o que você precisa que eu faço.', para); return; }
    const pediuNova = COMANDO_NOVA.test(bruto);
    const texto = bruto.replace(COMANDO_NOVA, '').trim();
    const conv = conversaDoWhats(para, pediuNova);
    if (!texto) { await responderWhats('Conversa nova aberta. Pode mandar.', para); return; }
    conv.processando = true; conv.ultimaAtividade = Date.now(); salvarConversas();
    let resposta;
    try { resposta = await rodarClaude(conv, texto, para); } finally { conv.processando = false; conv.ultimaAtividade = Date.now(); salvarConversas(); }
    marcarWhats(para, conv.id);
    await responderWhats(resposta.slice(0, 3500) || 'Feito.', para);
  } catch (e) {
    console.error('[whatsapp]', e);
  } finally {
    whatsOcupado = false;
    setImmediate(processarWhats);
  }
}

// o número conectado no painel (lido da Evolution, guardado por 10 min; zera ao reconectar)
let meuNumeroCache = { n: '', t: 0 };
async function meuNumero() {
  if (meuNumeroCache.n && Date.now() - meuNumeroCache.t < 600_000) return meuNumeroCache.n;
  try {
    const lista = await evo(`/instance/fetchInstances?instanceName=${INSTANCIA()}`);
    const inst = (Array.isArray(lista) ? lista : [lista]).find((i) => (i.name || i.instance?.instanceName) === INSTANCIA());
    const n = String(inst?.ownerJid || '').split('@')[0];
    if (n) meuNumeroCache = { n, t: Date.now() };
  } catch { /* sem conexão */ }
  return meuNumeroCache.n;
}

async function responderWhats(texto, para) {
  const { EVO_URL, EVO_KEY } = process.env;
  const eu = await meuNumero();
  const numero = para || eu;
  if (!EVO_URL || !numero) return console.log('[whatsapp] sem Evolution ou número, resposta:', texto);
  // ⁣ (invisível) marca a resposta no chat "Você": o fluxo ignora, então não entra em loop
  const marca = chaveNumero(numero) === chaveNumero(eu) ? '⁣' : '';
  try {
    const r = await fetch(`${EVO_URL}/message/sendText/${INSTANCIA()}`, {
      method: 'POST', headers: { apikey: EVO_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ number: numero, text: `${marca}${texto}` }),
    });
    if (!r.ok) console.error('[whatsapp] Evolution recusou a resposta:', r.status, (await r.text()).slice(0, 200));
  } catch (e) { console.error('[whatsapp] falhou ao responder:', e.message); }
}

// ---------- ponte genérica de canais (Google Chat, Telegram, Slack...) ----------
// O n8n recebe a mensagem do canal e faz POST aqui:
//   { canal: 'gchat', chave: 'spaces/AAA/threads/BBB', de: 'fulano@empresa.com', nome: 'Fulano',
//     texto: 'oi', agente: 'sdr' (opcional), callback: 'https://n8n.../webhook/core-os-gchat-resposta', meta: {...} }
// Respondemos 202 na hora e, quando o Claude terminar, fazemos POST no callback com { texto, canal, chave, meta, conversa }.
// Quem pode falar fica em dados/canais-acesso.json: { "gchat": { "permitidos": ["eu@x.com", "@empresa.com"] } }
// (vazio ou ausente = ninguém; "*" = qualquer um). Cada chave (sala/thread) vira uma conversa do painel.
const PROMPT_CANAL = (canal, nome, agente) => [
  `Esta conversa acontece pelo canal ${canal}${nome ? ` com ${nome}` : ''}: a pessoa te mandou mensagem e a sua resposta final volta pra ela como mensagem nesse canal.`,
  'Responda curto, em texto simples de chat (sem tabela, sem título; negrito só com *asteriscos*).',
  agente ? `Esta sala é do especialista "${agente}": delegue o pedido ao subagente ${agente} (.claude/agents/${agente}.md) e devolva a resposta dele.` : 'Se a mensagem pedir um especialista (ex.: "@sdr ..."), delegue ao subagente correspondente em .claude/agents/.',
].join(' ');
const filaCanal = [];
let canalOcupado = false;

function acessoCanal(canal) {
  const a = ler('canais-acesso.json', {});
  const lista = a[canal]?.permitidos;
  if (Array.isArray(lista)) return lista;
  // sem arquivo: aceita a variável GCHAT_PERMITIDOS só pro gchat
  if (canal === 'gchat' && process.env.GCHAT_PERMITIDOS) return process.env.GCHAT_PERMITIDOS.split(',').map((s) => s.trim()).filter(Boolean);
  return [];
}
function canalAutorizado(canal, de) {
  const quem = String(de || '').trim().toLowerCase();
  return acessoCanal(canal).some((p) => {
    const r = String(p).trim().toLowerCase();
    if (r === '*') return true;
    if (r.startsWith('@')) return quem.endsWith(r);
    return quem === r;
  });
}
app.post('/api/config/canais/acesso', (req, res) => {
  const b = req.body || {};
  const canal = String(b.canal || '').replace(/[^a-z0-9_-]/gi, '');
  if (!canal) return res.status(400).json({ erro: 'canal' });
  const a = ler('canais-acesso.json', {});
  a[canal] = { permitidos: (Array.isArray(b.permitidos) ? b.permitidos : []).map(String).map((s) => s.trim()).filter(Boolean) };
  gravar('canais-acesso.json', a);
  res.json(a);
});
app.get('/api/config/canais/acesso', (req, res) => res.json(ler('canais-acesso.json', {})));

function ponteCanal(req, res) {
  const token = req.get('x-core-os-token') || '';
  if (!CFG.tokenPonte || !crypto.timingSafeEqual(hash(token), hash(CFG.tokenPonte))) return res.status(401).json({ erro: 'token' });
  const b = req.body || {};
  const canal = String(b.canal || '').replace(/[^a-z0-9_-]/gi, '').toLowerCase();
  const chave = String(b.chave || '').trim();
  const texto = String(b.texto || '').trim();
  const callback = String(b.callback || '').trim();
  const agente = String(b.agente || '').replace(/[^a-z0-9_-]/gi, '').toLowerCase();
  if (!canal || !chave) return res.status(400).json({ erro: 'canal e chave são obrigatórios' });
  if (!/^https?:\/\//.test(callback)) return res.status(400).json({ erro: 'callback precisa ser uma URL http(s)' });
  if (!canalAutorizado(canal, b.de)) { console.log(`[${canal}] ignorado: ${b.de || '(sem remetente)'} não está em canais-acesso.json`); return res.status(202).json({ ok: true, ignorado: true }); }
  if (!texto) return res.status(400).json({ erro: 'texto vazio' });
  filaCanal.push({ canal, chave, texto, callback, agente, de: String(b.de || ''), nome: String(b.nome || ''), meta: b.meta ?? {} });
  res.status(202).json({ ok: true, posicao: filaCanal.length });
  processarCanal();
}

// uma conversa ativa por chave (sala/thread); /nova ou 6h parada abre outra
function conversaDoCanal(canal, chave, forcarNova, extra) {
  const todos = ler('canais.json', {});
  const k = `${canal}:${chave}`;
  const est = todos[k] || {};
  const atual = conversas.find((c) => c.id === est.conversa && !c.arquivada);
  const parada = !est.ultima || Date.now() - est.ultima > SEIS_HORAS;
  if (atual && !forcarNova && !parada && !vivos.has(atual.id) && motorDe(atual) === prefsMotor().whatsapp) { todos[k].ultima = Date.now(); gravar('canais.json', todos); return atual; }
  const nova = criarConversa({ origem: canal, motor: prefsMotor().whatsapp, canalChave: chave, ...extra });
  todos[k] = { conversa: nova.id, ultima: Date.now() };
  gravar('canais.json', todos);
  return nova;
}

async function entregarCanal(item, texto) {
  try {
    const r = await fetch(item.callback, {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'x-core-os-token': CFG.tokenPonte },
      body: JSON.stringify({ canal: item.canal, chave: item.chave, de: item.de, texto, meta: item.meta }),
    });
    if (!r.ok) console.error(`[${item.canal}] callback recusou:`, r.status, (await r.text()).slice(0, 200));
  } catch (e) { console.error(`[${item.canal}] callback falhou:`, e.message); }
}

async function processarCanal() {
  if (canalOcupado || !filaCanal.length) return;
  canalOcupado = true;
  const item = filaCanal.shift();
  try {
    const pediuNova = COMANDO_NOVA.test(item.texto);
    const texto = item.texto.replace(COMANDO_NOVA, '').trim();
    const conv = conversaDoCanal(item.canal, item.chave, pediuNova, { canalDe: item.de, canalNome: item.nome, agente: item.agente || undefined });
    if (!texto) { await entregarCanal(item, 'Conversa nova aberta. Pode mandar.'); return; }
    conv.processando = true; conv.ultimaAtividade = Date.now(); salvarConversas();
    let resposta;
    try {
      const jaTemClaude = fs.existsSync(path.join(PROJETOS, `${conv.id}.jsonl`));
      const r = await rodarSemTela(conv, texto, {
        prompt: `${promptSistema(conv.id)} ${PROMPT_CANAL(item.canal, item.nome || item.de, item.agente)}`,
        env: envLimpo({ CORE_OS_SESSAO: conv.id, CORE_OS_CANAL: item.canal, CORE_OS_CANAL_DE: item.de, CORE_OS_CANAL_CHAVE: item.chave }),
        cwd: CFG.vault, jaTemClaude,
      });
      resposta = r.resposta; if (r.sessao && !conv.sessaoMotor) conv.sessaoMotor = r.sessao;
      if (motorDe(conv) === 'antigravity') conv.historico = [...(conv.historico || []), { papel: 'voce', texto, quando: Date.now() - 1 }, { papel: 'claude', texto: resposta, quando: Date.now() }].slice(-300);
    } finally { conv.processando = false; conv.ultimaAtividade = Date.now(); salvarConversas(); }
    await entregarCanal(item, (resposta || 'Feito.').slice(0, 4000));
  } catch (e) {
    console.error(`[${item.canal}]`, e);
    await entregarCanal(item, 'Deu erro aqui do meu lado. Tenta de novo em instantes.');
  } finally {
    canalOcupado = false;
    setImmediate(processarCanal);
  }
}

// ---------- estáticos ----------
const vendor = (p) => path.join(AQUI, 'node_modules', p);
app.use('/vendor/xterm', express.static(vendor('@xterm/xterm')));
app.use('/vendor/xterm-fit', express.static(vendor('@xterm/addon-fit')));
app.use('/vendor/marked', express.static(vendor('marked')));
app.use('/vendor/xterm-unicode', express.static(vendor('@xterm/addon-unicode11')));
app.use(express.static(path.join(AQUI, 'public')));

// ---------- websocket dos terminais ----------
const servidor = createServer(app);
const wss = new WebSocketServer({ noServer: true });
servidor.on('upgrade', (req, socket, head) => {
  const url = new URL(req.url, 'http://x');
  const conv = conversas.find((c) => c.id === url.searchParams.get('conversa'));
  const origemOk = !req.headers.origin || new URL(req.headers.origin).host === req.headers.host;
  if (url.pathname !== '/ws' || !logado(req) || !conv || !origemOk) { socket.destroy(); return; }
  wss.handleUpgrade(req, socket, head, (ws) => {
    const cols = Number(url.searchParams.get('cols')) || 120;
    const rows = Number(url.searchParams.get('rows')) || 32;
    const vivo = vivos.get(conv.id) || iniciarTerminal(conv, cols, rows);
    vivo.clientes.add(ws);
    if (vivo.buffer) ws.send(vivo.buffer);
    ws.on('message', (raw) => {
      let m; try { m = JSON.parse(raw); } catch { return; }
      const v = vivos.get(conv.id);
      if (!v) return;
      if (m.t === 'i') v.proc.write(m.d);
      if (m.t === 'r' && m.cols > 0 && m.rows > 0) v.proc.resize(Math.min(m.cols, 400), Math.min(m.rows, 200));
    });
    ws.on('close', () => vivo.clientes.delete(ws));
  });
});

servidor.listen(CFG.porta, CFG.host, () => {
  console.log(`Core OS no ar em http://${CFG.host}:${CFG.porta}  ·  cérebro: ${CFG.vault}`);
});
