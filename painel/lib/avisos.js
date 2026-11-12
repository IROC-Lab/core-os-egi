// EGI Brand · avisos ao cliente (cobrança e ciclo de vida). Sai pelo WhatsApp (número de avisos da EGI ou, sem ele,
// o número conectado da própria empresa) e pelo Telegram (bot da empresa, pros chats pareados).
// Cada aviso ligado a uma cobrança é "reservado" no banco antes de sair: dois processos nunca mandam o mesmo duas vezes.

const reais = (c) => (Number(c || 0) / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const dataBr = (d) => (d ? String(d).slice(0, 10).split('-').reverse().join('/') : '');
const ASSINATURA = '\n\n_EGI Brand · por EGI Group_';

export function textoAviso(tipo, v) {
  const ola = `Olá${v.responsavel ? `, ${v.responsavel}` : ''}!`;
  const link = v.link ? `\n\nPagar agora: ${v.link}` : '';
  const suporte = v.suporte ? `\nDúvidas: ${v.suporte}` : '';
  switch (tipo) {
    case 'setup_pendente':
      return `${ola} Que bom ter a *${v.empresa}* no EGI Brand.\n\nPra liberar o seu cérebro, falta o pagamento do setup inicial de *${reais(v.valor)}*.${link}${suporte}${ASSINATURA}`;
    case 'boas_vindas':
      return `${ola} Pagamento confirmado: o cérebro da *${v.empresa}* está liberado.${v.url ? `\n\nAcesse: ${v.url}` : ''}\n\nA mensalidade de *${reais(v.valor)}* começa em ${dataBr(v.vencimento)}.${suporte}${ASSINATURA}`;
    case 'atraso_d1':
      return `${ola} A mensalidade do EGI Brand da *${v.empresa}* (${reais(v.valor)}) venceu em ${dataBr(v.vencimento)}.\n\nPra não interromper o serviço, o pagamento precisa cair até *${dataBr(v.limite)}*.${link}${suporte}${ASSINATURA}`;
    case 'atraso_d3':
      return `${ola} Lembrete: a mensalidade de ${reais(v.valor)} (vencida em ${dataBr(v.vencimento)}) continua em aberto.\n\nSe não for paga até *${dataBr(v.limite)}*, o acesso da *${v.empresa}* ao EGI Brand será suspenso.${link}${suporte}${ASSINATURA}`;
    case 'suspensao':
      return `${ola} O acesso da *${v.empresa}* ao EGI Brand foi *suspenso* por falta de pagamento da mensalidade vencida em ${dataBr(v.vencimento)} (${reais(v.valor)}).\n\nSeus arquivos e o seu cérebro continuam guardados. Assim que o pagamento for confirmado, tudo volta a funcionar na hora.${link}${suporte}${ASSINATURA}`;
    case 'reativacao':
      return `${ola} Pagamento confirmado. O acesso da *${v.empresa}* ao EGI Brand está liberado de novo. Obrigado!${ASSINATURA}`;
    case 'suspensao_manual':
      return `${ola} O acesso da *${v.empresa}* ao EGI Brand foi suspenso${v.motivo ? `: ${v.motivo}` : ''}.${suporte}${ASSINATURA}`;
    default:
      return `${ola} ${v.texto || ''}${ASSINATURA}`;
  }
}

// enviadores = { whatsapp(empresa, numero, texto), telegram(empresa, texto) -> nº de chats que receberam }
export function criarAvisos({ db, cfg, enviadores, log = console.log }) {
  async function reservar(empresaId, cobrancaId, tipo, canal, destino) {
    if (!cobrancaId) {
      return db.um("insert into avisos (empresa_id, tipo, canal, destino, status) values ($1,$2,$3,$4,'enviado') returning id", [empresaId, tipo, canal, destino]);
    }
    return db.um(`insert into avisos (empresa_id, cobranca_id, tipo, canal, destino, status) values ($1,$2,$3,$4,$5,'enviado')
      on conflict (cobranca_id, tipo, canal) where cobranca_id is not null do nothing returning id`, [empresaId, cobrancaId, tipo, canal, destino]);
  }
  const marcar = (id, status, erro = null) => db.query('update avisos set status = $2, erro = $3 where id = $1', [id, status, erro]);

  // manda o aviso por todos os canais que a empresa tem. Devolve { whatsapp, telegram } com o resultado de cada um.
  async function avisar(empresa, tipo, valores = {}, cobranca = null) {
    const texto = textoAviso(tipo, {
      empresa: empresa.nome, responsavel: empresa.responsavel, suporte: cfg.avisos?.suporte, url: cfg.urlPublica,
      ...(cobranca ? { valor: cobranca.valor_centavos, vencimento: cobranca.vencimento, link: cobranca.link_fatura } : {}),
      ...valores,
    });
    const resultado = {};
    const numero = empresa.whatsapp_dono;
    for (const canal of ['whatsapp', 'telegram']) {
      const destino = canal === 'whatsapp' ? numero : 'chats pareados';
      const reserva = await reservar(empresa.id, cobranca?.id || null, tipo, canal, destino || '');
      if (!reserva) { resultado[canal] = 'ja_enviado'; continue; }
      try {
        if (canal === 'whatsapp') {
          if (!numero) { await marcar(reserva.id, 'sem_canal', 'empresa sem whatsapp_dono'); resultado[canal] = 'sem_canal'; continue; }
          await enviadores.whatsapp(empresa, numero, texto);
        } else {
          const n = await enviadores.telegram(empresa, texto);
          if (!n) { await marcar(reserva.id, 'sem_canal', 'sem bot ou sem chat pareado'); resultado[canal] = 'sem_canal'; continue; }
        }
        resultado[canal] = 'enviado';
      } catch (e) {
        await marcar(reserva.id, 'falhou', String(e.message).slice(0, 500));
        resultado[canal] = 'falhou';
        log(`[avisos] ${empresa.slug} ${tipo} por ${canal} falhou: ${e.message}`);
      }
    }
    return { texto, resultado };
  }

  // um aviso que falhou pode ser tentado de novo (apaga a reserva e manda outra vez)
  async function reenviar(empresa, tipo, cobranca) {
    if (cobranca) await db.query("delete from avisos where cobranca_id = $1 and tipo = $2 and status <> 'enviado'", [cobranca.id, tipo]);
    return avisar(empresa, tipo, {}, cobranca);
  }

  return { avisar, reenviar };
}
