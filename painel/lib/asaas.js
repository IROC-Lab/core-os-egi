// EGI Brand · cliente da API v3 do Asaas (mesmas convenções da integração do EGI OS, integrations/payments-asaas).
// - Produção https://api.asaas.com/v3 · Sandbox https://api-sandbox.asaas.com/v3
// - Autenticação no cabeçalho `access_token`; `User-Agent` obrigatório.
// - A API trabalha em reais com decimais; aqui dentro tudo é centavo inteiro.
// - A chave nunca vai pra log nem pra mensagem de erro.
import { iguais } from './cripto.js';

export const ASAAS_URL = { producao: 'https://api.asaas.com/v3', sandbox: 'https://api-sandbox.asaas.com/v3' };

// status do pagamento no Asaas -> o nosso. CONFIRMED (cartão aprovado, saldo ainda não liberado) já conta como pago.
const STATUS = {
  PENDING: 'pendente', AWAITING_RISK_ANALYSIS: 'pendente', AWAITING_CHARGEBACK_REVERSAL: 'paga',
  RECEIVED: 'paga', CONFIRMED: 'paga', RECEIVED_IN_CASH: 'paga', DUNNING_RECEIVED: 'paga',
  CHARGEBACK_REQUESTED: 'paga', CHARGEBACK_DISPUTE: 'paga',
  OVERDUE: 'vencida', DUNNING_REQUESTED: 'vencida',
  REFUNDED: 'estornada', REFUND_REQUESTED: 'estornada', REFUND_IN_PROGRESS: 'estornada',
};
export const statusDe = (p) => (p?.deleted === true ? 'cancelada' : STATUS[String(p?.status)] || 'pendente');
// evento -> status (quando o evento por si só define o status)
export const STATUS_EVENTO = {
  PAYMENT_RECEIVED: 'paga', PAYMENT_CONFIRMED: 'paga', PAYMENT_OVERDUE: 'vencida', PAYMENT_DELETED: 'cancelada',
  PAYMENT_RESTORED: 'pendente', PAYMENT_REFUNDED: 'estornada', PAYMENT_RECEIVED_IN_CASH_UNDONE: 'estornada',
  PAYMENT_CHARGEBACK_REQUESTED: 'paga',
};

const str = (v) => (typeof v === 'string' && v ? v : null);
export function normalizarPagamento(p) {
  if (!p || !str(p.id)) return null;
  const status = statusDe(p);
  const valor = Number(p.value);
  return {
    asaas_pagamento_id: p.id,
    asaas_assinatura_id: str(p.subscription),
    asaas_cliente_id: str(p.customer),
    valor_centavos: Number.isFinite(valor) ? Math.round(valor * 100) : 0,
    vencimento: str(p.dueDate),
    status,
    forma_pagamento: str(p.billingType),
    link_fatura: str(p.invoiceUrl),
    pago_em: status === 'paga' ? (str(p.clientPaymentDate) || str(p.paymentDate) || str(p.confirmedDate)) : null,
    referencia: str(p.externalReference),
    descricao: str(p.description) || '',
  };
}

export const verificarWebhook = (cabecalho, segredo) => iguais(cabecalho, segredo);

export class ErroAsaas extends Error {
  constructor(mensagem, { status = 0, codigo = 'erro', transitorio = false } = {}) {
    super(mensagem); this.status = status; this.codigo = codigo; this.transitorio = transitorio;
  }
}

export function criarAsaas({ chave, ambiente = 'sandbox', fetch: f = fetch, timeoutMs = 20_000 }) {
  const base = ASAAS_URL[ambiente] || ASAAS_URL.sandbox;
  const configurado = Boolean(chave);

  async function req(metodo, caminho, corpo) {
    if (!chave) throw new ErroAsaas('Asaas não configurado: defina ASAAS_API_KEY.', { codigo: 'sem_chave' });
    let r;
    try {
      r = await f(`${base}${caminho}`, {
        method: metodo,
        headers: { access_token: chave, 'Content-Type': 'application/json', 'User-Agent': 'egi-brand/1.0' },
        body: corpo ? JSON.stringify(corpo) : undefined,
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch {
      throw new ErroAsaas('Não foi possível falar com o Asaas. Tente de novo em instantes.', { codigo: 'rede', transitorio: true });
    }
    const texto = await r.text();
    let json = {}; try { json = texto ? JSON.parse(texto) : {}; } catch { /* página de erro de proxy */ }
    if (!r.ok) {
      const msg = Array.isArray(json.errors) && json.errors.length ? json.errors.map((e) => e.description).join(' ') : `Asaas respondeu ${r.status}.`;
      throw new ErroAsaas(msg, { status: r.status, codigo: json.errors?.[0]?.code || `http_${r.status}`, transitorio: r.status >= 500 || r.status === 429 });
    }
    return json;
  }

  return {
    configurado,
    ambiente,
    // reaproveita o cliente que já existe no Asaas com o mesmo documento; senão cadastra
    async garantirCliente({ nome, cpfCnpj, email, celular, referencia }) {
      const achado = await req('GET', `/customers?cpfCnpj=${encodeURIComponent(cpfCnpj)}&limit=1`);
      const id = str(achado.data?.[0]?.id);
      if (id) return id;
      const novo = await req('POST', '/customers', {
        name: nome, cpfCnpj, email, ...(celular ? { mobilePhone: celular } : {}), externalReference: referencia, notificationDisabled: false,
      });
      if (!str(novo.id)) throw new ErroAsaas('O Asaas não devolveu o id do cliente.');
      return novo.id;
    },
    async criarCobranca({ cliente, forma = 'UNDEFINED', valorCentavos, vencimento, descricao, referencia }) {
      return req('POST', '/payments', {
        customer: cliente, billingType: forma, value: valorCentavos / 100, dueDate: vencimento,
        description: String(descricao || '').slice(0, 500), externalReference: referencia,
      });
    },
    async criarAssinatura({ cliente, forma = 'UNDEFINED', valorCentavos, proximoVencimento, descricao, referencia }) {
      return req('POST', '/subscriptions', {
        customer: cliente, billingType: forma, value: valorCentavos / 100, nextDueDate: proximoVencimento, cycle: 'MONTHLY',
        description: String(descricao || '').slice(0, 500), externalReference: referencia,
      });
    },
    // updatePendingPayments: o valor novo vale também pras mensalidades já geradas e ainda abertas
    atualizarAssinatura: (id, { valorCentavos, forma, proximoVencimento, descricao }) => req('PUT', `/subscriptions/${encodeURIComponent(id)}`, {
      ...(valorCentavos != null ? { value: valorCentavos / 100, updatePendingPayments: true } : {}),
      ...(forma ? { billingType: forma } : {}), ...(proximoVencimento ? { nextDueDate: proximoVencimento } : {}),
      ...(descricao ? { description: descricao } : {}),
    }),
    cancelarAssinatura: (id) => req('DELETE', `/subscriptions/${encodeURIComponent(id)}`),
    buscarCobranca: async (id) => {
      try { return await req('GET', `/payments/${encodeURIComponent(id)}`); } catch (e) { if (e.status === 404) return null; throw e; }
    },
    cancelarCobranca: (id) => req('DELETE', `/payments/${encodeURIComponent(id)}`),
    cobrancasDaAssinatura: async (id) => (await req('GET', `/subscriptions/${encodeURIComponent(id)}/payments?limit=100`)).data || [],
    saude: async () => { await req('GET', '/customers?limit=1'); return true; },
  };
}
