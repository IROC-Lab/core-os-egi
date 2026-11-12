// Testes de ponta a ponta da plataforma EGI Brand: PGlite em memória (nenhum banco compartilhado é tocado),
// Asaas, Evolution e Telegram de mentira, e um "Claude Code" falso que só ecoa o pedido.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, before, describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { criarPlataforma } from '../lib/app.js';
import { hoje, somarDias } from '../lib/cobranca.js';
import { lerConfig } from '../lib/config.js';
import { conectarPglite, migrar } from '../lib/db.js';

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'egi-brand-teste-'));
const TOKEN_ASAAS = 'tok-webhook-asaas-123';
const BOT = '123456789:AAEhBOweik6ad9r_QXMENQjcrGbqCr4K-ra';

// ---------- mundo de mentira ----------
const mundo = { pagamentos: new Map(), assinaturas: new Map(), enviados: [], telegram: [], asaasFora: false, seq: 0 };
function resposta(corpo, status = 200) { return new Response(JSON.stringify(corpo), { status, headers: { 'content-type': 'application/json' } }); }
async function fetchFalso(url, op = {}) {
  const u = new URL(url); const corpo = op.body && typeof op.body === 'string' ? JSON.parse(op.body) : {};
  const metodo = op.method || 'GET';
  if (u.host === 'api-sandbox.asaas.com') {
    if (mundo.asaasFora) throw new TypeError('fetch failed');
    const p = u.pathname.replace('/v3', '');
    if (p === '/customers' && metodo === 'GET') return resposta({ data: [] });
    if (p === '/customers') return resposta({ id: `cus_${++mundo.seq}`, ...corpo });
    if (p === '/payments' && metodo === 'POST') {
      const id = `pay_${++mundo.seq}`;
      const pag = { id, customer: corpo.customer, value: corpo.value, dueDate: corpo.dueDate, status: 'PENDING', billingType: corpo.billingType, invoiceUrl: `https://sandbox.asaas.com/i/${id}`, externalReference: corpo.externalReference, description: corpo.description };
      mundo.pagamentos.set(id, pag); return resposta(pag);
    }
    if (p.startsWith('/payments/') && metodo === 'GET') { const pag = mundo.pagamentos.get(p.split('/')[2]); return pag ? resposta(pag) : resposta({ errors: [{ code: 'not_found', description: 'não achei' }] }, 404); }
    if (p === '/subscriptions' && metodo === 'POST') { const s = { id: `sub_${++mundo.seq}`, ...corpo }; mundo.assinaturas.set(s.id, s); return resposta(s); }
    if (p.startsWith('/subscriptions/') && p.endsWith('/payments')) return resposta({ data: [...mundo.pagamentos.values()].filter((x) => x.subscription === p.split('/')[2]) });
    if (p.startsWith('/subscriptions/')) return resposta({ id: p.split('/')[2], deleted: metodo === 'DELETE' });
  }
  if (u.host === 'evo.test') {
    if (u.pathname.startsWith('/message/sendText/')) { mundo.enviados.push({ instancia: u.pathname.split('/').pop(), ...corpo }); return resposta({ key: { id: 'x' } }); }
    if (u.pathname.startsWith('/instance/connectionState/')) return resposta({ instance: { state: 'open' } });
    if (u.pathname.startsWith('/instance/fetchInstances')) return resposta([{ name: u.searchParams.get('instanceName'), ownerJid: '5527900000000@s.whatsapp.net' }]);
    return resposta({});
  }
  if (u.host === 'api.telegram.org') {
    const metodoTg = u.pathname.split('/').pop();
    if (metodoTg === 'getMe') return resposta({ ok: true, result: { id: 42, username: 'egi_teste_bot', first_name: 'Teste' } });
    if (metodoTg === 'sendMessage') { mundo.telegram.push(corpo); return resposta({ ok: true, result: {} }); }
    if (metodoTg === 'getWebhookInfo') return resposta({ ok: true, result: { url: 'https://egi.test/x', pending_update_count: 0 } });
    return resposta({ ok: true, result: true });
  }
  throw new Error(`fetch inesperado: ${url}`);
}

// "Claude Code" falso: responde ecoando o pedido (argumento depois de -p)
const BIN = path.join(TMP, 'bin'); fs.mkdirSync(BIN);
fs.writeFileSync(path.join(BIN, 'claude'), '#!/bin/sh\necho "eco: $2 | empresa=$CORE_OS_EMPRESA | banco=${DATABASE_URL:-nenhum} | home=$HOME"\n', { mode: 0o755 });

let srv; let base; let plataforma; let db;
const espera = async (cond, ms = 5000) => { const t = Date.now(); while (Date.now() - t < ms) { if (await cond()) return true; await new Promise((r) => setTimeout(r, 25)); } return false; };

async function chamar(caminho, { metodo = 'GET', corpo, cookie, cabecalhos = {}, cru } = {}) {
  const r = await fetch(`${base}${caminho}`, {
    method: metodo, headers: { ...(cru ? {} : { 'content-type': 'application/json' }), ...(cookie ? { cookie } : {}), ...cabecalhos },
    body: cru ?? (corpo !== undefined ? JSON.stringify(corpo) : undefined),
  });
  const texto = await r.text();
  let json = null; try { json = JSON.parse(texto); } catch { /* */ }
  return { status: r.status, json, cookie: r.headers.get('set-cookie')?.split(';')[0] };
}
const entrar = async (email, senha) => (await chamar('/api/login', { metodo: 'POST', corpo: { email, senha } })).cookie;
const webhookAsaas = (evento, pagamento, id = `evt_${Math.random()}`) => chamar('/hooks/asaas', { metodo: 'POST', corpo: { id, event: evento, payment: pagamento }, cabecalhos: { 'asaas-access-token': TOKEN_ASAAS } });

before(async () => {
  process.env.DATABASE_URL = 'postgres://segredo-da-plataforma'; // não pode vazar pro agente
  const cfg = lerConfig({
    EGI_PUBLIC_URL: 'https://egi.test', EGI_MASTER_KEY: 'a'.repeat(64), EGI_ADMIN_EMAIL: 'admin@egi.test', EGI_ADMIN_SENHA: 'SenhaAdmin123',
    EGI_EMPRESAS_DIR: path.join(TMP, 'empresas'), EGI_MODELO_CEREBRO: path.join(AQUI, '..', '..', 'cerebro'),
    EVO_URL: 'https://evo.test', EVO_KEY: 'global', EGI_AVISOS_EVO_INSTANCIA: 'egi-avisos',
    ASAAS_API_KEY: 'chave-sandbox', ASAAS_AMBIENTE: 'sandbox', ASAAS_WEBHOOK_TOKEN: TOKEN_ASAAS,
    CLAUDE_BIN: path.join(BIN, 'claude'), EGI_PATH_AGENTES: `${BIN}:/usr/bin:/bin`,
  });
  db = await conectarPglite();
  await migrar(db, undefined, () => {});
  plataforma = criarPlataforma({ cfg, db, fetch: fetchFalso, log: () => {} });
  await plataforma.servicos.auth.bootstrap();
  srv = createServer(plataforma.app);
  await new Promise((ok) => srv.listen(0, '127.0.0.1', ok));
  base = `http://127.0.0.1:${srv.address().port}`;
});
after(async () => { srv?.close(); await db?.fechar(); fs.rmSync(TMP, { recursive: true, force: true }); });

describe('EGI Brand', () => {
  let admin; let empresa; let senhaDono; let dono;

  test('admin entra e vê o resumo', async () => {
    assert.equal((await chamar('/api/login', { metodo: 'POST', corpo: { email: 'admin@egi.test', senha: 'errada' } })).status, 401);
    admin = await entrar('admin@egi.test', 'SenhaAdmin123');
    assert.ok(admin);
    const r = await chamar('/api/admin/resumo', { cookie: admin });
    assert.equal(r.status, 200);
    assert.equal(r.json.asaas.configurado, true);
  });

  test('cadastro da empresa cobra o setup na hora, cria o dono e a pasta isolada', async () => {
    const r = await chamar('/api/admin/empresas', { metodo: 'POST', cookie: admin, corpo: {
      nome: 'Padaria São João', cpf_cnpj: '12.345.678/0001-90', email: 'financeiro@padaria.test', whatsapp_dono: '27 99876-5432',
      responsavel: 'Maria', valor_mensal: '497,00', valor_setup: 1500, usuario_email: 'maria@padaria.test',
    } });
    assert.equal(r.status, 201, JSON.stringify(r.json));
    empresa = r.json.empresa; senhaDono = r.json.senhaTemporaria;
    assert.equal(empresa.slug, 'padaria-sao-joao');
    assert.equal(empresa.status, 'aguardando_setup');
    assert.equal(empresa.valor_mensal_centavos, 49700);
    assert.equal(r.json.setup.valor_centavos, 150000);
    assert.equal(r.json.setup.vencimento, hoje());
    assert.ok(senhaDono);
    // aviso do setup saiu pelo número de avisos da EGI, pro WhatsApp do dono, com o link
    const aviso = mundo.enviados.find((m) => m.instancia === 'egi-avisos');
    assert.equal(aviso.number, '5527998765432');
    assert.match(aviso.text, /setup inicial/); assert.match(aviso.text, /sandbox\.asaas\.com\/i\//); assert.match(aviso.text, /EGI Group/);
    // pasta: cérebro do modelo com o nome trocado, marca/, .env
    const raiz = path.join(TMP, 'empresas', 'padaria-sao-joao');
    assert.match(fs.readFileSync(path.join(raiz, 'cerebro', 'CLAUDE.md'), 'utf8'), /cérebro do Maria/);
    assert.ok(fs.existsSync(path.join(raiz, 'cerebro', 'marca')));
    assert.equal(fs.statSync(raiz).mode & 0o777, 0o700);
  });

  test('antes do setup pago o cliente entra mas o cérebro fica bloqueado', async () => {
    dono = await entrar('maria@padaria.test', senhaDono);
    const eu = await chamar('/api/eu', { cookie: dono });
    assert.equal(eu.json.empresa.liberada, false);
    assert.equal(eu.json.bloqueio.setup.valor_centavos, 150000);
    assert.equal((await chamar('/api/arvore', { cookie: dono })).status, 402);
    assert.equal((await chamar('/api/assinatura', { cookie: dono })).status, 200);
    assert.equal((await chamar('/api/admin/resumo', { cookie: dono })).status, 403);
  });

  test('webhook do Asaas: sem token é recusado; setup pago ativa e cria a assinatura', async () => {
    const setup = [...mundo.pagamentos.values()][0];
    assert.equal((await chamar('/hooks/asaas', { metodo: 'POST', corpo: { id: 'x', event: 'PAYMENT_CONFIRMED', payment: setup } })).status, 401);
    const evento = { ...setup, status: 'CONFIRMED', paymentDate: hoje() };
    const r = await webhookAsaas('PAYMENT_CONFIRMED', evento, 'evt_setup');
    assert.equal(r.status, 200);
    assert.equal((await webhookAsaas('PAYMENT_CONFIRMED', evento, 'evt_setup')).json.duplicado, true);
    const e = await plataforma.servicos.empresas.buscar(empresa.id);
    assert.equal(e.status, 'ativa');
    assert.match(e.asaas_assinatura_id, /^sub_/);
    const assinatura = mundo.assinaturas.get(e.asaas_assinatura_id);
    assert.equal(assinatura.value, 497); assert.equal(assinatura.cycle, 'MONTHLY');
    assert.equal(assinatura.nextDueDate, somarDias(hoje(), 30));
    assert.ok(mundo.enviados.some((m) => /Pagamento confirmado/.test(m.text)));
    assert.equal((await chamar('/api/arvore', { cookie: dono })).status, 200);
  });

  test('variáveis de ambiente: por empresa, cifradas, sem vazar segredo da plataforma pro agente', async () => {
    assert.equal((await chamar('/api/config/variaveis/OPENAI_API_KEY', { metodo: 'PUT', cookie: dono, corpo: { valor: 'sk-cliente' } })).status, 200);
    assert.equal((await chamar('/api/config/variaveis/HOME', { metodo: 'PUT', cookie: dono, corpo: { valor: '/' } })).status, 400);
    assert.equal((await chamar('/api/config/variaveis/EGI_MASTER_KEY', { metodo: 'PUT', cookie: dono, corpo: { valor: 'x' } })).status, 400);
    const lista = (await chamar('/api/config/variaveis', { cookie: dono })).json;
    assert.deepEqual(lista.map((v) => [v.chave, v.valor]), [['OPENAI_API_KEY', null]]);
    const guardado = await db.um("select valor_cifrado from variaveis_ambiente where chave = 'OPENAI_API_KEY'");
    assert.ok(!guardado.valor_cifrado.includes('sk-cliente'));
    const e = await plataforma.servicos.empresas.buscar(empresa.id);
    const env = await plataforma.servicos.empresas.ambiente(e);
    assert.equal(env.OPENAI_API_KEY, 'sk-cliente');
    assert.equal(env.DATABASE_URL, undefined);
    assert.equal(env.HOME, path.join(TMP, 'empresas', 'padaria-sao-joao', 'casa'));
    assert.match(fs.readFileSync(env.CORE_OS_ENV, 'utf8'), /OPENAI_API_KEY='sk-cliente'/);
    assert.equal(env.EVO_KEY, undefined, 'sem WhatsApp configurado não há EVO_KEY');
  });

  test('WhatsApp: só número autorizado fala; a resposta volta pela instância da empresa', async () => {
    const e = await plataforma.servicos.empresas.buscar(empresa.id);
    await plataforma.servicos.whatsapp.conectar(e);
    const canal = await db.um("select * from canais where empresa_id = $1 and tipo = 'whatsapp'", [e.id]);
    const msg = (de, texto) => ({ event: 'messages.upsert', data: { key: { remoteJid: `${de}@s.whatsapp.net`, fromMe: false, id: 'm1' }, pushName: 'Maria', message: { conversation: texto } } });
    assert.equal((await chamar(`/hooks/whatsapp/${e.id}/errado`, { metodo: 'POST', corpo: msg('5527998765432', 'oi') })).status, 401);
    const antes = mundo.enviados.length;
    await chamar(`/hooks/whatsapp/${e.id}/${canal.segredo_webhook}`, { metodo: 'POST', corpo: msg('5511911112222', 'sou estranho') });
    await chamar(`/hooks/whatsapp/${e.id}/${canal.segredo_webhook}`, { metodo: 'POST', corpo: msg('5527998765432', 'quanto vendi hoje?') });
    assert.ok(await espera(() => mundo.enviados.length > antes), 'resposta não chegou');
    const r = mundo.enviados.at(-1);
    assert.equal(r.instancia, 'egi-padaria-sao-joao');
    assert.equal(r.number, '5527998765432');
    assert.match(r.text, /eco: quanto vendi hoje\?/);
    assert.match(r.text, /empresa=padaria-sao-joao/);
    assert.match(r.text, /banco=nenhum/, 'DATABASE_URL da plataforma vazou pro agente');
    assert.match(r.text, /padaria-sao-joao\/casa/);
    assert.equal(mundo.enviados.filter((m) => /sou estranho/.test(m.text)).length, 0);
    // agora a skill whatsapp enxerga só a instância da empresa, com o token dela (nunca a apikey global)
    const env = await plataforma.servicos.empresas.ambiente(e, await plataforma.servicos.whatsapp.variaveisDaEmpresa(e));
    assert.equal(env.EVO_INSTANCE, 'egi-padaria-sao-joao');
    assert.notEqual(env.EVO_KEY, 'global');
  });

  test('Telegram: liga o bot, pareia por código e só atende chat pareado', async () => {
    assert.equal((await chamar('/api/config/telegram', { metodo: 'POST', cookie: dono, corpo: { token: 'lixo' } })).status, 400);
    const r = await chamar('/api/config/telegram', { metodo: 'POST', cookie: dono, corpo: { token: BOT } });
    assert.equal(r.status, 200, JSON.stringify(r.json));
    assert.equal(r.json.bot, 'egi_teste_bot');
    const { codigo, link } = (await chamar('/api/config/telegram/codigo', { metodo: 'POST', cookie: dono })).json;
    assert.match(link, /t\.me\/egi_teste_bot\?start=/);
    const canal = await db.um("select segredo_webhook from canais where empresa_id = $1 and tipo = 'telegram'", [empresa.id]);
    const upd = (chat, text) => ({ update_id: 1, message: { message_id: 1, chat: { id: chat, type: 'private' }, from: { id: chat, first_name: 'Maria' }, text } });
    const hook = (u, seg = canal.segredo_webhook) => chamar(`/hooks/telegram/${empresa.id}`, { metodo: 'POST', corpo: u, cabecalhos: { 'x-telegram-bot-api-secret-token': seg } });
    assert.equal((await hook(upd(777, 'oi'), 'errado')).status, 401);
    await hook(upd(777, 'oi'));
    assert.match(mundo.telegram.at(-1).text, /privado/);
    assert.equal((await hook(upd(777, `/start ${codigo}`))).json.ok, true);
    assert.match(mundo.telegram.at(-1).text, /Pronto, Maria/);
    await hook(upd(888, `/start ${codigo}`));
    assert.match(mundo.telegram.at(-1).text, /inválido ou vencido/, 'código não pode ser usado duas vezes');
    const antes = mundo.telegram.length;
    await hook(upd(777, 'faz um post'));
    assert.ok(await espera(() => mundo.telegram.length > antes));
    assert.match(mundo.telegram.at(-1).text, /eco: faz um post/);
    assert.equal(mundo.telegram.at(-1).chat_id, '777');
  });

  test('marca: brandbook PDF e logo vão pra marca/ do cérebro e entram no índice', async () => {
    const pdf = Buffer.from('%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF');
    let r = await chamar('/api/marca/arquivos?categoria=brandbook&nome=Brandbook%20Padaria.pdf', { metodo: 'POST', cookie: dono, cru: pdf, cabecalhos: { 'content-type': 'application/octet-stream' } });
    assert.equal(r.status, 201, JSON.stringify(r.json));
    assert.equal(r.json.caminho, 'marca/brandbook/Brandbook-Padaria.pdf');
    r = await chamar('/api/marca/arquivos?categoria=logo&nome=logo.png', { metodo: 'POST', cookie: dono, cru: Buffer.from([0x89, 0x50, 0x4e, 0x47]), cabecalhos: { 'content-type': 'application/octet-stream' } });
    assert.equal(r.status, 201);
    r = await chamar('/api/marca/arquivos?categoria=brandbook&nome=virus.exe', { metodo: 'POST', cookie: dono, cru: Buffer.from('x'), cabecalhos: { 'content-type': 'application/octet-stream' } });
    assert.equal(r.status, 400);
    r = await chamar('/api/marca/perfil', { metodo: 'PUT', cookie: dono, corpo: { cores: [{ nome: 'Primária', hex: '#C2410C' }, { nome: 'ruim', hex: 'vermelho' }], fontes: ['Inter'], tom_de_voz: 'Acolhedor e direto.' } });
    assert.deepEqual(r.json.cores, [{ nome: 'Primária', hex: '#C2410C' }]);
    const indice = fs.readFileSync(path.join(TMP, 'empresas', 'padaria-sao-joao', 'cerebro', 'marca', 'CLAUDE.md'), 'utf8');
    assert.match(indice, /brandbook\/Brandbook-Padaria\.pdf/); assert.match(indice, /logos\/logo\.png/); assert.match(indice, /#C2410C/); assert.match(indice, /Acolhedor/);
    const lista = (await chamar('/api/marca', { cookie: dono })).json;
    assert.equal(lista.arquivos.length, 2);
    const logo = lista.arquivos.find((a) => a.categoria === 'logo');
    assert.equal((await chamar(`/api/marca/arquivos/${logo.id}`, { metodo: 'DELETE', cookie: dono })).json.ok, true);
    assert.ok(fs.readdirSync(path.join(TMP, 'empresas', 'padaria-sao-joao', 'cerebro', 'marca', '.arquivo')).some((f) => f.endsWith('logo.png')), 'removido vai pra .arquivo, nunca é apagado');
  });

  test('isolamento: outra empresa não enxerga nada da primeira', async () => {
    const r = await chamar('/api/admin/empresas', { metodo: 'POST', cookie: admin, corpo: { nome: 'Oficina Zé', cpf_cnpj: '12345678909', email: 'ze@oficina.test', valor_mensal: 300, usuario_email: 'ze@oficina.test', cobrar_setup: false } });
    assert.equal(r.json.empresa.status, 'ativa', `sem setup ativa direto (${r.json.aviso})`);
    const ze = await entrar('ze@oficina.test', r.json.senhaTemporaria);
    const arvore = JSON.stringify((await chamar('/api/arvore', { cookie: ze })).json);
    assert.ok(!arvore.includes('Brandbook-Padaria'));
    assert.equal((await chamar('/api/arquivo?caminho=../padaria-sao-joao/cerebro/CLAUDE.md', { cookie: ze })).status, 404);
    assert.equal((await chamar('/api/arquivo?caminho=../../padaria-sao-joao/.env', { cookie: ze })).status, 404);
    assert.equal((await chamar('/api/marca', { cookie: ze })).json.arquivos.length, 0);
    assert.equal((await chamar('/api/config/variaveis', { cookie: ze })).json.length, 0);
    const conv = (await chamar('/api/conversas', { metodo: 'POST', cookie: dono, corpo: {} })).json;
    assert.equal((await chamar(`/api/conversas/${conv.id}`, { metodo: 'DELETE', cookie: ze })).status, 404);
  });

  describe('régua de cobrança', () => {
    let mensalidade;
    const pagamentoDaAssinatura = async (vencimento) => {
      const e = await plataforma.servicos.empresas.buscar(empresa.id);
      const id = `pay_${++mundo.seq}`;
      const p = { id, customer: e.asaas_cliente_id, subscription: e.asaas_assinatura_id, value: 497, dueDate: vencimento, status: 'PENDING', billingType: 'UNDEFINED', invoiceUrl: `https://sandbox.asaas.com/i/${id}` };
      mundo.pagamentos.set(id, p);
      return p;
    };
    const status = async () => (await plataforma.servicos.empresas.buscar(empresa.id)).status;
    const avisosDo = (tipo) => db.todos('select * from avisos where empresa_id = $1 and tipo = $2', [empresa.id, tipo]);

    test('mensalidade vencida: inadimplente, continua usando e recebe o aviso uma vez só', async () => {
      mensalidade = await pagamentoDaAssinatura(somarDias(hoje(), -1));
      await webhookAsaas('PAYMENT_CREATED', mensalidade);
      mensalidade.status = 'OVERDUE';
      await webhookAsaas('PAYMENT_OVERDUE', mensalidade);
      assert.equal(await status(), 'inadimplente');
      assert.equal((await chamar('/api/arvore', { cookie: dono })).status, 200);
      await plataforma.servicos.cobranca.rotina();
      await plataforma.servicos.cobranca.rotina();
      assert.equal((await avisosDo('atraso_d1')).filter((a) => a.canal === 'whatsapp').length, 1);
      assert.equal((await avisosDo('atraso_d3')).length, 0);
      assert.match(mundo.enviados.at(-1).text, new RegExp(somarDias(somarDias(hoje(), -1), 5).split('-').reverse().join('/')), 'aviso diz até quando pagar');
    });

    test('Asaas fora do ar no 5º dia: NÃO suspende sem confirmar', async () => {
      const venc = somarDias(hoje(), -5);
      mensalidade.dueDate = venc;
      await db.query('update cobrancas set vencimento = $2 where asaas_pagamento_id = $1', [mensalidade.id, venc]);
      mundo.asaasFora = true;
      await plataforma.servicos.cobranca.rotina();
      mundo.asaasFora = false;
      assert.equal(await status(), 'inadimplente');
      assert.equal((await avisosDo('atraso_d3')).filter((a) => a.canal === 'whatsapp').length, 1, 'lembrete do 3º dia sai mesmo assim');
    });

    test('5 dias sem pagar: suspende, derruba o acesso, avisa e o canal responde com o aviso', async () => {
      await plataforma.servicos.cobranca.rotina();
      assert.equal(await status(), 'suspensa');
      assert.equal((await avisosDo('suspensao')).filter((a) => a.status === 'enviado').length, 2, 'WhatsApp e Telegram');
      assert.match(mundo.enviados.at(-1).text, /suspenso/);
      const bloqueio = await chamar('/api/arvore', { cookie: dono });
      assert.equal(bloqueio.status, 402);
      assert.match(bloqueio.json.bloqueio.vencida.link_fatura, /asaas/);
      const canal = await db.um("select segredo_webhook from canais where empresa_id = $1 and tipo = 'telegram'", [empresa.id]);
      const antes = mundo.telegram.length;
      await chamar(`/hooks/telegram/${empresa.id}`, { metodo: 'POST', corpo: { message: { chat: { id: 777, type: 'private' }, from: { id: 777 }, text: 'oi' } }, cabecalhos: { 'x-telegram-bot-api-secret-token': canal.segredo_webhook } });
      assert.ok(await espera(() => mundo.telegram.length > antes));
      assert.match(mundo.telegram.at(-1).text, /suspenso/);
      assert.doesNotMatch(mundo.telegram.at(-1).text, /eco:/, 'empresa suspensa não roda agente');
    });

    test('pagou: reativa na hora e avisa', async () => {
      mensalidade.status = 'RECEIVED'; mensalidade.paymentDate = hoje();
      await webhookAsaas('PAYMENT_RECEIVED', mensalidade);
      assert.equal(await status(), 'ativa');
      assert.equal((await avisosDo('reativacao')).length >= 1, true);
      assert.equal((await chamar('/api/arvore', { cookie: dono })).status, 200);
    });

    test('suspensão manual do admin não volta sozinha', async () => {
      await chamar(`/api/admin/empresas/${empresa.id}/suspender`, { metodo: 'POST', cookie: admin, corpo: { motivo: 'pedido do cliente' } });
      await plataforma.servicos.cobranca.rotina();
      await plataforma.servicos.cobranca.reavaliar(empresa.id);
      assert.equal(await status(), 'suspensa');
      await chamar(`/api/admin/empresas/${empresa.id}/reativar`, { metodo: 'POST', cookie: admin });
      assert.equal(await status(), 'ativa');
    });

    test('ficha da empresa no admin traz cobranças, avisos, variáveis e auditoria', async () => {
      const r = await chamar(`/api/admin/empresas/${empresa.id}`, { cookie: admin });
      assert.equal(r.status, 200);
      assert.ok(r.json.cobrancas.some((c) => c.tipo === 'setup' && c.status === 'paga'));
      assert.ok(r.json.cobrancas.some((c) => c.tipo === 'mensalidade' && c.status === 'paga'));
      assert.ok(r.json.auditoria.some((a) => a.acao === 'empresa.status'));
      assert.equal(r.json.variaveis[0].valor, null, 'segredo nunca volta pro navegador');
      const resumo = (await chamar('/api/admin/resumo', { cookie: admin })).json;
      assert.equal(resumo.mrrCentavos, 49700 + 30000);
    });
  });
});
