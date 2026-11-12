// EGI Brand · arquivos do cérebro de uma empresa (árvore, conteúdos, capas, grafo). Tudo recebe o `vault` (pasta
// real do cérebro) e nunca sai dele: todo caminho pedido passa por realpath e é conferido contra o vault.
import { spawn } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { MIDIA } from './runtime.js';

const IMAGEM = /\.(png|jpe?g|webp|gif|svg)$/i;
const VIDEO = /\.(mp4|mov|webm|m4v)$/i;
const OCULTOS = new Set(['.git', 'node_modules', '.DS_Store', '.obsidian', '.trash', '.arquivo']);
const IGNORAR = (n) => n.startsWith('.') || n === 'CLAUDE.md' || n === 'AGENTS.md';

export function dentroDoVault(vault, rel) {
  const alvo = path.resolve(vault, String(rel || '').replace(/^\/+/, ''));
  let real;
  try { real = fs.realpathSync(alvo); } catch { return null; }
  return real === vault || real.startsWith(vault + path.sep) ? real : null;
}

export function arvore(dir, rel = '', profundidade = 0) {
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

export function arquivosDe(absDir, relDir) {
  const lista = [];
  (function andar(dir, rel, prof) {
    if (prof > 10) return;
    let itens = [];
    try { itens = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const d of itens) {
      if (IGNORAR(d.name)) continue;
      const abs = path.join(dir, d.name); const r = `${rel}/${d.name}`;
      if (d.isDirectory()) andar(abs, r, prof + 1);
      else if (d.isFile()) { const st = fs.statSync(abs); lista.push({ caminho: r, nome: d.name, tamanho: st.size, mtime: st.mtimeMs }); }
    }
  })(absDir, relDir, 0);
  return lista;
}

function escolherCapa(arquivos) {
  const midia = arquivos.filter((a) => IMAGEM.test(a.nome) || VIDEO.test(a.nome)).sort((a, b) => a.caminho.localeCompare(b.caminho, 'pt', { numeric: true }));
  const peso = (a) => (/^capa\./i.test(a.nome) ? 0 : IMAGEM.test(a.nome) && a.caminho.includes('/entrega/') ? 1 : IMAGEM.test(a.nome) && !a.caminho.includes('/original/') ? 2
    : IMAGEM.test(a.nome) ? 3 : /depois|final|editado/i.test(a.nome) ? 4 : 5);
  const c = midia.sort((a, b) => peso(a) - peso(b))[0];
  return c ? { caminho: c.caminho, tipo: IMAGEM.test(c.nome) ? 'imagem' : 'video' } : null;
}

export function listarConteudos(vault) {
  const base = path.join(vault, 'conteudo');
  let tipos = [];
  try { tipos = fs.readdirSync(base, { withFileTypes: true }).filter((d) => d.isDirectory() && !IGNORAR(d.name)); } catch { return []; }
  return tipos.map((t) => {
    const absT = path.join(base, t.name); const relT = `conteudo/${t.name}`;
    const itens = fs.readdirSync(absT, { withFileTypes: true }).filter((d) => !IGNORAR(d.name)).map((d) => {
      const rel = `${relT}/${d.name}`;
      const arquivos = d.isDirectory() ? arquivosDe(path.join(absT, d.name), rel) : [(() => { const st = fs.statSync(path.join(absT, d.name)); return { caminho: rel, nome: d.name, tamanho: st.size, mtime: st.mtimeMs }; })()];
      return { nome: d.name, caminho: rel, pasta: d.isDirectory(), arquivos: arquivos.length, mtime: Math.max(0, ...arquivos.map((a) => a.mtime)), capa: escolherCapa(arquivos) };
    }).sort((a, b) => b.mtime - a.mtime);
    return { nome: t.name, caminho: relT, itens, mtime: Math.max(0, ...itens.map((i) => i.mtime)) };
  }).sort((a, b) => b.mtime - a.mtime);
}

// capa de vídeo: um quadro em JPG, gerado uma vez pelo ffmpeg e guardado no cache da empresa
const gerando = new Map();
export async function capaDeVideo(real, pastaCapas) {
  fs.mkdirSync(pastaCapas, { recursive: true });
  const st = fs.statSync(real);
  const destino = path.join(pastaCapas, crypto.createHash('sha1').update(`${real}:${st.mtimeMs}`).digest('hex') + '.jpg');
  if (!fs.existsSync(destino)) {
    if (!gerando.has(destino)) gerando.set(destino, new Promise((ok) => {
      const f = spawn('ffmpeg', ['-y', '-ss', '1', '-i', real, '-frames:v', '1', '-vf', 'scale=480:-2', '-q:v', '4', destino], { stdio: 'ignore' });
      f.on('error', () => ok()); f.on('close', () => ok());
    }).finally(() => gerando.delete(destino)));
    await gerando.get(destino);
  }
  return fs.existsSync(destino) ? destino : null;
}

export function montarGrafo(vault) {
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
  })(arvore(vault), null);
  for (const n of nos.filter((x) => x.tipo === 'nota')) {
    let txt = ''; try { txt = fs.readFileSync(path.join(vault, n.id), 'utf8'); } catch { continue; }
    const dir = path.posix.dirname(n.id);
    const alvos = new Set();
    for (const m of txt.matchAll(/!?\[\[([^\]|#]+)/g)) { const c = porNome.get(path.posix.basename(m[1].trim()).replace(/\.md$/i, '').toLowerCase()); if (c) alvos.add(c); }
    for (const m of txt.matchAll(/\]\(([^)#\s]+)\)/g)) { let alvo; try { alvo = decodeURI(m[1]); } catch { continue; } const c = path.posix.normalize(path.posix.join(dir, alvo)); if (existe.has(c)) alvos.add(c); }
    for (const m of txt.matchAll(/`([^`\s]+)`/g)) { const c = m[1].replace(/\/$/, ''); if (existe.has(c)) alvos.add(c); else { const r = path.posix.normalize(path.posix.join(dir, c)); if (existe.has(r)) alvos.add(r); } }
    for (const a of alvos) if (a !== n.id) ligacoes.push({ de: n.id, para: a, tipo: 'link' });
  }
  return { nos, ligacoes };
}
