// EGI Brand · API do painel do cliente (/). Tudo é da empresa da sessão: cérebro, conversas, canais, marca.
import { Router } from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { arquivosDe, arvore, capaDeVideo, dentroDoVault, listarConteudos, montarGrafo } from '../arquivos.js';
import { STATUS_USO } from '../empresas.js';
import { catalogo, PRIMEIROS_TESTES } from '../extras.js';
import { motorValido } from '../motores.js';

const erro = (status, msg) => Object.assign(new Error(msg), { status });
// rotas que continuam abertas com a empresa suspensa (pra ver e pagar a conta)
const LIVRES_NO_BLOQUEIO = new Set(['/api/eu', '/api/assinatura', '/api/conta/senha', '/api/logout']);

export function rotasCliente({ db, auth, empresas, runtime, whatsapp, telegram, ponte, marca, cobranca, cfg }) {
  const r = Router();

  // ---------- login ----------
  r.post('/api/login', async (req, res) => {
    const { token, usuario } = await auth.entrar(req.body?.email, req.body?.senha, req.ip);
    res.set('Set-Cookie', auth.cookie(token, req.secure)).json({ ok: true, admin: usuario.papel === 'admin_egi', ir: usuario.papel === 'admin_egi' ? '/admin' : '/' });
  });
  r.post('/api/logout', async (req, res) => {
    await auth.sair(req);
    res.set('Set-Cookie', 'egi=; Path=/; Max-Age=0').json({ ok: true });
  });

  r.get('/api/eu', async (req, res) => {
    const s = await auth.sessao(req);
    if (!s) return res.json({ logado: false });
    const e = s.empresaId ? await empresas.buscar(s.empresaId) : null;
    res.json({
      logado: true, admin: s.admin, usuario: s.usuario,
      empresa: e ? { id: e.id, nome: e.nome, slug: e.slug, status: e.status, liberada: STATUS_USO.has(e.status) } : null,
      bloqueio: e && !STATUS_USO.has(e.status) ? await cobranca.situacao(e.id) : null,
    });
  });

  // ---------- daqui pra baixo: precisa de sessão com empresa ----------
  r.use('/api', async (req, res, next) => {
    if (req.path.startsWith('/admin')) return next('router');
    const s = await auth.sessao(req);
    if (!s) return res.status(401).json({ erro: 'Faça login.' });
    if (!s.empresaId) return res.status(409).json({ erro: s.admin ? 'Escolha uma empresa no painel EGI (/admin) e clique em "Abrir painel".' : 'Usuário sem empresa.' });
    const e = await empresas.buscar(s.empresaId);
    if (!e) return res.status(404).json({ erro: 'Empresa não encontrada.' });
    req.sessao = s; req.empresa = e;
    req.dono = s.admin || s.usuario.papel === 'dono';
    if (!STATUS_USO.has(e.status) && !LIVRES_NO_BLOQUEIO.has(`/api${req.path}`)) {
      return res.status(402).json({ erro: 'Acesso suspenso.', bloqueio: await cobranca.situacao(e.id) });
    }
    req.cerebro = STATUS_USO.has(e.status) ? runtime.de(e) : null;
    next();
  });
  const soDono = (req) => { if (!req.dono) throw erro(403, 'Só o dono da conta pode mudar isso.'); };

  // ---------- arquivos do cérebro ----------
  r.get('/api/arvore', (req, res) => res.json(arvore(req.cerebro.vault)));
  r.get('/api/arquivo', (req, res) => {
    const real = dentroDoVault(req.cerebro.vault, req.query.caminho);
    if (!real || !fs.statSync(real).isFile()) return res.status(404).json({ erro: 'Arquivo não encontrado.' });
    if (req.query.baixar) return res.download(real, path.basename(real), { dotfiles: 'allow' });
    // SVG enviado pelo cliente pode ter script: abre como download/inline isolado, nunca como página do painel
    if (/\.svg$/i.test(real)) res.set('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'; sandbox");
    res.sendFile(real, { dotfiles: 'allow', headers: { 'Cache-Control': 'no-cache' } });
  });
  r.get('/api/conteudos', (req, res) => res.json(listarConteudos(req.cerebro.vault)));
  r.get('/api/pasta', (req, res) => {
    const real = dentroDoVault(req.cerebro.vault, req.query.caminho);
    if (!real || !fs.statSync(real).isDirectory()) return res.status(404).json({ erro: 'Pasta não encontrada.' });
    const rel = path.relative(req.cerebro.vault, real).split(path.sep).join('/');
    res.json(arquivosDe(real, rel).sort((a, b) => a.caminho.localeCompare(b.caminho, 'pt', { numeric: true })));
  });
  r.get('/api/capa', async (req, res) => {
    const real = dentroDoVault(req.cerebro.vault, req.query.caminho);
    if (!real || !/\.(mp4|mov|webm|m4v)$/i.test(real)) return res.status(404).end();
    const capa = await capaDeVideo(real, path.join(req.cerebro.p.dados, 'capas'));
    if (!capa) return res.status(404).end();
    res.sendFile(capa, { dotfiles: 'allow', headers: { 'Cache-Control': 'private, max-age=86400' } });
  });
  // envio de arquivo do computador pro cérebro (corpo cru, um arquivo por requisição)
  r.post('/api/enviar', (req, res) => {
    const vault = req.cerebro.vault;
    const pedida = path.resolve(vault, String(req.query.pasta || 'conteudo/enviados').replace(/^\/+/, ''));
    if (!pedida.startsWith(vault + path.sep)) return res.status(400).json({ erro: 'Pasta inválida.' });
    if (!fs.existsSync(pedida)) { fs.mkdirSync(pedida, { recursive: true }); empresas.entregar(req.empresa, pedida, true); }
    const pasta = dentroDoVault(vault, path.relative(vault, pedida));
    if (!pasta || !fs.statSync(pasta).isDirectory()) return res.status(400).json({ erro: 'Pasta inválida.' });
    let nome = path.basename(String(req.query.nome || '')).replace(/[/\\\0]/g, '').trim();
    if (!nome || nome.startsWith('.')) return res.status(400).json({ erro: 'Nome de arquivo inválido.' });
    const ext = path.extname(nome); const raiz = nome.slice(0, nome.length - ext.length);
    for (let i = 2; fs.existsSync(path.join(pasta, nome)); i++) nome = `${raiz}-${i}${ext}`;
    const destino = path.join(pasta, nome); const tmp = `${destino}.enviando`;
    const out = fs.createWriteStream(tmp);
    req.pipe(out);
    out.on('finish', () => {
      fs.renameSync(tmp, destino); empresas.entregar(req.empresa, destino);
      const rel = path.relative(vault, destino).split(path.sep).join('/');
      req.cerebro.enviados.add(rel); res.json({ caminho: rel });
    });
    const falhou = () => { try { fs.unlinkSync(tmp); } catch { /* */ } if (!res.headersSent) res.status(500).json({ erro: 'Falhou no meio do envio.' }); };
    out.on('error', falhou); req.on('aborted', falhou);
  });
  r.get('/api/grafo', (req, res) => res.json(montarGrafo(req.cerebro.vault)));

  // ---------- configurações: canais ----------
  r.get('/api/config', async (req, res) => {
    const e = req.empresa;
    const [w, acesso, t, p] = await Promise.all([
      whatsapp.estado(e).catch((x) => ({ estado: 'indisponivel', erro: x.message })), whatsapp.acesso(e), telegram.estado(e).catch((x) => ({ conectado: false, erro: x.message })), ponte.estado(e),
    ]);
    res.json({
      whatsapp: { ...w, acesso }, telegram: t, ponte: req.dono ? p : { ativo: p.ativo },
      ponteUrl: `${cfg.urlPublica}/hooks/ponte/${e.id}`,
      servidor: { painel: cfg.urlPublica || `${req.protocol}://${req.get('host')}` }, dono: req.dono,
    });
  });
  r.post('/api/config/whatsapp/conectar', async (req, res) => { soDono(req); res.json(await whatsapp.conectar(req.empresa, { novo: Boolean(req.body?.novo) })); });
  r.get('/api/config/whatsapp/qr', async (req, res) => res.json(await whatsapp.qr(req.empresa)));
  r.post('/api/config/whatsapp/desconectar', async (req, res) => { soDono(req); res.json(await whatsapp.desconectar(req.empresa)); });
  r.post('/api/config/whatsapp/acesso', async (req, res) => {
    soDono(req);
    res.json(await whatsapp.salvarAcesso(req.empresa, { numeros: Array.isArray(req.body?.numeros) ? req.body.numeros : [], chatVoce: req.body?.chatVoce !== false }));
  });
  r.post('/api/config/telegram', async (req, res) => { soDono(req); await telegram.configurar(req.empresa, req.body?.token); res.json(await telegram.estado(req.empresa)); });
  r.delete('/api/config/telegram', async (req, res) => { soDono(req); await telegram.desligar(req.empresa); res.json({ ok: true }); });
  r.post('/api/config/telegram/codigo', async (req, res) => { soDono(req); res.json(await telegram.gerarCodigo(req.empresa)); });
  r.delete('/api/config/telegram/acesso/:chat', async (req, res) => { soDono(req); await telegram.remover(req.empresa, req.params.chat); res.json({ ok: true }); });
  r.post('/api/config/ponte', async (req, res) => {
    soDono(req);
    res.json(await ponte.configurar(req.empresa, { ativo: req.body?.ativo !== false, permitidos: Array.isArray(req.body?.permitidos) ? req.body.permitidos : [] }));
  });

  // ---------- motores (Claude Code, Codex, Antigravity) com o login da empresa ----------
  r.get('/api/config/motores', async (req, res) => res.json({ padrao: req.empresa.motor_padrao, canais: req.empresa.motor_canais, whatsapp: req.empresa.motor_canais, motores: await req.cerebro.motores() }));
  r.post('/api/config/motores', async (req, res) => {
    soDono(req);
    const campos = {};
    if (motorValido(req.body?.padrao)) campos.motor_padrao = req.body.padrao;
    const canais = req.body?.canais ?? req.body?.whatsapp;
    if (motorValido(canais)) campos.motor_canais = canais;
    const e = await empresas.atualizar(req.empresa.id, campos, req.sessao.usuario.id);
    runtime.de(e);
    res.json({ padrao: e.motor_padrao, canais: e.motor_canais, whatsapp: e.motor_canais });
  });

  // ---------- variáveis de ambiente da empresa (chaves de API do cliente) ----------
  r.get('/api/config/variaveis', async (req, res) => { soDono(req); res.json(await empresas.listarVariaveis(req.empresa.id)); });
  r.put('/api/config/variaveis/:chave', async (req, res) => {
    soDono(req);
    res.json({ ok: true, chave: await empresas.definirVariavel(req.empresa.id, req.params.chave, req.body?.valor, req.body?.segredo !== false, req.sessao.usuario.id) });
  });
  r.delete('/api/config/variaveis/:chave', async (req, res) => { soDono(req); res.json({ ok: await empresas.removerVariavel(req.empresa.id, req.params.chave, req.sessao.usuario.id) }); });

  // ---------- extras ----------
  r.get('/api/extras', (req, res) => res.json(catalogo(req.cerebro.vault, req.cerebro.p.casa)));
  r.get('/api/primeiros-testes', (req, res) => res.json(PRIMEIROS_TESTES));

  // ---------- marca (brandbook, logos, fontes, cores, tom de voz) ----------
  r.get('/api/marca', async (req, res) => {
    const [perfil, arquivos] = await Promise.all([marca.perfil(req.empresa.id), marca.arquivos(req.empresa.id)]);
    res.json({ perfil, arquivos, categorias: Object.fromEntries(Object.entries(marca.CATEGORIAS).map(([k, v]) => [k, { rotulo: v.rotulo, ext: v.ext }])) });
  });
  r.put('/api/marca/perfil', async (req, res) => res.json(await marca.salvarPerfil(req.empresa, req.body || {})));
  r.post('/api/marca/arquivos', async (req, res) => {
    res.status(201).json(await marca.receber(req.empresa, req, { categoria: String(req.query.categoria || ''), nome: String(req.query.nome || ''), usuarioId: req.sessao.usuario.id }));
  });
  r.delete('/api/marca/arquivos/:id', async (req, res) => {
    if (!/^[0-9a-f-]{36}$/.test(req.params.id)) throw erro(404, 'Arquivo não encontrado.');
    res.json({ ok: await marca.remover(req.empresa, req.params.id, req.sessao.usuario.id) });
  });

  // ---------- assinatura (o cliente vê a situação e paga) ----------
  r.get('/api/assinatura', async (req, res) => {
    const situacao = await cobranca.situacao(req.empresa.id);
    const cobrancas = req.dono ? (await cobranca.cobrancasDe(req.empresa.id)).map((c) => ({ id: c.id, tipo: c.tipo, valor_centavos: c.valor_centavos, vencimento: c.vencimento, status: c.status, link_fatura: c.link_fatura, pago_em: c.pago_em })) : [];
    res.json({ empresa: { nome: req.empresa.nome, status: req.empresa.status, valor_mensal_centavos: req.empresa.valor_mensal_centavos, dia_vencimento: req.empresa.dia_vencimento }, situacao, cobrancas });
  });

  // ---------- conta e equipe ----------
  r.post('/api/conta/senha', async (req, res) => { await auth.trocarSenha(req.sessao.usuario.id, req.body?.atual, req.body?.nova); res.json({ ok: true }); });
  r.get('/api/equipe', async (req, res) => res.json(await db.todos('select id, email, nome, papel, ativo, ultimo_login from usuarios where empresa_id = $1 order by criado_em', [req.empresa.id])));
  r.post('/api/equipe', async (req, res) => {
    soDono(req);
    const u = await auth.criarUsuario({ empresaId: req.empresa.id, email: req.body?.email, nome: req.body?.nome || '', papel: 'membro' });
    await empresas.auditar(req.empresa.id, req.sessao.usuario.id, 'usuario.criado', { email: u.usuario.email, papel: 'membro' });
    res.status(201).json(u);
  });
  r.delete('/api/equipe/:id', async (req, res) => {
    soDono(req);
    const u = await db.um("update usuarios set ativo = false where id = $1 and empresa_id = $2 and papel = 'membro' returning id", [req.params.id, req.empresa.id]);
    if (!u) throw erro(404, 'Membro não encontrado.');
    await db.query('delete from sessoes where usuario_id = $1', [u.id]);
    res.json({ ok: true });
  });

  // ---------- conversas ----------
  r.post('/api/conversas', async (req, res) => {
    const conv = req.cerebro.criarConversa(motorValido(req.body?.motor) ? { motor: req.body.motor } : {});
    await req.cerebro.iniciarTerminal(conv, Math.min(Number(req.body?.cols) || 120, 400), Math.min(Number(req.body?.rows) || 32, 200), typeof req.body?.pedido === 'string' ? req.body.pedido : '');
    res.json(conv);
  });
  r.delete('/api/conversas/:id', (req, res) => (req.cerebro.arquivar(req.params.id) ? res.json({ ok: true }) : res.status(404).end()));
  r.get('/api/estado', (req, res) => res.json(req.cerebro.estado()));
  r.get('/api/conversas/:id/historico', (req, res) => {
    if (!/^[0-9a-f-]{36}$/.test(req.params.id)) return res.status(400).end();
    res.json(req.cerebro.historico(req.params.id));
  });

  return r;
}
