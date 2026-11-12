// EGI Brand · cobrança recorrente pelo Asaas.
//
// Ciclo de vida de uma empresa:
//   1. Contratação: cadastra o cliente no Asaas e cobra o SETUP na hora (vencimento hoje + EGI_SETUP_VENCIMENTO_DIAS).
//      Empresa fica "aguardando_setup" (não usa o cérebro ainda) e recebe o link de pagamento.
//   2. Setup pago (webhook PAYMENT_CONFIRMED/RECEIVED): empresa "ativa" e nasce a ASSINATURA mensal no Asaas
//      (primeira mensalidade ~30 dias depois, ou no dia de vencimento escolhido).
//   3. Mensalidade venceu sem pagamento: empresa "inadimplente" (continua usando) e recebe aviso no 1º dia e no 3º.
//   4. 5 dias de atraso (EGI_DIAS_SUSPENSAO): antes de suspender, confere no Asaas se a cobrança continua aberta
//      (webhook perdido não suspende ninguém). Continua aberta: empresa "suspensa", agentes param e chega o aviso.
//   5. Pagou: reativa na hora e avisa.
// A rotina roda na subida e a cada hora; o webhook do Asaas antecipa tudo que puder.
import { normalizarPagamento, STATUS_EVENTO, verificarWebhook } from './asaas.js';

// ---------- datas (dia civil em America/Sao_Paulo) ----------
export function hoje(fuso = 'America/Sao_Paulo', agora = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: fuso, year: 'numeric', month: '2-digit', day: '2-digit' }).format(agora);
}
const utc = (dia) => { const [a, m, d] = String(dia).slice(0, 10).split('-').map(Number); return Date.UTC(a, m - 1, d); };
const paraDia = (ms) => new Date(ms).toISOString().slice(0, 10);
export const somarDias = (dia, n) => paraDia(utc(dia) + n * 86400_000);
export const diasEntre = (de, ate) => Math.round((utc(ate) - utc(de)) / 86400_000);
// primeira mensalidade: sem dia escolhido, 30 dias depois; com dia, a primeira data nesse dia a pelo menos 25 dias
export function primeiroVencimento(diaHoje, diaVencimento) {
  if (!diaVencimento) return somarDias(diaHoje, 30);
  const [a, m] = diaHoje.split('-').map(Number);
  for (let i = 0; i < 3; i++) {
    const cand = paraDia(Date.UTC(a, m - 1 + i, Number(diaVencimento)));
    if (diasEntre(diaHoje, cand) >= 25) return cand;
  }
  return somarDias(diaHoje, 30);
}

export const ref = (empresaId, tipo) => `egi:${empresaId}:${tipo}`;
export function lerRef(r) {
  const m = String(r || '').match(/^egi:([0-9a-f-]{36}):(setup|mensalidade|avulsa)$/);
  return m ? { empresaId: m[1], tipo: m[2] } : null;
}

export function criarCobranca({ db, cfg, asaas, empresas, avisos, aoMudarStatus = async () => {}, log = console.log }) {
  const c = cfg.cobranca;
  const dia = () => hoje(c.fuso);

  async function mudarStatus(empresa, status, motivo, por = null) {
    if (empresa.status === status) return empresa;
    const nova = await empresas.mudarStatus(empresa.id, status, motivo, por);
    await aoMudarStatus(nova, empresa.status, status).catch((e) => log('[cobrança] aoMudarStatus:', e.message));
    return nova;
  }

  async function gravarCobranca(empresaId, tipo, p) {
    return db.um(`
      insert into cobrancas (empresa_id, tipo, asaas_pagamento_id, asaas_assinatura_id, valor_centavos, vencimento, status, forma_pagamento, link_fatura, descricao, pago_em)
      values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
      on conflict (asaas_pagamento_id) do update set
        valor_centavos = excluded.valor_centavos, vencimento = excluded.vencimento, status = excluded.status,
        forma_pagamento = coalesce(excluded.forma_pagamento, cobrancas.forma_pagamento),
        link_fatura = coalesce(excluded.link_fatura, cobrancas.link_fatura),
        pago_em = coalesce(excluded.pago_em, cobrancas.pago_em), atualizado_em = now()
      returning *`, [empresaId, tipo, p.asaas_pagamento_id, p.asaas_assinatura_id, p.valor_centavos, p.vencimento, p.status,
      p.forma_pagamento, p.link_fatura, p.descricao || '', p.pago_em ? new Date(p.pago_em) : null]);
  }

  async function garantirClienteAsaas(e) {
    if (e.asaas_cliente_id) return e.asaas_cliente_id;
    const id = await asaas.garantirCliente({ nome: e.razao_social || e.nome, cpfCnpj: e.cpf_cnpj, email: e.email, celular: e.whatsapp_dono?.replace(/^55/, '') || e.telefone, referencia: e.id });
    await db.query('update empresas set asaas_cliente_id = $2, atualizado_em = now() where id = $1', [e.id, id]);
    e.asaas_cliente_id = id;
    return id;
  }

  // 1. contratação: cobra o setup agora. cobrarSetup=false (cortesia ou setup cobrado por fora) ativa direto.
  async function contratar(empresaId, { cobrarSetup = true, por = null } = {}) {
    let e = await empresas.buscar(empresaId);
    if (!e) throw Object.assign(new Error('Empresa não encontrada.'), { status: 404 });
    if (e.status !== 'aguardando_setup') throw Object.assign(new Error(`A empresa já está "${e.status}".`), { status: 409 });
    await garantirClienteAsaas(e);
    if (!cobrarSetup || !e.valor_setup_centavos) {
      e = await ativar(e, { por });
      return { empresa: e, setup: null };
    }
    const aberta = await db.um("select * from cobrancas where empresa_id = $1 and tipo = 'setup' and status in ('pendente','vencida') order by criado_em desc limit 1", [e.id]);
    if (aberta) return { empresa: e, setup: aberta };
    const p = normalizarPagamento(await asaas.criarCobranca({
      cliente: e.asaas_cliente_id, forma: e.forma_pagamento, valorCentavos: e.valor_setup_centavos,
      vencimento: somarDias(dia(), c.setupVencimentoDias), descricao: `EGI Brand · setup inicial · ${e.nome}`, referencia: ref(e.id, 'setup'),
    }));
    const setup = await gravarCobranca(e.id, 'setup', p);
    await empresas.auditar(e.id, por, 'cobranca.setup_criada', { cobranca: setup.id, valor: setup.valor_centavos });
    await avisos.avisar(e, 'setup_pendente', {}, setup);
    return { empresa: e, setup };
  }

  // 2. setup pago (ou dispensado): ativa e cria a assinatura mensal
  async function ativar(e, { por = null } = {}) {
    if (!e.asaas_assinatura_id) {
      await garantirClienteAsaas(e);
      const venc = primeiroVencimento(dia(), e.dia_vencimento);
      const a = await asaas.criarAssinatura({
        cliente: e.asaas_cliente_id, forma: e.forma_pagamento, valorCentavos: e.valor_mensal_centavos,
        proximoVencimento: venc, descricao: `EGI Brand · mensalidade · ${e.nome}`, referencia: ref(e.id, 'mensalidade'),
      });
      await db.query('update empresas set asaas_assinatura_id = $2, atualizado_em = now() where id = $1', [e.id, a.id]);
      e = { ...e, asaas_assinatura_id: a.id };
      await empresas.auditar(e.id, por, 'cobranca.assinatura_criada', { assinatura: a.id, primeiro_vencimento: venc });
      e = await mudarStatus(e, 'ativa', null, por);
      await avisos.avisar(e, 'boas_vindas', { valor: e.valor_mensal_centavos, vencimento: venc });
      return e;
    }
    return mudarStatus(e, 'ativa', null, por);
  }

  // qual empresa é dona deste pagamento?
  async function empresaDoPagamento(p) {
    const existente = await db.um('select empresa_id, tipo from cobrancas where asaas_pagamento_id = $1', [p.asaas_pagamento_id]);
    if (existente) return { empresaId: existente.empresa_id, tipo: existente.tipo };
    const r = lerRef(p.referencia);
    if (r) return r;
    if (p.asaas_assinatura_id) {
      const e = await db.um('select id from empresas where asaas_assinatura_id = $1', [p.asaas_assinatura_id]);
      if (e) return { empresaId: e.id, tipo: 'mensalidade' };
    }
    if (p.asaas_cliente_id) {
      const e = await db.um('select id from empresas where asaas_cliente_id = $1', [p.asaas_cliente_id]);
      if (e) return { empresaId: e.id, tipo: p.asaas_assinatura_id ? 'mensalidade' : 'avulsa' };
    }
    return null;
  }

  // webhook do Asaas. Devolve { ok, duplicado?, ignorado? }. Erro de processamento fica gravado e devolve 200
  // assim mesmo (o Asaas pausa a fila de quem responde erro); a rotina horária conserta o que faltar.
  async function receberWebhook(corpo, tokenCabecalho) {
    if (!verificarWebhook(tokenCabecalho, cfg.asaas.tokenWebhook)) return { ok: false, status: 401 };
    const id = String(corpo?.id || ''); const tipo = String(corpo?.event || '');
    if (!id || !tipo) return { ok: false, status: 400 };
    const pagamentoId = corpo?.payment?.id || null;
    const novo = await db.um('insert into eventos_asaas (id, tipo, pagamento_id, payload) values ($1,$2,$3,$4) on conflict (id) do nothing returning id',
      [id, tipo, pagamentoId, JSON.stringify(corpo)]);
    if (!novo) return { ok: true, duplicado: true };
    try {
      const r = await processarEvento(tipo, corpo);
      await db.query('update eventos_asaas set processado_em = now(), erro = $2 where id = $1', [id, r?.erro || null]);
      return { ok: true, ...r };
    } catch (e) {
      log(`[asaas] evento ${tipo} ${id}: ${e.message}`);
      await db.query('update eventos_asaas set erro = $2 where id = $1', [id, String(e.message).slice(0, 1000)]);
      return { ok: true, erro: e.message };
    }
  }

  async function processarEvento(tipo, corpo) {
    if (!tipo.startsWith('PAYMENT_') || !corpo.payment) return { ignorado: true };
    const p = normalizarPagamento(corpo.payment);
    if (!p) return { ignorado: true };
    if (STATUS_EVENTO[tipo]) p.status = STATUS_EVENTO[tipo];
    const dono = await empresaDoPagamento(p);
    if (!dono) return { ignorado: true, erro: 'empresa não encontrada para este pagamento' };
    let e = await empresas.buscar(dono.empresaId);
    if (!e) return { ignorado: true, erro: 'empresa removida' };
    const cob = await gravarCobranca(e.id, dono.tipo, p);

    if (cob.status === 'paga' && cob.tipo === 'setup' && e.status === 'aguardando_setup') {
      e = await ativar(e);
      return { acao: 'ativada' };
    }
    if (cob.status === 'vencida' && cob.tipo !== 'setup') {
      await reavaliar(e.id);
      return { acao: 'reavaliada' };
    }
    if (['paga', 'cancelada', 'estornada'].includes(cob.status)) {
      await reavaliar(e.id, { pagamento: cob.status === 'paga' ? cob : null });
      return { acao: 'reavaliada' };
    }
    return { acao: 'gravada' };
  }

  // confere no Asaas uma cobrança que parece atrasada (o webhook de pagamento pode ter se perdido)
  async function conferirNoAsaas(cob) {
    if (!cob.asaas_pagamento_id || !asaas.configurado) return cob;
    try {
      const remoto = await asaas.buscarCobranca(cob.asaas_pagamento_id);
      if (!remoto) return { ...cob, status: 'cancelada' };
      const p = normalizarPagamento(remoto);
      if (p.status !== cob.status || p.vencimento !== cob.vencimento) return gravarCobranca(cob.empresa_id, cob.tipo, p);
    } catch (e) {
      // sem conseguir confirmar, NÃO suspende: tenta de novo na próxima rodada
      log(`[cobrança] não consegui conferir ${cob.asaas_pagamento_id} no Asaas: ${e.message}`);
      return { ...cob, naoConfirmada: true };
    }
    return cob;
  }

  // a regra: decide o status da empresa pelas mensalidades em aberto e manda os avisos devidos
  async function reavaliar(empresaId, { pagamento = null, conferir = true } = {}) {
    let e = await empresas.buscar(empresaId);
    if (!e || ['aguardando_setup', 'cancelada'].includes(e.status)) return e;
    // suspensão manual do admin só sai por ação manual
    if (e.status === 'suspensa' && String(e.motivo_suspensao || '').startsWith('Manual')) return e;
    const hojeDia = dia();
    let abertas = await db.todos(`select * from cobrancas where empresa_id = $1 and tipo <> 'setup' and status in ('pendente','vencida') and vencimento < $2 order by vencimento`, [e.id, hojeDia]);

    // antes de suspender, confirma no Asaas que continuam abertas
    const precisaConfirmar = abertas.some((x) => diasEntre(x.vencimento, hojeDia) >= c.diasSuspensao);
    let semConfirmacao = false;
    if (conferir && precisaConfirmar) {
      const conferidas = [];
      for (const x of abertas) {
        const y = await conferirNoAsaas(x);
        if (y.naoConfirmada) semConfirmacao = true;
        conferidas.push(y);
      }
      abertas = conferidas.filter((x) => ['pendente', 'vencida'].includes(x.status) && x.vencimento < hojeDia);
    }

    if (!abertas.length) {
      if (['inadimplente', 'suspensa'].includes(e.status)) {
        const estava = e.status;
        e = await mudarStatus(e, 'ativa', null);
        if (estava === 'suspensa') await avisos.avisar(e, 'reativacao', {}, pagamento);
      }
      return e;
    }

    const maisAntiga = abertas[0];
    const atraso = diasEntre(maisAntiga.vencimento, hojeDia);
    const limite = somarDias(maisAntiga.vencimento, c.diasSuspensao);

    if (atraso >= c.diasSuspensao && !semConfirmacao) {
      if (e.status !== 'suspensa') {
        e = await mudarStatus(e, 'suspensa', `Mensalidade vencida em ${maisAntiga.vencimento} sem pagamento há ${atraso} dias.`);
        log(`[cobrança] ${e.slug} suspensa (${atraso} dias de atraso)`);
      }
      await avisos.avisar(e, 'suspensao', {}, maisAntiga);
      return e;
    }
    if (e.status === 'ativa') e = await mudarStatus(e, 'inadimplente', null);
    if (e.status === 'suspensa' && atraso < c.diasSuspensao && e.motivo_suspensao?.startsWith('Mensalidade')) {
      // vencimento foi adiado no Asaas: volta a inadimplente
      e = await mudarStatus(e, 'inadimplente', null);
    }
    if (atraso >= 1) await avisos.avisar(e, 'atraso_d1', { limite }, maisAntiga);
    if (atraso >= c.diasLembrete) await avisos.avisar(e, 'atraso_d3', { limite }, maisAntiga);
    return e;
  }

  // rotina horária: marca vencidas as pendentes que passaram do dia e reavalia todo mundo que tem conta em aberto
  async function rotina() {
    const hojeDia = dia();
    await db.query("update cobrancas set status = 'vencida', atualizado_em = now() where status = 'pendente' and vencimento < $1", [hojeDia]);
    const ids = await db.todos(`select distinct e.id from empresas e join cobrancas c on c.empresa_id = e.id
      where e.status in ('ativa','inadimplente','suspensa') and c.tipo <> 'setup' and c.status = 'vencida'
      union select id from empresas where status in ('inadimplente','suspensa') and (motivo_suspensao is null or motivo_suspensao like 'Mensalidade%')`);
    let n = 0;
    for (const { id } of ids) { try { await reavaliar(id); n++; } catch (e) { log(`[cobrança] rotina ${id}: ${e.message}`); } }
    return n;
  }

  // repara webhooks perdidos: puxa do Asaas as mensalidades da assinatura e grava
  async function sincronizar(empresaId) {
    const e = await empresas.buscar(empresaId);
    if (!e?.asaas_assinatura_id) return 0;
    const lista = await asaas.cobrancasDaAssinatura(e.asaas_assinatura_id);
    for (const raw of lista) { const p = normalizarPagamento(raw); if (p) await gravarCobranca(e.id, 'mensalidade', p); }
    await reavaliar(e.id, { conferir: false });
    return lista.length;
  }

  // ---------- ações manuais do admin ----------
  async function suspenderManual(empresaId, motivo, por) {
    let e = await empresas.buscar(empresaId);
    e = await mudarStatus(e, 'suspensa', `Manual: ${motivo || 'sem motivo informado'}`, por);
    await avisos.avisar(e, 'suspensao_manual', { motivo });
    return e;
  }
  async function reativarManual(empresaId, por) {
    let e = await empresas.buscar(empresaId);
    if (e.status === 'aguardando_setup') return ativar(e, { por });
    e = await mudarStatus(e, 'ativa', null, por);
    await avisos.avisar(e, 'reativacao');
    return e;
  }
  async function cancelar(empresaId, por) {
    let e = await empresas.buscar(empresaId);
    if (e.asaas_assinatura_id && asaas.configurado) {
      try { await asaas.cancelarAssinatura(e.asaas_assinatura_id); } catch (err) { if (err.status !== 404) throw err; }
    }
    await db.query("update cobrancas set status = 'cancelada', atualizado_em = now() where empresa_id = $1 and status = 'pendente'", [e.id]);
    e = await mudarStatus(e, 'cancelada', null, por);
    return e;
  }
  async function mudarValorMensal(empresaId, valorCentavos, por) {
    const e = await empresas.atualizar(empresaId, { valor_mensal_centavos: valorCentavos }, por);
    if (e.asaas_assinatura_id) await asaas.atualizarAssinatura(e.asaas_assinatura_id, { valorCentavos });
    return e;
  }

  const cobrancasDe = (empresaId) => db.todos('select * from cobrancas where empresa_id = $1 order by vencimento desc, criado_em desc limit 60', [empresaId]);
  async function situacao(empresaId) {
    const e = await empresas.buscar(empresaId);
    const abertas = await db.todos("select * from cobrancas where empresa_id = $1 and status in ('pendente','vencida') order by vencimento", [empresaId]);
    const hojeDia = dia();
    const vencida = abertas.find((x) => x.vencimento < hojeDia && x.tipo !== 'setup');
    return {
      status: e.status,
      motivo: e.motivo_suspensao,
      setup: abertas.find((x) => x.tipo === 'setup') || null,
      proxima: abertas.find((x) => x.vencimento >= hojeDia) || null,
      vencida: vencida || null,
      suspendeEm: vencida ? somarDias(vencida.vencimento, c.diasSuspensao) : null,
      diasSuspensao: c.diasSuspensao,
    };
  }

  return { contratar, ativar, receberWebhook, reavaliar, rotina, sincronizar, suspenderManual, reativarManual, cancelar, mudarValorMensal, cobrancasDe, situacao, hoje: dia };
}
