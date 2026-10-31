// Core OS · interface do painel
import { marked } from '/vendor/marked/lib/marked.esm.js';

// ---------- ícones (traço no estilo SF Symbols, desenhados em 24x24) ----------
const P = {
  arvore: '<path d="M3 5.5h6M3 5.5v13M3 12h6M3 18.5h6"/><rect x="12" y="3" width="9" height="5" rx="1.6"/><rect x="12" y="9.5" width="9" height="5" rx="1.6"/><rect x="12" y="16" width="9" height="5" rx="1.6"/>',
  mais: '<path d="M12 5v14M5 12h14"/>',
  conversaNova: '<path d="M20 11.5a7.5 7.5 0 0 1-11 6.6L4 19.5l1.4-4.3A7.5 7.5 0 1 1 20 11.5z"/><path d="M12.5 8.5v6M9.5 11.5h6"/>',
  grade: '<rect x="3.5" y="3.5" width="7" height="7" rx="1.8"/><rect x="13.5" y="3.5" width="7" height="7" rx="1.8"/><rect x="3.5" y="13.5" width="7" height="7" rx="1.8"/><rect x="13.5" y="13.5" width="7" height="7" rx="1.8"/>',
  mira: '<circle cx="12" cy="12" r="7.5"/><circle cx="12" cy="12" r="2"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/>',
  sol: '<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4"/>',
  lua: '<path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z"/>',
  sair: '<path d="M14 4h4.5A1.5 1.5 0 0 1 20 5.5v13a1.5 1.5 0 0 1-1.5 1.5H14"/><path d="M10 16l4-4-4-4M14 12H4"/>',
  fechar: '<path d="M6 6l12 12M18 6L6 18"/>',
  recarregar: '<path d="M20 12a8 8 0 1 1-2.3-5.6"/><path d="M20 4v5h-5"/>',
  relogio: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  raio: '<path d="M13 2 4 14h7l-1 8 9-12h-7z"/>',
  seta: '<path d="M9 6l6 6-6 6"/>',
  pasta: '<path d="M3.5 7.5A2 2 0 0 1 5.5 5.5h4l2 2h7a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2z"/>',
  doc: '<path d="M14 3.5H7a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8.5z"/><path d="M14 3.5v5h5M8.5 13h7M8.5 16.5h5"/>',
  imagem: '<rect x="3.5" y="4.5" width="17" height="15" rx="2.5"/><circle cx="9" cy="10" r="1.7"/><path d="M20.5 15.5l-4.5-4.5-8.5 8.5"/>',
  filme: '<rect x="3.5" y="5" width="17" height="14" rx="2.5"/><path d="M10 9.5v5l4.5-2.5z"/>',
  terminal: '<rect x="3" y="4.5" width="18" height="15" rx="2.5"/><path d="M7 9.5l3 2.5-3 2.5M12.5 15h4.5"/>',
  agente: '<rect x="5" y="8" width="14" height="11" rx="3"/><path d="M12 4.5V8M9.5 13h.01M14.5 13h.01"/><circle cx="12" cy="4" r="1"/>',
  check: '<circle cx="12" cy="12" r="8.5"/><path d="M8.5 12.3l2.4 2.4 4.7-5"/>',
  circulo: '<circle cx="12" cy="12" r="8.5"/>',
  focar: '<path d="M4 9V5.5A1.5 1.5 0 0 1 5.5 4H9M15 4h3.5A1.5 1.5 0 0 1 20 5.5V9M20 15v3.5a1.5 1.5 0 0 1-1.5 1.5H15M9 20H5.5A1.5 1.5 0 0 1 4 18.5V15"/>',
  parar: '<rect x="6" y="6" width="12" height="12" rx="2.5"/>',
  grafo: '<circle cx="6" cy="7" r="2.2"/><circle cx="17.5" cy="5.5" r="1.8"/><circle cx="12" cy="13" r="2.6"/><circle cx="5.5" cy="18" r="1.8"/><circle cx="18.5" cy="17.5" r="2.2"/><path d="M7.8 8.4l2.4 2.6M16.2 6.6l-2.9 4.4M10 14.6l-3 2.2M14.5 14.3l2.3 1.7"/>',
  engrenagem: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
  zap: '<path d="M20 11.6a8.2 8.2 0 0 1-12 7.3L4 20l1.2-3.8A8.2 8.2 0 1 1 20 11.6z"/><path d="M9 8.8c0 3.4 2.8 6.2 6.2 6.2l1.3-1.6-2-1-1 .9a4 4 0 0 1-2.8-2.8l.9-1-1-2z"/>',
  fluxo: '<rect x="3" y="9" width="5" height="6" rx="1.5"/><rect x="16" y="4" width="5" height="6" rx="1.5"/><rect x="16" y="14" width="5" height="6" rx="1.5"/><path d="M8 12h3.5a1.5 1.5 0 0 0 1.5-1.5V8.5A1.5 1.5 0 0 1 14.5 7H16M11 12h0.5a1.5 1.5 0 0 1 1.5 1.5v2A1.5 1.5 0 0 0 14.5 17H16"/>',
  enviar: '<path d="M12 15V4M7.5 8.5L12 4l4.5 4.5"/><path d="M4 14.5v3A2.5 2.5 0 0 0 6.5 20h11a2.5 2.5 0 0 0 2.5-2.5v-3"/>',
  baixar: '<path d="M12 4v11M7.5 10.5L12 15l4.5-4.5"/><path d="M4 14.5v3A2.5 2.5 0 0 0 6.5 20h11a2.5 2.5 0 0 0 2.5-2.5v-3"/>',
  voltar: '<path d="M15 6l-6 6 6 6"/>',
  play: '<path d="M8 5.5v13l10.5-6.5z"/>',
  globo: '<circle cx="12" cy="12" r="8.5"/><path d="M3.5 12h17M12 3.5c2.3 2.4 3.5 5.2 3.5 8.5s-1.2 6.1-3.5 8.5c-2.3-2.4-3.5-5.2-3.5-8.5s1.2-6.1 3.5-8.5z"/>',
};
const ic = (n) => `<svg class="i" viewBox="0 0 24 24" aria-hidden="true">${P[n]}</svg>`;

// ---------- utilidades ----------
const $ = (s, r = document) => r.querySelector(s);
const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const url = (caminho) => `/api/arquivo?caminho=${encodeURIComponent(caminho)}`;
const tipoDe = (c) => (/\.(png|jpe?g|webp|gif|svg)$/i.test(c) ? 'imagem' : /\.(mp4|mov|webm|m4v)$/i.test(c) ? 'video' : /\.(md|txt|json|sh|js|csv|canvas)$/i.test(c) ? 'texto' : 'outro');
const nomeDe = (c) => c.split('/').pop();
const guardar = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* */ } };
const recuperar = (k, p) => { try { return JSON.parse(localStorage.getItem(k)) ?? p; } catch { return p; } };
async function api(caminho, opcoes = {}) {
  const r = await fetch(caminho, { headers: { 'Content-Type': 'application/json' }, ...opcoes });
  if (r.status === 401) { mostrarLogin(); throw new Error('login'); }
  return r.headers.get('content-type')?.includes('json') ? r.json() : r.text();
}

// ---------- tema ----------
function aplicarTema(t) { document.documentElement.dataset.tema = t; guardar('tema', t); pintarDock(); }
aplicarTema(recuperar('tema', matchMedia('(prefers-color-scheme: dark)').matches ? 'escuro' : 'claro'));

// ---------- login ----------
function mostrarLogin() { $('#app').hidden = true; $('#login').hidden = false; $('#senha').focus(); }
$('#form-login').addEventListener('submit', async (e) => {
  e.preventDefault();
  const r = await fetch('/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ senha: $('#senha').value }) });
  if (r.ok) { $('#login').hidden = true; iniciar(); } else { $('#login-erro').textContent = (await r.json()).erro; $('#senha').select(); }
});

// ---------- estado ----------
const S = {
  conversas: [],
  ativa: recuperar('ativa', 'mesa'), // id da conversa ou "mesa"
  terminais: new Map(), // id -> { term, fit, ws, elemento }
  cam: { x: 0, y: 0, z: 1 },
};
const espaco = () => recuperar(`espaco:${S.ativa}`, { pos: {}, abertos: [], cam: null });
const salvarEspaco = (e) => guardar(`espaco:${S.ativa}`, e);

// ---------- câmera do canvas ----------
const palco = $('#palco');
const mundo = $('#mundo');
function aplicarCamera(mostrarZoom) {
  const { x, y, z } = S.cam;
  mundo.style.transform = `translate(${x}px, ${y}px) scale(${z})`;
  palco.style.backgroundPosition = `${x}px ${y}px`;
  palco.style.backgroundSize = `${22 * z}px ${22 * z}px`;
  const e = espaco(); e.cam = S.cam; salvarEspaco(e);
  if (mostrarZoom) {
    const ind = $('#zoom-indicador'); ind.textContent = `${Math.round(z * 100)}%`; ind.classList.add('visivel');
    clearTimeout(aplicarCamera.t); aplicarCamera.t = setTimeout(() => ind.classList.remove('visivel'), 900);
  }
}
function zoomEm(px, py, fator) {
  const z = Math.min(2, Math.max(0.2, S.cam.z * fator));
  const k = z / S.cam.z;
  S.cam.x = px - (px - S.cam.x) * k; S.cam.y = py - (py - S.cam.y) * k; S.cam.z = z;
  aplicarCamera(true);
}
function centralizarEm(rect, zMax = 1) {
  const larg = innerWidth - 360 - (aberta('arvore') ? 300 : 0);
  const alt = innerHeight - 140;
  const z = Math.min(zMax, larg / (rect.w + 120), alt / (rect.h + 120));
  const cx = (aberta('arvore') ? 296 : 0) + larg / 2;
  S.cam = { z, x: cx - (rect.x + rect.w / 2) * z, y: (innerHeight - 70) / 2 - (rect.y + rect.h / 2) * z };
  mundo.style.transition = 'transform .6s cubic-bezier(.34,1.2,.64,1)';
  aplicarCamera(true);
  setTimeout(() => { mundo.style.transition = ''; }, 650);
}
function centralizarTudo() {
  const cards = [...mundo.querySelectorAll('.card, .boas-vindas')];
  if (!cards.length) return;
  let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
  for (const c of cards) {
    const x = parseFloat(c.style.left), y = parseFloat(c.style.top);
    x1 = Math.min(x1, x); y1 = Math.min(y1, y); x2 = Math.max(x2, x + c.offsetWidth); y2 = Math.max(y2, y + c.offsetHeight);
  }
  centralizarEm({ x: x1, y: y1, w: x2 - x1, h: y2 - y1 });
}

palco.addEventListener('wheel', (e) => {
  const rolavel = e.target.closest('.card-corpo, .xterm');
  if (e.ctrlKey || e.metaKey) { e.preventDefault(); zoomEm(e.clientX, e.clientY, Math.exp(-e.deltaY * 0.01)); return; }
  if (rolavel) return;
  e.preventDefault();
  S.cam.x -= e.deltaX; S.cam.y -= e.deltaY; aplicarCamera();
}, { passive: false });

palco.addEventListener('pointerdown', (e) => {
  if (e.target !== palco && e.target !== mundo) return;
  document.activeElement?.blur();
  const ini = { x: e.clientX, y: e.clientY, cx: S.cam.x, cy: S.cam.y };
  palco.classList.add('arrastando'); palco.setPointerCapture(e.pointerId);
  const mover = (m) => { S.cam.x = ini.cx + m.clientX - ini.x; S.cam.y = ini.cy + m.clientY - ini.y; aplicarCamera(); };
  const soltar = () => { palco.classList.remove('arrastando'); palco.removeEventListener('pointermove', mover); };
  palco.addEventListener('pointermove', mover);
  palco.addEventListener('pointerup', soltar, { once: true });
});

// ---------- cards ----------
function criarCard({ chave, classe, icone, titulo, sub, x, y, w, h, corpo, extras = '', fechavel = true }) {
  const e = espaco();
  const pos = e.pos[chave] || { x, y };
  const card = el('div', `card ${classe}`);
  card.dataset.chave = chave;
  Object.assign(card.style, { left: `${pos.x}px`, top: `${pos.y}px`, width: `${w}px`, height: h ? `${h}px` : 'auto' });
  card.innerHTML = `<div class="card-topo">${ic(icone)}<span class="card-titulo">${esc(titulo)} <span class="card-sub">${esc(sub || '')}</span></span>${extras}${fechavel ? `<button class="icone-botao" data-fechar title="Fechar">${ic('fechar')}</button>` : ''}</div><div class="card-corpo"></div>`;
  if (corpo) card.querySelector('.card-corpo').append(corpo);
  arrastavel(card);
  card.querySelector('[data-fechar]')?.addEventListener('click', () => fecharArquivo(chave.replace(/^arq:/, '')));
  card.addEventListener('pointerdown', () => focarCard(card));
  mundo.append(card);
  return card;
}
function focarCard(card) { mundo.querySelectorAll('.card.em-foco').forEach((c) => c.classList.remove('em-foco')); card.classList.add('em-foco'); }
let zTopo = 10;
function arrastavel(card) {
  const topo = card.querySelector('.card-topo');
  topo.addEventListener('pointerdown', (e) => {
    if (e.target.closest('button')) return;
    card.style.zIndex = ++zTopo;
    const ini = { x: e.clientX, y: e.clientY, l: parseFloat(card.style.left), t: parseFloat(card.style.top) };
    topo.setPointerCapture(e.pointerId);
    const mover = (m) => {
      card.style.left = `${ini.l + (m.clientX - ini.x) / S.cam.z}px`;
      card.style.top = `${ini.t + (m.clientY - ini.y) / S.cam.z}px`;
      desenharLigacoes();
    };
    const soltar = () => {
      topo.removeEventListener('pointermove', mover);
      const es = espaco(); es.pos[card.dataset.chave] = { x: parseFloat(card.style.left), y: parseFloat(card.style.top) }; salvarEspaco(es);
    };
    topo.addEventListener('pointermove', mover);
    topo.addEventListener('pointerup', soltar, { once: true });
  });
}

function corpoDeArquivo(caminho) {
  const t = tipoDe(caminho);
  if (t === 'imagem') { const i = el('img'); i.src = url(caminho); i.alt = nomeDe(caminho); i.draggable = false; return i; }
  if (t === 'video') { const v = el('video'); v.src = url(caminho); v.controls = true; v.playsInline = true; v.preload = 'metadata'; return v; }
  const d = el('div', 'md', '<p style="color:var(--texto-3)">Carregando…</p>');
  api(url(caminho)).then((txt) => { d.innerHTML = renderizar(String(txt), caminho); });
  return d;
}
function renderizar(txt, caminho) {
  const dir = caminho.split('/').slice(0, -1).join('/');
  if (!caminho.endsWith('.md')) return `<pre><code>${esc(txt)}</code></pre>`;
  let fm = '';
  txt = txt.replace(/^---\n([\s\S]*?)\n---\n?/, (_, m) => { fm = m; return ''; });
  const resolver = (alvo) => (/^(https?:|\/|data:)/.test(alvo) ? alvo : url([dir, alvo].filter(Boolean).join('/')));
  txt = txt.replace(/!\[\[([^\]|]+)(\|[^\]]*)?\]\]/g, (_, a) => `![](${encodeURI(a)})`).replace(/\[\[([^\]|]+)(\|([^\]]*))?\]\]/g, (_, a, __, r) => `**${r || a}**`);
  const html = marked.parse(txt, { gfm: true });
  const tmp = el('div', '', html);
  tmp.querySelectorAll('img').forEach((i) => { i.src = resolver(decodeURI(i.getAttribute('src'))); });
  tmp.querySelectorAll('script, iframe, object').forEach((n) => n.remove());
  return (fm ? `<div class="frontmatter">${esc(fm)}</div>` : '') + tmp.innerHTML;
}

function cardArquivo(caminho, x, y) {
  const t = tipoDe(caminho);
  const tam = t === 'imagem' ? { w: 380, h: 430 } : t === 'video' ? { w: 340, h: 600 } : { w: 560, h: 620 };
  return criarCard({
    chave: `arq:${caminho}`, classe: t === 'texto' || t === 'outro' ? 'card-doc' : 'card-midia',
    icone: t === 'imagem' ? 'imagem' : t === 'video' ? 'filme' : 'doc',
    titulo: nomeDe(caminho), sub: caminho.split('/').slice(-2, -1)[0] || '', x, y, ...tam, corpo: corpoDeArquivo(caminho),
  });
}

function abrirArquivo(caminho) {
  const e = espaco();
  const jaTem = mundo.querySelector(`.card[data-chave="${CSS.escape(`arq:${caminho}`)}"]`);
  if (jaTem) { focarCard(jaTem); centralizarEm({ x: parseFloat(jaTem.style.left), y: parseFloat(jaTem.style.top), w: jaTem.offsetWidth, h: jaTem.offsetHeight }); return; }
  if (!e.abertos.includes(caminho)) e.abertos.push(caminho);
  const cx = (innerWidth / 2 - S.cam.x) / S.cam.z - 250 + (e.abertos.length % 5) * 24;
  const cy = (innerHeight / 2 - S.cam.y) / S.cam.z - 300 + (e.abertos.length % 5) * 24;
  e.pos[`arq:${caminho}`] = e.pos[`arq:${caminho}`] || { x: cx, y: cy };
  salvarEspaco(e);
  focarCard(cardArquivo(caminho, cx, cy));
  marcarArvore(caminho);
}
function fecharArquivo(caminho) {
  const e = espaco(); e.abertos = e.abertos.filter((c) => c !== caminho); delete e.pos[`arq:${caminho}`]; salvarEspaco(e);
  mundo.querySelector(`.card[data-chave="${CSS.escape(`arq:${caminho}`)}"]`)?.remove();
}

// ---------- terminal de cada conversa ----------
function terminalDe(conv) {
  if (S.terminais.has(conv.id)) return S.terminais.get(conv.id);
  const elemento = el('div');
  elemento.style.height = '100%';
  const term = new Terminal({
    fontFamily: '"SF Mono", Menlo, "DejaVu Sans Mono", Consolas, monospace', fontSize: 13, lineHeight: 1.15, letterSpacing: 0, cursorBlink: true, allowProposedApi: true, scrollback: 5000,
    theme: { background: '#1c1c1e', foreground: '#f5f5f7', cursor: '#0a84ff', selectionBackground: 'rgba(10,132,255,.35)' },
  });
  const fit = new FitAddon.FitAddon();
  term.loadAddon(fit);
  term.loadAddon(new Unicode11Addon.Unicode11Addon());
  term.unicode.activeVersion = '11';
  const t = { term, fit, ws: null, elemento, aberto: false };
  term.onData((d) => t.ws?.readyState === 1 && t.ws.send(JSON.stringify({ t: 'i', d })));
  term.onResize(({ cols, rows }) => t.ws?.readyState === 1 && t.ws.send(JSON.stringify({ t: 'r', cols, rows })));
  S.terminais.set(conv.id, t);
  return t;
}
function conectar(conv, t) {
  if (t.ws && t.ws.readyState <= 1) return;
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  t.ws = new WebSocket(`${proto}://${location.host}/ws?conversa=${conv.id}&cols=${t.term.cols}&rows=${t.term.rows}`);
  t.term.reset();
  // Ao abrir, manda o tamanho real: o Claude Code redesenha a tela na largura certa.
  t.ws.onopen = () => { try { t.fit.fit(); } catch { /* */ } t.ws.send(JSON.stringify({ t: 'r', cols: t.term.cols, rows: t.term.rows })); };
  t.ws.onmessage = (m) => t.term.write(m.data);
  t.ws.onclose = () => { t.ws = null; };
}
function cardTerminal(conv) {
  const t = terminalDe(conv);
  const card = criarCard({
    chave: 'terminal', classe: 'card-terminal', icone: 'terminal', titulo: conv.titulo, sub: conv.motorNome || 'Claude Code',
    x: 0, y: 0, w: 860, h: 540, fechavel: false,
    extras: `<span class="pilula" data-status>pronto</span>`,
  });
  card.querySelector('.card-corpo').append(t.elemento);
  if (!t.aberto) { t.term.open(t.elemento); t.aberto = true; }
  requestAnimationFrame(() => { try { t.fit.fit(); } catch { /* */ } conectar(conv, t); });
  new ResizeObserver(() => { try { t.fit.fit(); } catch { /* */ } }).observe(card.querySelector('.card-corpo'));
  card.addEventListener('pointerdown', () => { if (!t.ws) conectar(conv, t); t.term.focus(); });
  return card;
}

// conversa que veio do WhatsApp: mostra o histórico; o botão assume ela no terminal
const assumidas = new Set(recuperar('assumidas', []));
function cardHistorico(conv) {
  const card = criarCard({
    chave: 'terminal', classe: 'card-terminal card-historico', icone: 'zap', titulo: conv.titulo, sub: 'WhatsApp',
    x: 0, y: 0, w: 860, h: 540, fechavel: false,
    extras: `<span class="pilula" data-status>pronto</span><button class="botao-leve botao-assumir" data-assumir>${ic('terminal')} Continuar no terminal</button>`,
  });
  const corpo = el('div', 'historico');
  card.querySelector('.card-corpo').append(corpo);
  card.querySelector('[data-assumir]').addEventListener('click', (e) => {
    e.stopPropagation();
    const c = S.conversas.find((x) => x.id === conv.id);
    if (c?.processando) { alert('O agente ainda está respondendo no WhatsApp. Espere terminar pra assumir pelo terminal.'); return; }
    assumidas.add(conv.id); guardar('assumidas', [...assumidas]); desenharEspaco();
  });
  pintarHistorico(conv, true);
  return card;
}
let assinaturaHistorico = '';
async function pintarHistorico(conv, forcar) {
  const corpo = mundo.querySelector('.card-historico .historico');
  if (!corpo) return;
  const itens = await api(`/api/conversas/${conv.id}/historico`);
  const ass = `${conv.id}:${itens.length}:${itens.at(-1)?.texto?.length || 0}`;
  if (!forcar && ass === assinaturaHistorico) return;
  assinaturaHistorico = ass;
  const hora = (t) => (t ? new Date(t).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '');
  corpo.innerHTML = itens.length ? itens.map((i) => (i.papel === 'acao'
    ? `<div class="hist-acao">${ic('seta')}<span>${esc(i.texto)}</span></div>`
    : `<div class="hist-msg ${i.papel}"><div class="balao">${i.papel === 'claude' ? renderizar(i.texto, 'x.md') : esc(i.texto).replace(/\n/g, '<br>')}</div><small>${i.papel === 'voce' ? 'Você' : esc(conv.motorNome || 'Claude')} · ${hora(i.quando)}</small></div>`)).join('')
    : '<p class="hist-vazio">A conversa aparece aqui assim que o agente começar a responder.</p>';
  corpo.scrollTop = corpo.scrollHeight;
}

// ---------- desenhar o espaço ativo ----------
function desenharEspaco() {
  mundo.querySelectorAll('.card, .boas-vindas').forEach((c) => c.remove());
  const e = espaco();
  const conv = S.conversas.find((c) => c.id === S.ativa);
  if (!conv) {
    if (S.ativa !== 'mesa') { S.ativa = 'mesa'; guardar('ativa', 'mesa'); return desenharEspaco(); }
    if (!e.abertos.length) {
      const bv = el('div', 'boas-vindas vidro', `<span class="marca-icone" style="width:52px;height:52px;border-radius:14px"></span><h1>Seu cérebro está no ar</h1><p>Abra uma conversa: é um agente de verdade (Claude Code, Codex ou Antigravity) rodando neste servidor, com acesso a tudo que está na árvore.</p><button class="botao-primario" data-acao="nova-conversa">${ic('mais')} Nova conversa</button>`);
      Object.assign(bv.style, { position: 'absolute', left: '-220px', top: '-150px', borderRadius: '28px' });
      mundo.append(bv);
    }
  } else {
    if (conv.origem && conv.origem !== 'painel' && !assumidas.has(conv.id)) cardHistorico(conv); else cardTerminal(conv);
    desenharFilhos(conv);
  }
  for (const c of e.abertos) cardArquivo(c, 0, 0);
  if (e.cam) { S.cam = e.cam; aplicarCamera(); } else setTimeout(centralizarTudo, 60);
  desenharLigacoes();
  pintarConversas();
}

function desenharFilhos(conv) {
  const e = espaco();
  // subagentes abaixo do orquestrador
  const ags = conv.subagentes || [];
  const larg = 290, gap = 26;
  const total = ags.length * larg + Math.max(0, ags.length - 1) * gap;
  ags.forEach((a, i) => {
    const chave = `ag:${a.id}`;
    let card = mundo.querySelector(`.card[data-chave="${chave}"]`);
    if (!card) {
      card = criarCard({ chave, classe: 'card-agente', icone: 'agente', titulo: a.descricao, x: 430 - total / 2 + i * (larg + gap), y: 620, w: larg, fechavel: false,
        corpo: el('div') });
      card.dataset.pai = 'terminal';
    }
    card.querySelector('.card-corpo').innerHTML = `<span class="pilula ${a.status}">${{ trabalhando: 'trabalhando', concluido: 'concluído', parado: 'parado' }[a.status]}</span>${a.ultimaAcao ? `<div class="agente-acao">${esc(a.ultimaAcao)}</div>` : ''}${a.tipo ? `<div class="agente-tipo">${esc(a.tipo)}</div>` : ''}`;
  });
  // mídias geradas à direita
  (conv.midias || []).forEach((m, i) => {
    const chave = `md:${m}`;
    if (mundo.querySelector(`.card[data-chave="${CSS.escape(chave)}"]`)) return;
    const card = criarCard({ chave, classe: 'card-midia', icone: tipoDe(m) === 'video' ? 'filme' : 'imagem', titulo: nomeDe(m), sub: '',
      x: 920 + (i % 3) * 300, y: Math.floor(i / 3) * 380, w: 280, h: tipoDe(m) === 'video' ? 480 : 350, corpo: corpoDeArquivo(m), fechavel: false });
    card.dataset.pai = 'terminal';
  });
  const term = mundo.querySelector('.card[data-chave="terminal"] [data-status]');
  if (term) { term.className = `pilula ${conv.trabalhando ? 'trabalhando' : ''}`; term.textContent = conv.trabalhando ? 'trabalhando' : conv.ativo ? 'pronto' : 'pausado'; }
  void e;
}

function desenharLigacoes() {
  const svg = $('#ligacoes');
  const pai = mundo.querySelector('.card[data-chave="terminal"]');
  if (!pai) { svg.innerHTML = ''; return; }
  const px = parseFloat(pai.style.left), py = parseFloat(pai.style.top), pw = pai.offsetWidth, ph = pai.offsetHeight;
  let d = '';
  mundo.querySelectorAll('.card[data-pai="terminal"]').forEach((c) => {
    const x = parseFloat(c.style.left), y = parseFloat(c.style.top), w = c.offsetWidth;
    const abaixo = y > py + ph - 20;
    const [ax, ay] = abaixo ? [px + pw / 2, py + ph] : [px + pw, py + 60];
    const [bx, by] = abaixo ? [x + w / 2, y] : [x, y + 40];
    const viva = c.querySelector('.pilula.trabalhando') ? 'viva' : '';
    d += abaixo
      ? `<path class="${viva}" d="M${ax},${ay} C${ax},${(ay + by) / 2} ${bx},${(ay + by) / 2} ${bx},${by}"/>`
      : `<path class="${viva}" d="M${ax},${ay} C${(ax + bx) / 2},${ay} ${(ax + bx) / 2},${by} ${bx},${by}"/>`;
  });
  svg.innerHTML = d;
}

// ---------- conversas (sanfona) ----------
function lerNota(nota) {
  const resumo = nota.match(/^>\s*(.+)$/m)?.[1] || '';
  const itens = [...nota.matchAll(/^\s*[-*]\s+\[( |x|X)\]\s+(.+)$/gm)].map((m) => ({ feito: m[1] !== ' ', texto: m[2] }));
  return { resumo, itens };
}
// ---------- comece aqui: primeiros testes de um clique ----------
async function pintarComece() {
  const caixa = $('#comece');
  const testes = await api('/api/primeiros-testes').catch(() => []);
  if (!testes.length) { caixa.hidden = true; return; }
  const fechado = recuperar('comeceFechado', false);
  caixa.classList.toggle('fechado', fechado);
  caixa.innerHTML = `<button class="comece-topo" data-acao="comece-alternar"><span>${ic('raio')} Comece aqui</span>${ic('seta')}</button>
    <ul class="comece-lista">${testes.map((t) => `<li><button class="comece-item" data-acao="pedir" data-pedido="${esc(t.pedido)}">
      <span class="comece-icone">${ic(t.icone)}</span><span><b>${esc(t.titulo)}</b><small>${esc(t.faz)}</small></span></button></li>`).join('')}</ul>`;
}

function pintarConversas() {
  const lista = $('#conversas-lista');
  lista.innerHTML = '';
  if (!S.conversas.length) {
    lista.append(el('div', 'vazio-lista vidro', 'Nenhuma conversa ainda.<br>Clique em <b>+</b> pra começar.'));
    return;
  }
  for (const c of [...S.conversas].reverse()) {
    const { resumo, itens } = lerNota(c.nota || '');
    const feitos = itens.filter((i) => i.feito).length;
    const aberta = c.id === S.ativa;
    const bloco = el('div', `conversa vidro ${aberta ? 'aberta' : ''}`);
    const pendentes = itens.filter((i) => !i.feito);
    const ordenados = [...pendentes, ...itens.filter((i) => i.feito)];
    bloco.innerHTML = `
      <div class="conversa-cabeca"><span class="ponto ${c.trabalhando ? 'trabalhando' : c.ativo ? 'ativo' : ''}"></span>
        ${c.origem === 'whatsapp' ? `<span class="selo-whats" title="Veio do WhatsApp">${ic('zap')}</span>` : c.origem && c.origem !== 'painel' ? `<span class="selo-whats" title="Veio do canal ${esc(c.origem)}">💬</span>` : ''}<span class="card-titulo">${esc(c.titulo)}</span><img class="selo-motor" src="/logos/${esc(c.motor || 'claude')}.svg" alt="${esc(c.motorNome || 'Claude Code')}" title="${esc(c.motorNome || 'Claude Code')}">${itens.length ? `<span class="conversa-progresso">${feitos}/${itens.length}</span>` : ''}</div>
      <div class="conversa-corpo"><div><div class="conversa-interno">
        ${resumo ? `<p class="resumo">${esc(resumo)}</p>` : `<p class="resumo">${c.nota ? '' : 'O resumo e as ações aparecem aqui assim que o agente criar a nota de status.'}</p>`}
        ${ordenados.length ? `<div class="secao-mini">${pendentes.length ? `${pendentes.length} pendente${pendentes.length > 1 ? 's' : ''}` : 'Tudo feito'}</div>
          <ul class="checklist">${ordenados.map((i) => `<li class="${i.feito ? 'feito' : ''}">${ic(i.feito ? 'check' : 'circulo')}<span>${esc(i.texto)}</span></li>`).join('')}</ul>` : ''}
        ${c.subagentes?.length ? `<div class="secao-mini">${c.subagentes.length} subagente${c.subagentes.length > 1 ? 's' : ''} · ${c.subagentes.filter((a) => a.status === 'trabalhando').length} trabalhando</div>` : ''}
        ${c.ultimaAcao ? `<div class="acao-atual">${esc(c.ultimaAcao)}</div>` : ''}
        <div class="conversa-botoes"><button class="botao-leve" data-focar>${ic('focar')} Focar</button><button class="botao-leve" data-encerrar>${ic('parar')} Encerrar</button></div>
      </div></div></div>`;
    bloco.addEventListener('click', (ev) => {
      if (ev.target.closest('[data-focar]')) { focarTerminal(); return; }
      if (ev.target.closest('[data-encerrar]')) { encerrar(c); return; }
      if (!aberta) trocarPara(c.id);
    });
    lista.append(bloco);
  }
}
function trocarPara(id) { S.ativa = id; guardar('ativa', id); desenharEspaco(); }
function focarTerminal() {
  const c = mundo.querySelector('.card[data-chave="terminal"]');
  if (!c) return;
  centralizarEm({ x: parseFloat(c.style.left), y: parseFloat(c.style.top), w: c.offsetWidth, h: c.offsetHeight });
  setTimeout(() => S.terminais.get(S.ativa)?.term.focus(), 400);
}
// ---------- seletor de motor (Claude Code, Codex, Antigravity) ----------
const MOTORES_UI = {
  claude: { empresa: 'Anthropic', instalar: 'Instala o Claude Code neste servidor (curl -fsSL https://claude.ai/install.sh | bash), confere com claude --version e me guia no login com a minha conta.' },
  codex: { empresa: 'OpenAI', instalar: 'Instala o Codex CLI da OpenAI neste servidor (npm i -g @openai/codex), confere com codex --version e me guia no login com a minha conta ChatGPT (codex login --device-auth). No fim, me avisa que já posso escolher o Codex numa conversa nova.' },
  antigravity: { empresa: 'Google', instalar: 'Instala o Antigravity CLI do Google neste servidor pelo instalador oficial (curl -fsSL https://antigravity.google/cli/install.sh | bash), confere se o comando agy funciona e me guia no login com a minha conta Google (link com código, pelo SSH). No fim, me avisa que já posso escolher o Antigravity numa conversa nova.' },
};
async function escolherMotor() {
  const mot = await api('/api/config/motores');
  $('#seletor-motores').innerHTML = Object.entries(mot.motores).map(([id, m]) => `
    <button class="motor-opcao ${m.instalado ? '' : 'falta'}" data-acao="${m.instalado ? 'abrir-motor' : 'instalar-motor'}" data-motor="${id}">
      <img src="/logos/${id}.svg" alt="" width="40" height="40">
      <b>${esc(m.nome)}</b><span>${esc(MOTORES_UI[id]?.empresa || '')}</span>
      <em>${m.instalado ? (mot.padrao === id ? 'Último usado' : 'Pronto') : 'Não instalado · instalar'}</em>
    </button>`).join('');
  $('#escolher-motor').hidden = false;
}
const fecharSeletor = () => { $('#escolher-motor').hidden = true; };

async function novaConversa(pedido, motor) {
  if (Grafo.aberto) Grafo.fechar();
  fecharSeletor();
  // o pedido (se houver) é escrito pelo servidor na caixa do agente, sem enviar: a pessoa lê e aperta Enter
  const corpo = { cols: 104, rows: 30, ...(motor ? { motor } : {}), ...(typeof pedido === 'string' && pedido ? { pedido } : {}) };
  const c = await api('/api/conversas', { method: 'POST', body: JSON.stringify(corpo) });
  await atualizarEstado();
  trocarPara(c.id);
  setTimeout(focarTerminal, 150);
}
async function encerrar(c) {
  if (!confirm(`Encerrar "${c.titulo}"? A conversa fica salva no histórico do ${c.motorNome || 'Claude Code'}.`)) return;
  await api(`/api/conversas/${c.id}`, { method: 'DELETE' });
  S.terminais.get(c.id)?.ws?.close(); S.terminais.delete(c.id);
  await atualizarEstado();
  trocarPara('mesa');
}

async function atualizarEstado() {
  const antes = JSON.stringify(S.conversas.map((c) => [c.id, c.motor, c.titulo, c.nota, c.trabalhando, c.ativo, c.ultimaAcao, c.subagentes, c.midias]));
  S.conversas = await api('/api/estado');
  const ativa = S.conversas.find((c) => c.id === S.ativa);
  if (ativa?.origem && ativa.origem !== 'painel' && !assumidas.has(ativa.id)) pintarHistorico(ativa).catch(() => {});
  const depois = JSON.stringify(S.conversas.map((c) => [c.id, c.motor, c.titulo, c.nota, c.trabalhando, c.ativo, c.ultimaAcao, c.subagentes, c.midias]));
  if (antes === depois) return;
  pintarConversas();
  const conv = S.conversas.find((c) => c.id === S.ativa);
  if (conv) {
    desenharFilhos(conv);
    const titulo = mundo.querySelector('.card[data-chave="terminal"] .card-titulo');
    if (titulo) titulo.innerHTML = `${esc(conv.titulo)} <span class="card-sub">${conv.origem && conv.origem !== 'painel' && !assumidas.has(conv.id) ? ({ whatsapp: 'WhatsApp', gchat: 'Google Chat' }[conv.origem] || esc(conv.origem)) : esc(conv.motorNome || 'Claude Code')}</span>`;
    desenharLigacoes();
  }
}

// ---------- árvore ----------
const abertas = new Set(recuperar('pastas', ['conteudo']));
async function carregarArvore() {
  const dados = await api('/api/arvore');
  const raiz = $('#arvore-lista');
  raiz.innerHTML = '';
  raiz.append(montarNos(dados));
}
function montarNos(nos) {
  const frag = document.createDocumentFragment();
  for (const n of nos) {
    const linha = el('div', 'no');
    linha.dataset.caminho = n.caminho;
    if (n.tipo === 'pasta') {
      const aberto = abertas.has(n.caminho);
      linha.classList.toggle('aberto', aberto);
      linha.innerHTML = `<svg class="i seta" viewBox="0 0 24 24">${P.seta}</svg>${ic('pasta')}<span class="no-nome">${esc(n.nome)}</span>`;
      const filhos = el('div', 'filhos');
      filhos.hidden = !aberto;
      filhos.append(montarNos(n.filhos));
      linha.addEventListener('click', () => {
        const ab = !abertas.has(n.caminho);
        ab ? abertas.add(n.caminho) : abertas.delete(n.caminho);
        guardar('pastas', [...abertas]);
        linha.classList.toggle('aberto', ab); filhos.hidden = !ab;
      });
      frag.append(linha, filhos);
    } else {
      const t = tipoDe(n.nome);
      linha.innerHTML = `<span class="seta-vazia"></span>${ic(t === 'imagem' ? 'imagem' : t === 'video' ? 'filme' : 'doc')}<span class="no-nome">${esc(n.nome)}</span>`;
      linha.addEventListener('click', () => abrir(n.caminho));
      frag.append(linha);
    }
  }
  return frag;
}
function marcarArvore(caminho) {
  document.querySelectorAll('.no.ativo').forEach((n) => n.classList.remove('ativo'));
  document.querySelector(`.no[data-caminho="${CSS.escape(caminho)}"]`)?.classList.add('ativo');
}

// ---------- conteúdos: pastas com capa, pasta aberta, envio ----------
const ROTULOS = { carrosseis: 'Carrosséis', reels: 'Reels', thumbnails: 'Thumbnails', whatsapp: 'WhatsApp', enviados: 'Enviados', videos: 'Vídeos', imagens: 'Imagens' };
const rotulo = (n) => ROTULOS[n] || n.charAt(0).toUpperCase() + n.slice(1).replace(/-/g, ' ');
const tamanhoBonito = (b) => (b > 1e9 ? `${(b / 1e9).toFixed(1)} GB` : b > 1e6 ? `${(b / 1e6).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1e3))} KB`);
const dataBonita = (ms) => new Date(ms).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' }).replace('.', '');
function nomeBonito(n, pasta) {
  let x = pasta ? n : n.replace(/\.[^.]+$/, '');
  const data = x.match(/^(\d{4})-(\d{2})-(\d{2})-/);
  if (data) x = x.slice(11);
  x = x.replace(/[-_]+/g, ' ').trim();
  return { titulo: x.charAt(0).toUpperCase() + x.slice(1), data: data ? `${data[3]}/${data[2]}` : '' };
}
const baixar = (c) => `${url(c)}&baixar=1`;
const capaUrl = (capa) => (capa.tipo === 'video' ? `/api/capa?caminho=${encodeURIComponent(capa.caminho)}` : url(capa.caminho));
function previaDe(c, classe = 'previa') {
  const t = tipoDe(c);
  if (t === 'imagem') return `<div class="${classe}"><img src="${url(c)}" alt="" draggable="false"></div>`;
  if (t === 'video') return `<div class="${classe}"><img src="/api/capa?caminho=${encodeURIComponent(c)}" alt="" draggable="false"><span class="selo-play">${ic('play')}</span></div>`;
  return `<div class="${classe} previa-doc">${ic('doc')}<span>${esc((c.split('.').pop() || '').toUpperCase())}</span></div>`;
}

const Cont = { item: null };
async function abrirConteudos() {
  $('#folha-conteudos').hidden = false; pintarDock();
  Cont.item ? await mostrarPasta(Cont.item) : await mostrarRaiz();
}
function cabecalho({ titulo, sub, migalha }) {
  $('#conteudos-titulo').textContent = titulo;
  $('#conteudos-sub').textContent = sub;
  $('#conteudos-migalha').hidden = !migalha; $('#conteudos-migalha').textContent = migalha || '';
  $('[data-acao="conteudos-voltar"]').hidden = !migalha;
  $('#soltar-destino').textContent = Cont.item ? `em ${Cont.item.titulo}` : 'na pasta Enviados';
}
async function mostrarRaiz() {
  Cont.item = null;
  cabecalho({ titulo: 'Conteúdos', sub: 'Tudo que o cérebro gerou, organizado por pasta.' });
  const cats = await api('/api/conteudos');
  const grade = $('#grade-conteudos'); grade.innerHTML = ''; grade.scrollTop = 0;
  if (!cats.some((c) => c.itens.length)) { grade.innerHTML = '<p class="vazio-conteudos">Nada gerado ainda. Peça algo numa conversa ou envie arquivos.</p>'; return; }
  for (const cat of cats) {
    if (!cat.itens.length) continue;
    const sec = el('section', 'grupo-conteudo', `<h3>${esc(rotulo(cat.nome))} <span>${cat.itens.length}</span></h3>`);
    const gi = el('div', 'grupo-pastas');
    for (const it of cat.itens) {
      const nb = nomeBonito(it.nome, it.pasta);
      const b = el('button', 'pasta-card');
      const capa = it.capa ? `<img src="${capaUrl(it.capa)}" alt="" draggable="false">${it.capa.tipo === 'video' ? `<span class="selo-play">${ic('play')}</span>` : ''}` : `<span class="capa-vazia">${ic(it.pasta ? 'pasta' : 'doc')}</span>`;
      b.innerHTML = `<div class="pasta-capa">${capa}</div>
        <div class="pasta-info"><span class="pasta-icone">${ic(it.pasta ? 'pasta' : 'doc')}</span><div><b>${esc(nb.titulo)}</b>
        <small>${it.pasta ? `${it.arquivos} ${it.arquivos === 1 ? 'arquivo' : 'arquivos'}` : esc((it.nome.split('.').pop() || '').toUpperCase())} · ${nb.data || dataBonita(it.mtime)}</small></div></div>`;
      b.addEventListener('click', () => (it.pasta
        ? mostrarPasta({ caminho: it.caminho, titulo: nb.titulo, categoria: rotulo(cat.nome) })
        : Visor.abrir([it.caminho], 0)));
      gi.append(b);
    }
    sec.append(gi); grade.append(sec);
  }
}
async function mostrarPasta(item) {
  Cont.item = item;
  const lista = await api(`/api/pasta?caminho=${encodeURIComponent(item.caminho)}`);
  cabecalho({ titulo: item.titulo, sub: `${lista.length} ${lista.length === 1 ? 'arquivo' : 'arquivos'} · clique pra abrir, ou arraste arquivos aqui pra enviar`, migalha: `Conteúdos › ${item.categoria}` });
  const grade = $('#grade-conteudos'); grade.innerHTML = ''; grade.scrollTop = 0;
  const grupos = new Map();
  for (const f of lista) {
    const sub = f.caminho.slice(item.caminho.length + 1).split('/').slice(0, -1).join(' / ');
    if (!grupos.has(sub)) grupos.set(sub, []);
    grupos.get(sub).push(f);
  }
  const ordem = [...grupos.keys()].sort((a, b) => (a === '' ? -1 : b === '' ? 1 : a === 'entrega' ? -1 : b === 'entrega' ? 1 : a.localeCompare(b)));
  const todos = ordem.flatMap((g) => grupos.get(g).map((f) => f.caminho));
  for (const g of ordem) {
    const sec = el('section', 'grupo-conteudo', g ? `<h3>${esc(rotulo(g))} <span>${grupos.get(g).length}</span></h3>` : '');
    const gi = el('div', 'grupo-itens');
    for (const f of grupos.get(g)) {
      const b = el('div', 'miniatura');
      b.innerHTML = `${previaDe(f.caminho)}<div class="legenda"><span>${esc(f.nome)}</span><small>${tamanhoBonito(f.tamanho)}</small></div>
        <a class="mini-baixar" href="${baixar(f.caminho)}" download title="Baixar">${ic('baixar')}</a>`;
      b.addEventListener('click', (e) => { if (e.target.closest('.mini-baixar')) return; Visor.abrir(todos, todos.indexOf(f.caminho)); });
      gi.append(b);
    }
    sec.append(gi); grade.append(sec);
  }
}
function fecharConteudos() { $('#folha-conteudos').hidden = true; pintarDock(); }

// envio do computador pro servidor (um arquivo por vez, com progresso)
async function enviarArquivos(arquivos) {
  const pasta = Cont.item ? Cont.item.caminho : 'conteudo/enviados';
  const caixa = $('#envio'); caixa.hidden = false;
  let feitos = 0;
  for (const f of arquivos) {
    await new Promise((ok) => {
      const x = new XMLHttpRequest();
      x.open('POST', `/api/enviar?pasta=${encodeURIComponent(pasta)}&nome=${encodeURIComponent(f.name)}`);
      x.setRequestHeader('Content-Type', 'application/octet-stream');
      x.upload.onprogress = (e) => {
        const pct = e.lengthComputable ? Math.round((e.loaded / e.total) * 100) : 0;
        caixa.innerHTML = `${ic('enviar')}<div><b>Enviando ${feitos + 1} de ${arquivos.length}</b><small>${esc(f.name)}</small><i style="--p:${pct}%"></i></div>`;
      };
      x.onloadend = () => { if (x.status === 200) feitos++; ok(); };
      x.send(f);
    });
  }
  caixa.innerHTML = `${ic('check')}<div><b>${feitos} de ${arquivos.length} ${arquivos.length === 1 ? 'arquivo enviado' : 'arquivos enviados'}</b><small>${esc(Cont.item ? Cont.item.titulo : 'Conteúdos › Enviados')}</small></div>`;
  setTimeout(() => { caixa.hidden = true; }, 3500);
  if (!$('#folha-conteudos').hidden) (Cont.item ? mostrarPasta(Cont.item) : mostrarRaiz());
  carregarArvoreSeMudou().catch(() => {});
}
$('#entrada-arquivos').addEventListener('change', (e) => { const a = [...e.target.files]; e.target.value = ''; if (a.length) enviarArquivos(a); });
{
  const corpo = $('#conteudos-corpo'); let profundidade = 0;
  corpo.addEventListener('dragenter', (e) => { if (!e.dataTransfer?.types.includes('Files')) return; e.preventDefault(); profundidade++; corpo.classList.add('soltando'); });
  corpo.addEventListener('dragover', (e) => { if (e.dataTransfer?.types.includes('Files')) e.preventDefault(); });
  corpo.addEventListener('dragleave', () => { if (--profundidade <= 0) { profundidade = 0; corpo.classList.remove('soltando'); } });
  corpo.addEventListener('drop', (e) => { e.preventDefault(); profundidade = 0; corpo.classList.remove('soltando'); const a = [...e.dataTransfer.files]; if (a.length) enviarArquivos(a); });
}

// ---------- visor: o arquivo por cima de tudo, fundo desfocado ----------
const Visor = {
  lista: [], i: 0,
  get aberto() { return !$('#visor').hidden; },
  abrir(lista, i) { this.lista = lista; this.i = Math.max(0, i); $('#visor').hidden = false; this.mostrar(); },
  fechar() { $('#visor-palco').innerHTML = ''; $('#visor').hidden = true; },
  passo(d) { if (this.lista.length < 2) return; this.i = (this.i + d + this.lista.length) % this.lista.length; this.mostrar(); },
  mostrar() {
    const c = this.lista[this.i]; const t = tipoDe(c);
    $('#visor-nome').textContent = nomeDe(c);
    $('#visor-info').textContent = this.lista.length > 1 ? `${this.i + 1} de ${this.lista.length}` : c.split('/').slice(0, -1).join(' › ');
    $('#visor-baixar').href = baixar(c);
    $('#visor').classList.toggle('so-um', this.lista.length < 2);
    const palco = $('#visor-palco'); palco.innerHTML = '';
    if (t === 'imagem') { const im = el('img', 'visor-midia'); im.src = url(c); im.alt = nomeDe(c); palco.append(im); }
    else if (t === 'video') { const v = el('video', 'visor-midia'); v.src = url(c); v.controls = true; v.autoplay = true; v.playsInline = true; palco.append(v); }
    else if (t === 'texto') { const d = el('div', 'visor-doc md', '<p style="color:var(--texto-3)">Carregando…</p>'); palco.append(d); api(url(c)).then((txt) => { d.innerHTML = renderizar(String(txt), c); }); }
    else palco.append(el('div', 'visor-doc visor-sem-previa', `${ic('doc')}<b>Sem prévia pra esse tipo de arquivo</b><a class="botao-leve" href="${baixar(c)}" download>${ic('baixar')} Baixar</a>`));
  },
};
// mídia abre no visor de onde vier (árvore, grafo, conteúdos); nota continua virando card no canvas
async function abrir(caminho) {
  const t = tipoDe(caminho);
  if (t !== 'imagem' && t !== 'video') return abrirArquivo(caminho);
  const dir = caminho.split('/').slice(0, -1).join('/');
  let irmaos = [caminho];
  try {
    const l = await api(`/api/pasta?caminho=${encodeURIComponent(dir)}`);
    irmaos = l.map((f) => f.caminho).filter((p) => p.split('/').slice(0, -1).join('/') === dir && ['imagem', 'video'].includes(tipoDe(p)));
  } catch { /* fica só ele */ }
  Visor.abrir(irmaos, irmaos.indexOf(caminho));
}

// ---------- dock e ações ----------
const aberta = (q) => (q === 'arvore' ? !$('#arvore').classList.contains('fechado') : false);
function pintarDock() {
  const icones = { arvore: 'arvore', grafo: 'grafo', config: 'engrenagem', 'nova-conversa': 'conversaNova', conteudos: 'grade', centralizar: 'mira', sair: 'sair',
    tema: document.documentElement.dataset.tema === 'escuro' ? 'sol' : 'lua' };
  document.querySelectorAll('#dock button').forEach((b) => { b.innerHTML = ic(icones[b.dataset.acao]); });
  $('#dock [data-acao="arvore"]')?.classList.toggle('ligado', !$('#arvore')?.classList.contains('fechado'));
  $('#dock [data-acao="conteudos"]')?.classList.toggle('ligado', !$('#folha-conteudos')?.hidden);
  $('#dock [data-acao="grafo"]')?.classList.toggle('ligado', !$('#grafo')?.hidden);
  $('#dock [data-acao="config"]')?.classList.toggle('ligado', !$('#folha-config')?.hidden);
}
document.addEventListener('click', async (e) => {
  const b = e.target.closest('[data-acao]');
  if (!b) return;
  const a = b.dataset.acao;
  if (a === 'arvore') { $('#arvore').classList.toggle('fechado'); guardar('arvoreFechada', $('#arvore').classList.contains('fechado')); pintarDock(); }
  if (a === 'nova-conversa') escolherMotor();
  if (a === 'fechar-seletor') fecharSeletor();
  if (a === 'abrir-motor') { api('/api/config/motores', { method: 'POST', body: JSON.stringify({ padrao: b.dataset.motor }) }); novaConversa(null, b.dataset.motor); }
  if (a === 'instalar-motor') novaConversa(MOTORES_UI[b.dataset.motor].instalar, 'claude');
  if (a === 'conteudos') abrirConteudos();
  if (a === 'fechar-conteudos') fecharConteudos();
  if (a === 'conteudos-voltar') mostrarRaiz();
  if (a === 'enviar-arquivos') $('#entrada-arquivos').click();
  if (a === 'fechar-visor') Visor.fechar();
  if (a === 'visor-ant') Visor.passo(-1);
  if (a === 'visor-prox') Visor.passo(1);
  if (a === 'centralizar') centralizarTudo();
  if (a === 'tema') aplicarTema(document.documentElement.dataset.tema === 'escuro' ? 'claro' : 'escuro');
  if (a === 'recarregar-arvore') carregarArvore();
  if (a === 'grafo') (Grafo.aberto ? Grafo.fechar() : Grafo.abrir());
  if (a === 'config') abrirConfig();
  if (a === 'fechar-config') fecharConfig();
  if (a === 'whats-conectar') conectarWhats(b);
  if (a === 'motor') api('/api/config/motores', { method: 'POST', body: JSON.stringify({ [b.dataset.campo]: b.dataset.valor }) }).then(pintarConfig);
  if (a === 'whats-desconectar') desconectarWhats();
  if (a === 'acesso-adicionar') autorizarNumero();
  if (a === 'acesso-remover') salvarAcesso((x) => { x.numeros = x.numeros.filter((n) => n !== b.dataset.n); });
  if (a === 'pedir') { fecharConfig(); novaConversa(b.dataset.pedido, 'claude'); }
  if (a === 'comece-alternar') { const f = !$('#comece').classList.contains('fechado'); guardar('comeceFechado', f); $('#comece').classList.toggle('fechado', f); }
  if (a === 'sair') { await fetch('/api/logout', { method: 'POST' }); location.reload(); }
});
document.addEventListener('keydown', (e) => {
  if (Visor.aberto && (e.key === 'ArrowRight' || e.key === 'ArrowLeft') && !e.target.closest('input, textarea, .xterm')) { Visor.passo(e.key === 'ArrowRight' ? 1 : -1); return; }
  if (e.key !== 'Escape') return;
  if (Visor.aberto) Visor.fechar();
  else if (!$('#escolher-motor').hidden) fecharSeletor();
  else if (!$('#folha-conteudos').hidden) fecharConteudos();
  else if (!$('#folha-config').hidden) fecharConfig();
  else if (Grafo.aberto) Grafo.fechar();
});

// ---------- grafo (pontinhos ligados, estilo Obsidian) ----------
const Grafo = {
  aberto: false, nos: [], lig: [], cam: { x: 0, y: 0, z: 1 }, alfa: 1, hover: null, arrastado: null,
  async abrir() {
    const dados = await api('/api/grafo');
    const antigos = new Map(this.nos.map((n) => [n.id, n]));
    const tela = $('#grafo-tela');
    this.nos = dados.nos.map((n, i) => {
      const a = antigos.get(n.id); const ang = i * 2.4; const r = 30 + Math.sqrt(i) * 28;
      return { ...n, x: a?.x ?? Math.cos(ang) * r, y: a?.y ?? Math.sin(ang) * r, vx: 0, vy: 0, grau: 0 };
    });
    const idx = new Map(this.nos.map((n) => [n.id, n]));
    this.lig = dados.ligacoes.map((l) => ({ a: idx.get(l.de), b: idx.get(l.para), tipo: l.tipo })).filter((l) => l.a && l.b);
    for (const l of this.lig) { l.a.grau++; l.b.grau++; }
    this.viz = new Map(this.nos.map((n) => [n, new Set()]));
    for (const l of this.lig) { this.viz.get(l.a).add(l.b); this.viz.get(l.b).add(l.a); }
    $('#grafo').hidden = false; this.aberto = true; pintarDock();
    this.ajustar(tela);
    // acomoda o desenho antes de mostrar (o movimento final fica só no ajuste fino)
    this.alfa = 1; for (let i = 0; i < 500; i++) this.passo();
    this.alfa = 0.12;
    if (!this.cam.iniciada) this.enquadrar();
    if (!this.ligado) this.ligar(tela);
    cancelAnimationFrame(this.raf); const loop = () => { this.passo(); this.desenhar(tela); if (this.aberto) this.raf = requestAnimationFrame(loop); }; loop();
    this.timer = setInterval(() => { if (this.aberto && document.hidden) { this.passo(); this.desenhar(tela); } }, 50);
  },
  enquadrar() {
    let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
    for (const n of this.nos) { x1 = Math.min(x1, n.x); y1 = Math.min(y1, n.y); x2 = Math.max(x2, n.x); y2 = Math.max(y2, n.y); }
    const esq = aberta('arvore') ? 300 : 20, dir = 350, topo = 70, base = 110;
    const lw = innerWidth - esq - dir, lh = innerHeight - topo - base;
    const z = Math.min(1.3, lw / (x2 - x1 + 120), lh / (y2 - y1 + 120));
    this.cam = { z, x: esq + lw / 2 - ((x1 + x2) / 2) * z, y: topo + lh / 2 - ((y1 + y2) / 2) * z, iniciada: true };
  },
  fechar() { this.aberto = false; $('#grafo').hidden = true; $('#grafo-rotulo').hidden = true; cancelAnimationFrame(this.raf); clearInterval(this.timer); pintarDock(); },
  ajustar(tela) { const d = devicePixelRatio || 1; tela.width = innerWidth * d; tela.height = innerHeight * d; this.dpr = d; },
  raio(n) { return n.tipo === 'pasta' ? 2.8 + Math.sqrt(n.grau) * 0.9 : 2 + Math.sqrt(n.grau) * 0.5; },
  passo() {
    if (this.alfa < 0.004) return;
    const N = this.nos; const k = this.alfa;
    for (let i = 0; i < N.length; i++) for (let j = i + 1; j < N.length; j++) {
      const a = N[i], b = N[j]; let dx = b.x - a.x, dy = b.y - a.y; let d2 = dx * dx + dy * dy || 0.01;
      if (d2 > 90000) continue; const f = (700 / d2) * k; const d = Math.sqrt(d2); dx /= d; dy /= d;
      a.vx -= dx * f; a.vy -= dy * f; b.vx += dx * f; b.vy += dy * f;
    }
    for (const l of this.lig) {
      const alvo = l.tipo === 'pasta' ? 34 : 60; const dx = l.b.x - l.a.x, dy = l.b.y - l.a.y; const d = Math.sqrt(dx * dx + dy * dy) || 0.01;
      const f = ((d - alvo) / d) * 0.06 * k; l.a.vx += dx * f; l.a.vy += dy * f; l.b.vx -= dx * f; l.b.vy -= dy * f;
    }
    for (const n of N) {
      n.vx -= n.x * 0.012 * k; n.vy -= n.y * 0.012 * k;
      if (n === this.arrastado) { n.vx = n.vy = 0; continue; }
      n.vx *= 0.82; n.vy *= 0.82;
      const v = Math.hypot(n.vx, n.vy); if (v > 18) { n.vx *= 18 / v; n.vy *= 18 / v; }
      n.x += n.vx; n.y += n.vy;
    }
    this.alfa *= 0.992;
  },
  desenhar(tela) {
    const c = tela.getContext('2d'); const d = this.dpr; const cs = getComputedStyle(document.documentElement);
    const cor = (v) => cs.getPropertyValue(v).trim();
    c.setTransform(1, 0, 0, 1, 0, 0); c.clearRect(0, 0, tela.width, tela.height);
    c.setTransform(d * this.cam.z, 0, 0, d * this.cam.z, d * this.cam.x, d * this.cam.y);
    const h = this.hover; const viz = h ? this.viz.get(h) : null;
    c.lineWidth = 1 / this.cam.z;
    for (const l of this.lig) {
      const ativa = h && (l.a === h || l.b === h);
      c.strokeStyle = ativa ? cor('--acento') : cor('--texto-3'); c.globalAlpha = h ? (ativa ? 0.9 : 0.06) : (l.tipo === 'link' ? 0.35 : 0.18);
      c.beginPath(); c.moveTo(l.a.x, l.a.y); c.lineTo(l.b.x, l.b.y); c.stroke();
    }
    const cores = { pasta: cor('--acento'), nota: cor('--texto-2'), midia: cor('--laranja') };
    for (const n of this.nos) {
      const foco = !h || n === h || viz.has(n);
      c.globalAlpha = foco ? 1 : 0.15; c.fillStyle = cores[n.tipo];
      c.beginPath(); c.arc(n.x, n.y, this.raio(n) * (n === h ? 1.5 : 1), 0, Math.PI * 2); c.fill();
    }
    c.globalAlpha = 1; c.fillStyle = cor('--texto'); c.textAlign = 'center'; c.textBaseline = 'top';
    const fs = 10.5 / Math.max(this.cam.z, 0.6);
    c.font = `500 ${fs}px -apple-system, BlinkMacSystemFont, Inter, sans-serif`;
    for (const n of this.nos) {
      const raiz = n.tipo === 'pasta' && !n.id.includes('/');
      const mostra = (h && (n === h || viz.has(n))) || (!h && (raiz || this.cam.z > 2.8));
      if (!mostra) continue;
      c.globalAlpha = n === h ? 1 : 0.55; c.fillText(n.nome, n.x, n.y + this.raio(n) + 4);
    }
    c.globalAlpha = 1;
  },
  noEm(x, y) {
    const wx = (x - this.cam.x) / this.cam.z, wy = (y - this.cam.y) / this.cam.z;
    let melhor = null, dm = Infinity;
    for (const n of this.nos) { const d = Math.hypot(n.x - wx, n.y - wy); if (d < this.raio(n) + 6 / this.cam.z && d < dm) { dm = d; melhor = n; } }
    return melhor;
  },
  ligar(tela) {
    this.ligado = true;
    addEventListener('resize', () => this.aberto && this.ajustar(tela));
    tela.addEventListener('wheel', (e) => {
      e.preventDefault();
      if (e.ctrlKey || e.metaKey || Math.abs(e.deltaY) > 0) {
        const f = Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0015)); const z = Math.min(4, Math.max(0.2, this.cam.z * f)); const k = z / this.cam.z;
        this.cam.x = e.clientX - (e.clientX - this.cam.x) * k; this.cam.y = e.clientY - (e.clientY - this.cam.y) * k; this.cam.z = z;
      }
    }, { passive: false });
    tela.addEventListener('pointermove', (e) => {
      if (this.pan) { this.cam.x = this.pan.cx + e.clientX - this.pan.x; this.cam.y = this.pan.cy + e.clientY - this.pan.y; return; }
      if (this.arrastado) { this.arrastado.x = (e.clientX - this.cam.x) / this.cam.z; this.arrastado.y = (e.clientY - this.cam.y) / this.cam.z; this.alfa = Math.max(this.alfa, 0.3); this.moveu = true; return; }
      const n = this.noEm(e.clientX, e.clientY); this.hover = n; tela.style.cursor = n ? 'pointer' : 'grab';
      const r = $('#grafo-rotulo');
      if (n) { r.hidden = false; r.textContent = n.id; r.style.left = `${e.clientX + 14}px`; r.style.top = `${e.clientY + 14}px`; } else r.hidden = true;
    });
    tela.addEventListener('pointerdown', (e) => {
      tela.setPointerCapture(e.pointerId); this.moveu = false;
      const n = this.noEm(e.clientX, e.clientY);
      if (n) this.arrastado = n; else { this.pan = { x: e.clientX, y: e.clientY, cx: this.cam.x, cy: this.cam.y }; tela.classList.add('arrastando'); }
    });
    tela.addEventListener('pointerup', () => {
      const n = this.arrastado; this.arrastado = null; this.pan = null; tela.classList.remove('arrastando');
      if (n && !this.moveu && n.tipo !== 'pasta') { this.fechar(); abrir(n.id); }
    });
  },
};

// ---------- configurações (engrenagem) ----------
let qrAtual = null; let qrVencido = false; let acessoAtual = { numeros: [], chatVoce: true };
async function abrirConfig() {
  $('#folha-config').hidden = false; pintarDock();
  await pintarConfig();
  clearInterval(abrirConfig.t); abrirConfig.t = setInterval(() => tickConfig().catch(() => {}), 3000);
}
// com o QR na tela: só troca a imagem quando o WhatsApp gira o código e redesenha quando conecta ou vence.
// sem QR: redesenha o estado, menos quando a pessoa está digitando um número.
async function tickConfig() {
  if ($('#folha-config').hidden) { clearInterval(abrirConfig.t); return; }
  if (qrAtual) {
    const r = await api('/api/config/whatsapp/qr');
    if (!r || r.erro) return;
    if (r.estado === 'connecting') {
      if (r.qr && r.qr !== qrAtual) { qrAtual = r.qr; const img = $('#config-corpo .qr img'); if (img) img.src = r.qr; }
      return;
    }
    qrAtual = null; qrVencido = r.estado !== 'open';
    return pintarConfig();
  }
  if (document.activeElement?.closest?.('#config-corpo') && document.activeElement.matches('input, textarea')) return;
  if ($('#acesso-novo')?.value) return;
  await pintarConfig();
}
function fecharConfig() { $('#folha-config').hidden = true; qrAtual = null; qrVencido = false; pintarDock(); }
async function pintarConfig() {
  const [cfg, mot, ext] = await Promise.all([api('/api/config'), api('/api/config/motores'), api('/api/extras')]);
  const itemExtra = (x) => `<li class="extra"><span class="extra-logo"><img src="/logos/${esc(x.logo)}" alt=""></span>
      <span class="extra-texto"><b>${esc(x.nome)}</b><span>${esc(x.faz)}</span></span>
      ${x.instalado ? '<span class="pilula conectado">Instalado</span>' : `<button class="botao-leve" data-acao="pedir" data-pedido="${esc(x.pedido)}">${ic('conversaNova')} Pedir na conversa</button>`}</li>`;
  const w = cfg.whatsapp;
  const estados = { open: ['conectado', 'Conectado'], connecting: ['trabalhando', 'Conectando'], close: ['', 'Desconectado'], indisponivel: ['erro', 'Indisponível'] };
  const [cls, rot] = estados[w.estado] || ['', w.estado];
  if (w.estado === 'open') { qrAtual = null; qrVencido = false; }
  acessoAtual = w.acesso || acessoAtual;
  const formata = (n) => (n ? n.replace(/^(\d{2})(\d{2})(\d{4,5})(\d{4})$/, '+$1 ($2) $3-$4') : 'nenhum');
  const motorWhats = mot.motores[mot.whatsapp]?.nome || 'Claude Code';
  const pedidoDominio = 'Quero configurar um subdomínio próprio pra este servidor, com HTTPS. Me guia passo a passo.';
  const pedidoN8n = 'Conecta o n8n deste servidor no Claude Code por MCP, pra você criar e editar fluxos por aqui.';
  const escolha = (campo) => Object.entries(mot.motores).map(([id, m]) => `<button class="botao-leve ${mot[campo] === id ? 'escolhido' : ''}" data-acao="motor" data-campo="${campo}" data-valor="${id}" title="${esc(m.instalado ? m.nome : `Não instalado. ${m.login}`)}"><img class="logo-mini" src="/logos/${id}.svg" alt="">${esc(m.nome)}${m.instalado ? '' : ' ·  não instalado'}</button>`).join('');
  const faltam = Object.values(mot.motores).filter((m) => !m.instalado);
  $('#config-corpo').innerHTML = `
    <section class="config-cartao">
      <div class="config-cabeca"><span class="config-icone azul">${ic('terminal')}</span>
        <div class="config-titulo"><b>Motor de IA</b><span>Quem responde nas conversas: Claude Code, Codex (OpenAI) ou Antigravity (Google)</span></div></div>
      <dl class="config-linhas"><div><dt>Conversas novas no painel</dt><dd class="config-escolha">${escolha('padrao')}</dd></div>
        <div><dt>WhatsApp</dt><dd class="config-escolha">${escolha('whatsapp')}</dd></div></dl>
      <p class="config-dica">Vale pras próximas conversas; as abertas seguem no motor em que começaram. No WhatsApp, a troca abre uma conversa nova.</p>
      ${Object.values(mot.motores).map((m) => `<p class="config-dica"><b>${esc(m.nome)}:</b> ${m.instalado ? '' : 'não instalado. '}${esc(m.login)}</p>`).join('')}
    </section>
    <section class="config-cartao">
      <div class="config-cabeca"><span class="config-icone verde">${ic('zap')}</span>
        <div class="config-titulo"><b>WhatsApp</b><span>Evolution API rodando neste servidor</span></div>
        <span class="pilula ${cls}">${rot}</span></div>
      <dl class="config-linhas">
        <div><dt>Número conectado</dt><dd>${esc(w.estado === 'open' ? formata(w.numero) : 'nenhum')}${w.estado === 'open' && w.nomePerfil ? ` <span class="config-sutil">${esc(w.nomePerfil)}</span>` : ''}</dd></div>
        <div><dt>Fluxo</dt><dd>WhatsApp → n8n → ${esc(motorWhats)}</dd></div>
      </dl>
      ${w.erro ? `<p class="config-dica">${esc(w.erro)}</p>` : ''}
      ${qrAtual ? `<div class="qr"><img alt="QR do WhatsApp" src="${qrAtual}"></div><p class="config-dica" style="text-align:center">No celular: WhatsApp › Aparelhos conectados › Conectar aparelho. O código se renova sozinho.</p>` : ''}
      ${qrVencido ? '<p class="config-dica">O QR venceu antes da leitura. Gere outro e escaneie em seguida.</p>' : ''}
      <div class="config-botoes">
        ${w.estado === 'open'
          ? `<button class="botao-leve" data-acao="whats-desconectar">${ic('parar')} Desconectar</button>`
          : qrAtual
            ? `<button class="botao-leve" data-acao="whats-conectar" data-novo="1">${ic('recarregar')} Gerar outro QR</button>`
            : `<button class="botao-leve" data-acao="whats-conectar" ${w.configurado ? '' : 'disabled'}>${ic('zap')} Conectar WhatsApp</button>
               ${w.estado === 'connecting' ? `<button class="botao-leve" data-acao="whats-conectar" data-novo="1">${ic('recarregar')} Zerar e gerar outro</button>` : ''}`}
      </div>
      <div class="acesso">
        <div class="acesso-titulo"><b>Quem pode dar ordens</b><span>Só esses números são atendidos. Mensagem de qualquer outro é ignorada.</span></div>
        <label class="acesso-voce"><input type="checkbox" id="acesso-voce" ${acessoAtual.chatVoce ? 'checked' : ''}> Chat "Você" do número conectado</label>
        <div class="acesso-lista">${acessoAtual.numeros.map((n) => `<span class="acesso-num">${esc(formata(n))}<button class="acesso-tirar" data-acao="acesso-remover" data-n="${esc(n)}" title="Tirar">${ic('fechar')}</button></span>`).join('') || '<span class="config-sutil">Nenhum outro número autorizado.</span>'}</div>
        <div class="acesso-novo"><input id="acesso-novo" inputmode="tel" placeholder="DDD + número, ex.: 27 99999-9999"><button class="botao-leve" data-acao="acesso-adicionar">${ic('mais')} Autorizar</button></div>
        <p class="config-dica">Exemplo: conecte o número business aqui e autorize o seu número pessoal. Você manda mensagem do pessoal pro business e o cérebro responde lá.</p>
      </div>
    </section>
    <section class="config-cartao">
      <div class="config-cabeca"><span class="config-icone azul">${ic('raio')}</span>
        <div class="config-titulo"><b>Aplicações extras</b><span>Programas que deixam o cérebro fazer mais coisas neste servidor</span></div></div>
      <ul class="extras">${ext.aplicacoes.map(itemExtra).join('')}</ul>
      <p class="config-dica">"Pedir na conversa" abre uma conversa com o pedido escrito. Aperte Enter e o Claude instala.</p>
    </section>
    <section class="config-cartao">
      <div class="config-cabeca"><span class="config-icone laranja">${ic('fluxo')}</span>
        <div class="config-titulo"><b>Conexões (MCP)</b><span>Ferramentas de fora que o Claude Code passa a usar direto</span></div></div>
      <ul class="extras">${ext.mcps.map(itemExtra).join('')}</ul>
      <p class="config-dica">Se a conexão pedir chave ou login, o Claude pede na conversa e guarda fora do cérebro, só neste servidor.</p>
    </section>
    <section class="config-cartao">
      <div class="config-cabeca"><span class="config-icone laranja">${ic('fluxo')}</span>
        <div class="config-titulo"><b>n8n</b><span>Automações que trabalham junto com o cérebro</span></div></div>
      <p class="config-dica">O n8n se conecta ao Claude Code por MCP, direto numa conversa. É só pedir.</p>
      <div class="config-botoes">
        ${cfg.n8n.url ? `<a class="botao-leve" href="${esc(cfg.n8n.url)}" target="_blank" rel="noopener">${ic('fluxo')} Abrir n8n</a>` : ''}
        <button class="botao-leve" data-acao="pedir" data-pedido="${esc(pedidoN8n)}">${ic('conversaNova')} Pedir numa conversa</button>
      </div>
    </section>
    <section class="config-cartao">
      <div class="config-cabeca"><span class="config-icone azul">${ic('globo')}</span>
        <div class="config-titulo"><b>Endereço</b><span>Como você acessa este painel</span></div></div>
      <dl class="config-linhas"><div><dt>Agora</dt><dd>${esc(cfg.servidor.painel)}</dd></div></dl>
      <p class="config-dica">Quer usar seu domínio (ex.: <code>cerebro.seusite.com</code>) com cadeado de HTTPS? Abra uma conversa e peça. O Claude te guia no DNS e configura o servidor.</p>
      <div class="config-botoes"><button class="botao-leve" data-acao="pedir" data-pedido="${esc(pedidoDominio)}">${ic('conversaNova')} Pedir numa conversa</button></div>
    </section>`;
}
async function conectarWhats(botao) {
  botao.disabled = true; qrVencido = false;
  try {
    const r = await api('/api/config/whatsapp/conectar', { method: 'POST', body: JSON.stringify({ novo: botao.dataset.novo === '1' }) });
    qrAtual = r.qr || null;
    if (r.estado !== 'open' && !r.qr) alert(r.erro || 'A Evolution não devolveu o QR. Tente "Zerar e gerar outro".');
  } catch (e) { alert(`Não consegui gerar o QR: ${e.message}`); } finally { pintarConfig(); }
}
async function desconectarWhats() {
  if (!confirm('Desconectar o WhatsApp deste cérebro? Pra conectar outro número, é só gerar o QR de novo depois.')) return;
  await api('/api/config/whatsapp/desconectar', { method: 'POST' }); qrAtual = null; pintarConfig();
}
async function salvarAcesso(mudar) {
  const a = { numeros: [...acessoAtual.numeros], chatVoce: acessoAtual.chatVoce };
  mudar(a);
  acessoAtual = await api('/api/config/whatsapp/acesso', { method: 'POST', body: JSON.stringify(a) });
  pintarConfig();
}
function autorizarNumero() {
  const campo = $('#acesso-novo'); const d = campo.value.replace(/\D/g, '');
  if (d.length < 10 || d.length > 13) { campo.focus(); campo.classList.add('invalido'); return; }
  campo.value = '';
  salvarAcesso((a) => { a.numeros.push(d); });
}
document.addEventListener('change', (e) => { if (e.target.id === 'acesso-voce') salvarAcesso((a) => { a.chatVoce = e.target.checked; }); });
document.addEventListener('keydown', (e) => { if (e.target.id === 'acesso-novo') { e.target.classList.remove('invalido'); if (e.key === 'Enter') autorizarNumero(); } });

// ---------- início ----------
async function iniciar() {
  $('#app').hidden = false;
  document.querySelector('[data-acao="recarregar-arvore"]').innerHTML = ic('recarregar');
  document.querySelector('.conversas-topo [data-acao="nova-conversa"]').innerHTML = ic('mais');
  document.querySelectorAll('.folha-topo .icone-botao').forEach((b) => { b.innerHTML = ic('fechar'); });
  $('[data-acao="conteudos-voltar"]').innerHTML = ic('voltar');
  $('.visor-acoes [data-acao="fechar-visor"]').innerHTML = ic('fechar');
  $('.visor-nav.ant').innerHTML = ic('voltar'); $('.visor-nav.prox').innerHTML = ic('seta');
  document.querySelectorAll('.ic-enviar').forEach((x) => { x.innerHTML = ic('enviar'); });
  document.querySelectorAll('.ic-baixar').forEach((x) => { x.innerHTML = ic('baixar'); });
  if (recuperar('arvoreFechada', false)) $('#arvore').classList.add('fechado');
  pintarDock();
  await Promise.all([carregarArvore(), atualizarEstado(), pintarComece()]);
  desenharEspaco();
  setInterval(() => atualizarEstado().catch(() => {}), 2000);
  setInterval(() => carregarArvoreSeMudou().catch(() => {}), 6000);
}
let assinaturaArvore = '';
async function carregarArvoreSeMudou() {
  const dados = await api('/api/arvore');
  const ass = JSON.stringify(dados);
  if (ass === assinaturaArvore) return;
  const primeira = !assinaturaArvore;
  assinaturaArvore = ass;
  if (!primeira) { const raiz = $('#arvore-lista'); raiz.innerHTML = ''; raiz.append(montarNos(dados)); }
}

fetch('/api/eu').then((r) => r.json()).then((r) => (r.logado ? iniciar() : mostrarLogin()));
