// EGI Brand · núcleo dos canais: toda mensagem que chega (WhatsApp, Telegram, ponte n8n) passa por aqui.
// - empresa sem acesso (suspensa, aguardando setup, cancelada) não roda agente: recebe o aviso, no máximo 1 vez a cada 6h por chat;
// - uma conversa do painel por chat (chave); "/nova" abre outra; 6h parada também abre outra;
// - mensagens do mesmo chat entram em fila (nunca duas ao mesmo tempo na mesma sessão do motor);
// - o motor é o do canal (ou o padrão de canais da empresa) e roda com o login DO CLIENTE.
import { STATUS_USO } from '../empresas.js';

const SEIS_HORAS = 6 * 3600_000;
export const COMANDO_NOVA = /^\s*\/(nova|novo|clear|limpar)\b\s*/i;

export const PROMPTS = {
  whatsapp: [
    'Esta conversa acontece pelo WhatsApp: a pessoa te mandou mensagem e a sua resposta final volta pra ela como mensagem.',
    'Responda curto, em texto simples de WhatsApp (sem tabela, sem título, no máximo um negrito com *asteriscos*).',
    'Pra ler conversas, achar contato ou mandar mensagem e arquivo pra outra pessoa, use a skill whatsapp e siga as regras dela.',
  ].join(' '),
  telegram: [
    'Esta conversa acontece pelo Telegram: a pessoa te mandou mensagem e a sua resposta final volta pra ela como mensagem.',
    'Responda curto, em texto simples (sem tabela, sem título, sem markdown).',
  ].join(' '),
  ponte: (canal, nome) => [
    `Esta conversa acontece pelo canal ${canal}${nome ? ` com ${nome}` : ''}: a sua resposta final volta pra pessoa como mensagem nesse canal.`,
    'Responda curto, em texto simples de chat (sem tabela, sem título; negrito só com *asteriscos*).',
  ].join(' '),
};
const promptAgente = (agente) => (agente
  ? `Este canal é do especialista "${agente}": delegue o pedido ao subagente ${agente} (.claude/agents/${agente}.md) e devolva a resposta dele.`
  : 'Se a mensagem pedir um especialista (ex.: "@sdr ..."), delegue ao subagente correspondente em .claude/agents/.');

export function mensagemBloqueio(empresa, situacao) {
  const link = situacao?.vencida?.link_fatura || situacao?.setup?.link_fatura || '';
  if (empresa.status === 'aguardando_setup') return `O cérebro da ${empresa.nome} ainda não foi liberado: falta confirmar o pagamento do setup.${link ? `\n\nPagar: ${link}` : ''}`;
  if (empresa.status === 'cancelada') return `A assinatura do EGI Brand da ${empresa.nome} foi encerrada.`;
  return `O acesso da ${empresa.nome} ao EGI Brand está suspenso${empresa.motivo_suspensao?.startsWith('Mensalidade') ? ' por pendência financeira' : ''}. Assim que for regularizado, volto a atender na hora.${link ? `\n\nPagar: ${link}` : ''}`;
}

export function criarNucleoCanais({ runtime, empresas, cobranca, log = console.log }) {
  const filas = new Map(); // empresa:canal:chave -> Promise
  const avisados = new Map(); // empresa:canal:chave -> último aviso de bloqueio

  function conversaDoChat(cerebro, canal, chave, { forcarNova, motor, extra }) {
    const todos = cerebro.lerDados('canais.json', {});
    const k = `${canal}:${chave}`;
    const est = todos[k] || {};
    const atual = cerebro.conversa(est.conversa);
    const parada = !est.ultima || Date.now() - est.ultima > SEIS_HORAS;
    // se alguém assumiu essa conversa pelo terminal do painel, o canal abre outra pra não brigarem
    if (atual && !atual.arquivada && !forcarNova && !parada && !cerebro.vivos.has(atual.id) && atual.motor === motor) {
      todos[k] = { ...est, ultima: Date.now() }; cerebro.gravarDados('canais.json', todos);
      return atual;
    }
    const nova = cerebro.criarConversa({ origem: canal, motor, canalChave: chave, ...extra });
    todos[k] = { conversa: nova.id, ultima: Date.now() };
    cerebro.gravarDados('canais.json', todos);
    return nova;
  }

  async function processar(empresaId, m) {
    const empresa = await empresas.buscar(empresaId);
    if (!empresa) return;
    if (!STATUS_USO.has(empresa.status)) {
      const k = `${empresa.id}:${m.canal}:${m.chave}`;
      if (Date.now() - (avisados.get(k) || 0) > SEIS_HORAS) {
        avisados.set(k, Date.now());
        const situacao = await cobranca.situacao(empresa.id).catch(() => null);
        await m.responder(mensagemBloqueio(empresa, situacao));
      }
      return;
    }
    const cerebro = runtime.de(empresa);
    const pediuNova = COMANDO_NOVA.test(m.texto);
    const texto = m.texto.replace(COMANDO_NOVA, '').trim();
    const motor = m.motor || empresa.motor_canais;
    const conv = conversaDoChat(cerebro, m.canal, m.chave, { forcarNova: pediuNova, motor, extra: { canalDe: m.de, canalNome: m.nome, agente: m.agente || undefined } });
    if (!texto) { await m.responder('Conversa nova aberta. Pode mandar.'); return; }
    const base = m.canal === 'whatsapp' ? PROMPTS.whatsapp : m.canal === 'telegram' ? PROMPTS.telegram : PROMPTS.ponte(m.canalNome || m.canal, m.nome || m.de);
    let resposta;
    try {
      resposta = await cerebro.rodar(conv, texto, {
        prompt: `${base} ${promptAgente(m.agente)}`,
        extraEnv: { CORE_OS_CANAL: m.canal, CORE_OS_CANAL_DE: String(m.de || ''), CORE_OS_CANAL_CHAVE: String(m.chave), ...(m.extraEnv || {}) },
      });
    } catch (e) {
      log(`[${m.canal}] ${empresa.slug}: ${e.message}`);
      await m.responder('Deu erro aqui do meu lado. Tenta de novo em instantes.');
      return;
    }
    await m.responder(resposta || 'Feito.');
  }

  // m = { canal, chave, de, nome, texto, agente?, motor?, extraEnv?, responder(texto) }
  function receber(empresaId, m) {
    const k = `${empresaId}:${m.canal}:${m.chave}`;
    const anterior = filas.get(k) || Promise.resolve();
    const atual = anterior.then(() => processar(empresaId, m)).catch((e) => log(`[${m.canal}] ${e.stack || e.message}`));
    filas.set(k, atual);
    atual.finally(() => { if (filas.get(k) === atual) filas.delete(k); });
    return atual;
  }

  return { receber, emFila: () => filas.size };
}

// divide uma resposta longa em pedaços que o canal aceita, quebrando em parágrafo ou linha quando dá
export function fatiar(texto, max) {
  const s = String(texto || '');
  if (s.length <= max) return [s];
  const partes = []; let resto = s;
  while (resto.length > max) {
    let corte = resto.lastIndexOf('\n\n', max);
    if (corte < max * 0.5) corte = resto.lastIndexOf('\n', max);
    if (corte < max * 0.5) corte = resto.lastIndexOf(' ', max);
    if (corte < max * 0.5) corte = max;
    partes.push(resto.slice(0, corte).trimEnd());
    resto = resto.slice(corte).trimStart();
  }
  if (resto) partes.push(resto);
  return partes;
}
