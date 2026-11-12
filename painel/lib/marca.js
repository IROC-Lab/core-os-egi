// EGI Brand · marca do cliente: brandbook (PDF), logos, fontes e imagens + perfil (cores, fontes, tom de voz).
// Os arquivos vão pra marca/ DENTRO do cérebro da empresa, então o agente lê direto; marca/CLAUDE.md é o índice,
// reescrito a cada mudança. PDF do brandbook ganha um .txt ao lado (Codex e Antigravity não leem PDF sozinhos).
import { execFile } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

export const CATEGORIAS = {
  brandbook: { pasta: 'brandbook', ext: ['pdf'], rotulo: 'Brandbook' },
  logo: { pasta: 'logos', ext: ['svg', 'png', 'jpg', 'jpeg', 'webp', 'pdf', 'ai', 'eps'], rotulo: 'Logos' },
  fonte: { pasta: 'fontes', ext: ['ttf', 'otf', 'woff', 'woff2', 'zip'], rotulo: 'Fontes' },
  imagem: { pasta: 'imagens', ext: ['png', 'jpg', 'jpeg', 'webp', 'gif', 'svg', 'mp4', 'mov'], rotulo: 'Imagens de referência' },
  outro: { pasta: 'outros', ext: ['pdf', 'png', 'jpg', 'jpeg', 'zip', 'docx', 'pptx', 'txt', 'md'], rotulo: 'Outros' },
};
const MIME = { pdf: 'application/pdf', svg: 'image/svg+xml', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif',
  ttf: 'font/ttf', otf: 'font/otf', woff: 'font/woff', woff2: 'font/woff2', zip: 'application/zip', mp4: 'video/mp4', mov: 'video/quicktime',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation', txt: 'text/plain', md: 'text/markdown', ai: 'application/postscript', eps: 'application/postscript' };

export function nomeSeguro(nome) {
  const base = path.basename(String(nome || '')).normalize('NFD').replace(/[̀-ͯ]/g, '');
  const ext = path.extname(base).toLowerCase();
  const raiz = base.slice(0, base.length - ext.length).replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^[-.]+|-+$/g, '').slice(0, 80) || 'arquivo';
  return `${raiz}${ext.replace(/[^a-z0-9.]/g, '')}`;
}
const HEX = /^#[0-9a-f]{6}$/i;

export function criarMarca({ db, empresas, maxBytes = 60 * 1024 * 1024, log = console.log }) {
  const pastaMarca = (e) => path.join(empresas.pastas(e).cerebro, 'marca');

  async function perfil(empresaId) {
    return (await db.um('select cores, fontes, tom_de_voz, publico, slogan, atualizado_em from marcas where empresa_id = $1', [empresaId]))
      || { cores: [], fontes: [], tom_de_voz: '', publico: '', slogan: '' };
  }
  async function salvarPerfil(e, d) {
    const cores = (Array.isArray(d.cores) ? d.cores : []).map((c) => ({ nome: String(c.nome || '').slice(0, 40), hex: String(c.hex || '').trim() })).filter((c) => HEX.test(c.hex)).slice(0, 16);
    const fontes = (Array.isArray(d.fontes) ? d.fontes : []).map((x) => String(x).trim().slice(0, 60)).filter(Boolean).slice(0, 8);
    const txt = (v, n) => String(v || '').slice(0, n);
    await db.query(`insert into marcas (empresa_id, cores, fontes, tom_de_voz, publico, slogan) values ($1,$2,$3,$4,$5,$6)
      on conflict (empresa_id) do update set cores = excluded.cores, fontes = excluded.fontes, tom_de_voz = excluded.tom_de_voz,
      publico = excluded.publico, slogan = excluded.slogan, atualizado_em = now()`,
    [e.id, JSON.stringify(cores), JSON.stringify(fontes), txt(d.tom_de_voz, 4000), txt(d.publico, 2000), txt(d.slogan, 200)]);
    await escreverIndice(e);
    return perfil(e.id);
  }

  const arquivos = (empresaId) => db.todos('select id, categoria, nome_original, caminho, mime, tamanho, criado_em from marca_arquivos where empresa_id = $1 order by categoria, criado_em', [empresaId]);

  // recebe o corpo cru da requisição (um arquivo por vez) e grava em marca/<pasta>/
  async function receber(e, req, { categoria, nome, usuarioId }) {
    const cat = CATEGORIAS[categoria];
    if (!cat) throw Object.assign(new Error('Categoria inválida.'), { status: 400 });
    let arquivo = nomeSeguro(nome);
    const ext = path.extname(arquivo).slice(1).toLowerCase();
    if (!cat.ext.includes(ext)) throw Object.assign(new Error(`${cat.rotulo}: aceita ${cat.ext.join(', ')}.`), { status: 400 });
    const tamanhoDeclarado = Number(req.headers['content-length'] || 0);
    if (tamanhoDeclarado > maxBytes) throw Object.assign(new Error(`Arquivo maior que ${Math.round(maxBytes / 1048576)} MB.`), { status: 413 });
    const dir = path.join(pastaMarca(e), cat.pasta);
    fs.mkdirSync(dir, { recursive: true });
    const raiz = arquivo.slice(0, arquivo.length - ext.length - 1);
    for (let i = 2; fs.existsSync(path.join(dir, arquivo)); i++) arquivo = `${raiz}-${i}.${ext}`;
    const destino = path.join(dir, arquivo); const tmp = `${destino}.enviando`;
    const hash = crypto.createHash('sha256'); let total = 0;
    await new Promise((ok, falha) => {
      const out = fs.createWriteStream(tmp, { mode: 0o640 });
      req.on('data', (pedaco) => {
        total += pedaco.length; hash.update(pedaco);
        if (total > maxBytes) { req.unpipe(out); out.destroy(); req.destroy(); falha(Object.assign(new Error('Arquivo grande demais.'), { status: 413 })); }
      });
      req.pipe(out);
      out.on('finish', ok); out.on('error', falha); req.on('aborted', () => falha(new Error('Envio interrompido.')));
    }).catch((err) => { try { fs.unlinkSync(tmp); } catch { /* */ } throw err; });
    if (!total) { fs.unlinkSync(tmp); throw Object.assign(new Error('Arquivo vazio.'), { status: 400 }); }
    fs.renameSync(tmp, destino);
    empresas.entregar(e, dir, true);
    const caminho = path.relative(empresas.pastas(e).cerebro, destino).split(path.sep).join('/');
    const linha = await db.um(`insert into marca_arquivos (empresa_id, categoria, nome_original, caminho, mime, tamanho, sha256, enviado_por)
      values ($1,$2,$3,$4,$5,$6,$7,$8) returning id, categoria, nome_original, caminho, mime, tamanho, criado_em`,
    [e.id, categoria, String(nome).slice(0, 200), caminho, MIME[ext] || 'application/octet-stream', total, hash.digest('hex'), usuarioId || null]);
    if (ext === 'pdf') await extrairTexto(e, destino);
    await empresas.auditar(e.id, usuarioId, 'marca.arquivo_enviado', { categoria, caminho, tamanho: total });
    await escreverIndice(e);
    return linha;
  }

  // PDF -> .txt ao lado (pdftotext do poppler). Sem o programa, segue sem o texto.
  function extrairTexto(e, pdf) {
    return new Promise((ok) => {
      const txt = pdf.replace(/\.pdf$/i, '.txt');
      execFile('pdftotext', ['-layout', '-enc', 'UTF-8', pdf, txt], { timeout: 120_000 }, (err) => {
        if (err) log(`[marca] ${e.slug}: não extraí o texto de ${path.basename(pdf)}: ${err.code === 'ENOENT' ? 'pdftotext não instalado' : err.message}`);
        else { try { empresas.entregar(e, txt); } catch { /* */ } }
        ok();
      });
    });
  }

  // regra do cérebro: nunca apagar; o arquivo vai pra marca/.arquivo/AAAA-MM-DD-nome
  async function remover(e, arquivoId, usuarioId) {
    const a = await db.um('select * from marca_arquivos where id = $1 and empresa_id = $2', [arquivoId, e.id]);
    if (!a) return false;
    const cerebro = empresas.pastas(e).cerebro;
    const origem = path.join(cerebro, a.caminho);
    const arquivoDir = path.join(pastaMarca(e), '.arquivo');
    fs.mkdirSync(arquivoDir, { recursive: true });
    const dia = new Date().toISOString().slice(0, 10);
    for (const p of [origem, origem.replace(/\.pdf$/i, '.txt')]) {
      if (fs.existsSync(p) && (p === origem || /\.pdf$/i.test(origem))) fs.renameSync(p, path.join(arquivoDir, `${dia}-${path.basename(p)}`));
    }
    empresas.entregar(e, arquivoDir, true);
    await db.query('delete from marca_arquivos where id = $1', [a.id]);
    await empresas.auditar(e.id, usuarioId, 'marca.arquivo_removido', { caminho: a.caminho });
    await escreverIndice(e);
    return true;
  }

  async function escreverIndice(e) {
    const p = await perfil(e.id);
    const lista = await arquivos(e.id);
    const blocos = Object.entries(CATEGORIAS).map(([cat, c]) => {
      const itens = lista.filter((a) => a.categoria === cat);
      if (!itens.length) return '';
      return `### ${c.rotulo}\n${itens.map((a) => {
        const txt = /\.pdf$/i.test(a.caminho) ? ` (texto extraído: \`${a.caminho.replace(/^marca\//, '').replace(/\.pdf$/i, '.txt')}\`)` : '';
        return `- \`${a.caminho.replace(/^marca\//, '')}\`: ${a.nome_original}${txt}`;
      }).join('\n')}`;
    }).filter(Boolean).join('\n\n');
    const corpo = `# marca/ · Identidade da ${e.nome}
> Índice gerado pelo EGI Brand a partir do que a empresa cadastrou no painel (aba Marca). Não editar à mão: mude no painel.

## Regras pra qualquer peça (carrossel, thumbnail, post, site, apresentação, e-mail)
1. Antes de produzir, leia o brandbook (o PDF; se o seu motor não lê PDF, o \`.txt\` ao lado).
2. Use só as cores e fontes abaixo. Nunca invente cor ou troque o logo.
3. Logo: use o arquivo de \`logos/\` que combina com o fundo (versão clara em fundo escuro e vice-versa).
4. Escreva no tom de voz da marca.

## Perfil
- **Slogan:** ${p.slogan || '(não informado)'}
- **Público:** ${p.publico || '(não informado)'}
- **Cores:** ${(p.cores || []).map((c) => `${c.nome ? `${c.nome} ` : ''}\`${c.hex}\``).join(', ') || '(não informadas: siga o brandbook)'}
- **Fontes:** ${(p.fontes || []).join(', ') || '(não informadas: siga o brandbook)'}

## Tom de voz
${p.tom_de_voz || '(não informado: siga o brandbook)'}

## Arquivos
${blocos || 'Nenhum arquivo enviado ainda. Peça ao dono pra subir o brandbook e os logos no painel (aba Marca).'}
`;
    const dir = pastaMarca(e);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'CLAUDE.md'), corpo);
    empresas.entregar(e, path.join(dir, 'CLAUDE.md'));
    return corpo;
  }

  return { perfil, salvarPerfil, arquivos, receber, remover, escreverIndice, CATEGORIAS };
}
