// EGI Brand · API do painel administrador da EGI (/admin). Só a equipe EGI (papel admin_egi).
import { Router } from 'express';
import { STATUS_USO } from '../empresas.js';

const uuid = /^[0-9a-f-]{36}$/;
const erro = (status, msg) => Object.assign(new Error(msg), { status });
const centavos = (v) => {
  if (v === undefined || v === null || v === '') return undefined;
  const n = typeof v === 'number' ? v : Number(String(v).replace(/[^\d,.-]/g, '').replace(/\.(?=\d{3}(\D|$))/g, '').replace(',', '.'));
  if (!Number.isFinite(n) || n < 0) throw erro(400, 'Valor inválido.');
  return Math.round(n * 100);
};

export function rotasAdmin({ db, auth, empresas, cobranca, avisos, runtime, whatsapp, telegram, ponte, registro, asaas, cfg, log }) {
  const r = Router();

  r.use('/api/admin', async (req, res, next) => {
    const s = await auth.sessao(req);
    if (!s) return res.status(401).json({ erro: 'Faça login.' });
    if (!s.admin) return res.status(403).json({ erro: 'Só a equipe EGI.' });
    req.sessao = s;
    next();
  });
  r.param('id', (req, res, next, id) => (uuid.test(id) ? next() : res.status(404).json({ erro: 'Não encontrado.' })));
  const empresaOu404 = async (id) => { const e = await empresas.buscar(id); if (!e) throw erro(404, 'Empresa não encontrada.'); return e; };

  // ---------- visão geral ----------
  r.get('/api/admin/resumo', async (req, res) => {
    const porStatus = Object.fromEntries((await db.todos('select status, count(*)::int as n from empresas group by status')).map((x) => [x.status, x.n]));
    const mrr = await db.um("select coalesce(sum(valor_mensal_centavos),0)::bigint as v from empresas where status in ('ativa','inadimplente')");
    const atraso = await db.um("select count(*)::int as n, coalesce(sum(valor_centavos),0)::bigint as v from cobrancas where status in ('pendente','vencida') and vencimento < current_date and tipo <> 'setup'");
    const recebido = await db.um("select coalesce(sum(valor_centavos),0)::bigint as v from cobrancas where status = 'paga' and pago_em >= date_trunc('month', now())");
    const errosAsaas = await db.um('select count(*)::int as n from eventos_asaas where erro is not null and recebido_em > now() - interval \'7 days\'');
    res.json({ porStatus, mrrCentavos: Number(mrr.v), emAtraso: { quantidade: atraso.n, centavos: Number(atraso.v) }, recebidoNoMesCentavos: Number(recebido.v), errosAsaas7d: errosAsaas.n, asaas: { configurado: asaas.configurado, ambiente: asaas.ambiente, webhook: Boolean(cfg.asaas.tokenWebhook) }, evolution: whatsapp.configurado(), diasSuspensao: cfg.cobranca.diasSuspensao });
  });

  // ---------- planos ----------
  r.get('/api/admin/planos', async (req, res) => res.json(await db.todos('select * from planos order by ativo desc, valor_mensal_centavos')));
  r.post('/api/admin/planos', async (req, res) => {
    const b = req.body || {};
    if (!String(b.nome || '').trim()) throw erro(400, 'Informe o nome do plano.');
    const p = await db.um('insert into planos (nome, descricao, valor_mensal_centavos, valor_setup_centavos, limites) values ($1,$2,$3,$4,$5) returning *',
      [b.nome.trim(), b.descricao || '', centavos(b.valor_mensal) ?? 0, centavos(b.valor_setup) ?? 0, JSON.stringify(b.limites || {})]);
    res.status(201).json(p);
  });
  r.put('/api/admin/planos/:id', async (req, res) => {
    const b = req.body || {};
    const p = await db.um(`update planos set nome = coalesce($2, nome), descricao = coalesce($3, descricao), valor_mensal_centavos = coalesce($4, valor_mensal_centavos),
      valor_setup_centavos = coalesce($5, valor_setup_centavos), ativo = coalesce($6, ativo) where id = $1 returning *`,
    [req.params.id, b.nome ?? null, b.descricao ?? null, centavos(b.valor_mensal) ?? null, centavos(b.valor_setup) ?? null, typeof b.ativo === 'boolean' ? b.ativo : null]);
    if (!p) throw erro(404, 'Plano não encontrado.');
    res.json(p);
  });

  // ---------- empresas ----------
  r.get('/api/admin/empresas', async (req, res) => res.json(await empresas.listar({ status: req.query.status || undefined, busca: req.query.busca || undefined })));

  // cadastra a empresa, cria o usuário dono e (por padrão) já contrata: cobra o setup no Asaas e manda o link
  r.post('/api/admin/empresas', async (req, res) => {
    const b = req.body || {};
    const dados = { ...b, valor_mensal_centavos: centavos(b.valor_mensal), valor_setup_centavos: centavos(b.valor_setup) };
    for (const k of ['valor_mensal_centavos', 'valor_setup_centavos']) if (dados[k] === undefined) delete dados[k];
    const donoEmail = String(b.usuario_email || b.email || '').trim().toLowerCase();
    if (donoEmail && await db.um('select 1 from usuarios where lower(email) = $1', [donoEmail])) throw erro(409, `Já existe um usuário com o e-mail ${donoEmail}. Informe outro e-mail de acesso.`);
    const e = await empresas.criar(dados, req.sessao.usuario.id);
    const dono = donoEmail ? await auth.criarUsuario({ empresaId: e.id, email: donoEmail, nome: b.responsavel || '', papel: 'dono' }) : null;
    let contratacao = null; let aviso = null;
    if (b.contratar !== false) {
      try { contratacao = await cobranca.contratar(e.id, { cobrarSetup: b.cobrar_setup !== false, por: req.sessao.usuario.id }); } catch (err) {
        aviso = `Empresa criada, mas a cobrança não saiu: ${err.message} Tente de novo em "Contratar" na ficha da empresa.`;
        log(`[admin] contratar ${e.slug}: ${err.message}`);
      }
    }
    res.status(201).json({ empresa: contratacao?.empresa || await empresas.buscar(e.id), setup: contratacao?.setup || null, dono: dono?.usuario || null, senhaTemporaria: dono?.senhaTemporaria || null, aviso });
  });

  r.get('/api/admin/empresas/:id', async (req, res) => {
    const e = await empresaOu404(req.params.id);
    const [cobrancas, usuarios, variaveis, situacao, avisosRecentes, eventos, canais] = await Promise.all([
      cobranca.cobrancasDe(e.id),
      db.todos('select id, email, nome, papel, ativo, ultimo_login, criado_em from usuarios where empresa_id = $1 order by criado_em', [e.id]),
      empresas.listarVariaveis(e.id),
      cobranca.situacao(e.id),
      db.todos('select tipo, canal, destino, status, erro, enviado_em from avisos where empresa_id = $1 order by enviado_em desc limit 30', [e.id]),
      db.todos('select acao, detalhe, criado_em from auditoria where empresa_id = $1 order by criado_em desc limit 40', [e.id]),
      db.todos('select tipo, ativo, estado, config, motor, agente, atualizado_em from canais where empresa_id = $1', [e.id]),
    ]);
    const cerebro = runtime.existente(e.id);
    res.json({ empresa: e, cobrancas, usuarios, variaveis, situacao, avisos: avisosRecentes, auditoria: eventos,
      canais: canais.map((c) => ({ ...c, config: { instancia: c.config.instancia, bot: c.config.bot } })),
      uso: cerebro ? { conversas: cerebro.conversas.filter((c) => !c.arquivada).length, terminais: cerebro.vivos.size, rodando: cerebro.procs.size } : null });
  });

  r.put('/api/admin/empresas/:id', async (req, res) => {
    const antes = await empresaOu404(req.params.id);
    const b = { ...req.body };
    if ('valor_mensal' in b) { b.valor_mensal_centavos = centavos(b.valor_mensal); delete b.valor_mensal; }
    if ('valor_setup' in b) { b.valor_setup_centavos = centavos(b.valor_setup); delete b.valor_setup; }
    let e = await empresas.atualizar(antes.id, b, req.sessao.usuario.id);
    if (b.valor_mensal_centavos != null && b.valor_mensal_centavos !== antes.valor_mensal_centavos && e.asaas_assinatura_id) {
      e = await cobranca.mudarValorMensal(e.id, b.valor_mensal_centavos, req.sessao.usuario.id);
    }
    runtime.existente(e.id)?.atualizarEmpresa(e);
    res.json(e);
  });

  r.post('/api/admin/empresas/:id/contratar', async (req, res) => {
    await empresaOu404(req.params.id);
    res.json(await cobranca.contratar(req.params.id, { cobrarSetup: req.body?.cobrar_setup !== false, por: req.sessao.usuario.id }));
  });
  r.post('/api/admin/empresas/:id/suspender', async (req, res) => {
    await empresaOu404(req.params.id);
    res.json(await cobranca.suspenderManual(req.params.id, String(req.body?.motivo || '').slice(0, 300), req.sessao.usuario.id));
  });
  r.post('/api/admin/empresas/:id/reativar', async (req, res) => {
    await empresaOu404(req.params.id);
    res.json(await cobranca.reativarManual(req.params.id, req.sessao.usuario.id));
  });
  r.post('/api/admin/empresas/:id/cancelar', async (req, res) => {
    await empresaOu404(req.params.id);
    if (req.body?.confirmar !== true) throw erro(400, 'Confirme o cancelamento (confirmar: true).');
    res.json(await cobranca.cancelar(req.params.id, req.sessao.usuario.id));
  });
  r.post('/api/admin/empresas/:id/sincronizar', async (req, res) => {
    await empresaOu404(req.params.id);
    res.json({ mensalidades: await cobranca.sincronizar(req.params.id), situacao: await cobranca.situacao(req.params.id) });
  });
  r.post('/api/admin/empresas/:id/reprovisionar', async (req, res) => {
    const e = await empresaOu404(req.params.id);
    const p = empresas.provisionar(e);
    res.json({ ok: true, novo: p.novo });
  });

  // suporte: abrir o painel da empresa (o admin passa a ver "/" como se fosse ela)
  r.post('/api/admin/empresas/:id/entrar', async (req, res) => {
    const e = await empresaOu404(req.params.id);
    await auth.entrarComo(req.sessao, e.id);
    await empresas.auditar(e.id, req.sessao.usuario.id, 'admin.entrou_como', {});
    res.json({ ok: true, ir: '/' });
  });
  r.post('/api/admin/sair-da-empresa', async (req, res) => { await auth.entrarComo(req.sessao, null); res.json({ ok: true, ir: '/admin' }); });

  // ---------- variáveis de ambiente da empresa ----------
  r.get('/api/admin/empresas/:id/variaveis', async (req, res) => res.json(await empresas.listarVariaveis((await empresaOu404(req.params.id)).id)));
  r.put('/api/admin/empresas/:id/variaveis/:chave', async (req, res) => {
    const e = await empresaOu404(req.params.id);
    const k = await empresas.definirVariavel(e.id, req.params.chave, req.body?.valor, req.body?.segredo !== false, req.sessao.usuario.id);
    res.json({ ok: true, chave: k });
  });
  r.delete('/api/admin/empresas/:id/variaveis/:chave', async (req, res) => {
    const e = await empresaOu404(req.params.id);
    res.json({ ok: await empresas.removerVariavel(e.id, req.params.chave, req.sessao.usuario.id) });
  });

  // ---------- usuários ----------
  r.post('/api/admin/empresas/:id/usuarios', async (req, res) => {
    const e = await empresaOu404(req.params.id);
    const u = await auth.criarUsuario({ empresaId: e.id, email: req.body?.email, nome: req.body?.nome || '', papel: req.body?.papel === 'membro' ? 'membro' : 'dono' });
    await empresas.auditar(e.id, req.sessao.usuario.id, 'usuario.criado', { email: u.usuario.email, papel: u.usuario.papel });
    res.status(201).json(u);
  });
  r.post('/api/admin/equipe', async (req, res) => {
    res.status(201).json(await auth.criarUsuario({ email: req.body?.email, nome: req.body?.nome || '', papel: 'admin_egi' }));
  });
  r.post('/api/admin/usuarios/:id/redefinir-senha', async (req, res) => res.json({ senhaTemporaria: await auth.redefinirSenha(req.params.id) }));
  r.post('/api/admin/usuarios/:id/ativo', async (req, res) => {
    const u = await db.um('update usuarios set ativo = $2 where id = $1 and id <> $3 returning id, ativo', [req.params.id, Boolean(req.body?.ativo), req.sessao.usuario.id]);
    if (!u) throw erro(404, 'Usuário não encontrado (ou é você mesmo).');
    if (!u.ativo) await db.query('delete from sessoes where usuario_id = $1', [u.id]);
    res.json(u);
  });

  // ---------- cobranças e avisos ----------
  r.post('/api/admin/cobrancas/:id/reenviar-aviso', async (req, res) => {
    const c = await db.um('select * from cobrancas where id = $1', [req.params.id]);
    if (!c) throw erro(404, 'Cobrança não encontrada.');
    const e = await empresas.buscar(c.empresa_id);
    const tipo = req.body?.tipo || (c.tipo === 'setup' ? 'setup_pendente' : 'atraso_d1');
    res.json(await avisos.reenviar(e, tipo, c));
  });
  r.get('/api/admin/eventos-asaas', async (req, res) => {
    res.json(await db.todos(`select id, tipo, pagamento_id, recebido_em, processado_em, erro from eventos_asaas ${req.query.erro ? 'where erro is not null' : ''} order by recebido_em desc limit 100`));
  });
  r.post('/api/admin/rotina-cobranca', async (req, res) => res.json({ reavaliadas: await cobranca.rotina() }));

  // ---------- canais da empresa (suporte) ----------
  r.get('/api/admin/empresas/:id/canais', async (req, res) => {
    const e = await empresaOu404(req.params.id);
    const [w, t, p] = await Promise.all([whatsapp.estado(e).catch((x) => ({ erro: x.message })), telegram.estado(e).catch((x) => ({ erro: x.message })), ponte.estado(e)]);
    res.json({ whatsapp: w, telegram: t, ponte: p, acessoWhats: await whatsapp.acesso(e) });
  });
  r.post('/api/admin/empresas/:id/canais/:tipo', async (req, res) => {
    const e = await empresaOu404(req.params.id);
    if (!['whatsapp', 'telegram', 'ponte'].includes(req.params.tipo)) throw erro(404, 'Canal desconhecido.');
    const c = await registro.garantir(e.id, req.params.tipo);
    const campos = {};
    if ('ativo' in (req.body || {})) campos.ativo = Boolean(req.body.ativo);
    if ('motor' in (req.body || {})) campos.motor = ['claude', 'codex', 'antigravity'].includes(req.body.motor) ? req.body.motor : null;
    if ('agente' in (req.body || {})) campos.agente = String(req.body.agente || '').replace(/[^a-z0-9_-]/gi, '').toLowerCase() || null;
    res.json(await registro.atualizar(c.id, campos));
  });

  r.get('/api/admin/status-uso', (req, res) => res.json({ statusQueUsam: [...STATUS_USO] }));
  return r;
}
