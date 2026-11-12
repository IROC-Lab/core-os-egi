// EGI Brand · WhatsApp de cada empresa pela Evolution API (evo.appegi.com.br).
// - uma instância por empresa (egi-<slug>), criada com um token PRÓPRIO: é ele (e não a apikey global) que vai pro
//   .env da empresa, então a skill whatsapp de uma empresa só enxerga a instância dela;
// - o webhook MESSAGES_UPSERT aponta direto pro EGI Brand: /hooks/whatsapp/<empresa>/<segredo> (sem n8n no meio);
// - só os números autorizados (e, se ligado, o chat "Você" do número conectado) dão ordens;
// - áudio é transcrito aqui (Evolution -> Groq Whisper) e entra como texto com 🎤.
import { iguais, token } from '../cripto.js';
import { fatiar } from './nucleo.js';
import { transcrever } from './transcricao.js';

const MARCA = '⁣'; // caractere invisível: marca a resposta no chat "Você" e evita loop

// número comparável: só dígitos, com 55, sem o 9 extra do celular brasileiro
export function chaveNumero(n) {
  let d = String(n || '').split('@')[0].split(':')[0].replace(/\D/g, '');
  if (d.length === 10 || d.length === 11) d = `55${d}`;
  if (d.startsWith('55') && d.length === 13 && d[4] === '9') d = d.slice(0, 4) + d.slice(5);
  return d;
}

// corpo do webhook da Evolution -> mensagem normalizada (ou null quando não interessa)
export function lerMensagemEvolution(b) {
  const d = b?.data || {};
  const chave = d.key || {};
  const remoto = String(chave.remoteJid || '');
  if (!remoto || /@(g\.us|broadcast|newsletter)$/.test(remoto)) return null;
  const chat = [chave.remoteJidAlt, chave.senderPn, remoto].find((j) => String(j || '').endsWith('@s.whatsapp.net')) || '';
  if (!chat) return null;
  const m = d.message || {};
  const texto = m.conversation || m.extendedTextMessage?.text || m.imageMessage?.caption || m.videoMessage?.caption || '';
  if (texto.startsWith(MARCA)) return null;
  const ehAudio = d.messageType === 'audioMessage' || Boolean(m.audioMessage);
  const tipo = texto ? 'texto' : ehAudio ? 'audio' : 'outro';
  if (tipo === 'outro' && /reaction|protocol|senderKey|edited|poll|sticker/i.test(String(d.messageType))) return null;
  return { texto, tipo, deMim: Boolean(chave.fromMe), chat, msgId: String(chave.id || ''), nome: String(d.pushName || ''), eu: String(b.sender || '') };
}

export function criarWhatsapp({ cfg, registro, empresas, nucleo, fetch: f = fetch, log = console.log }) {
  const instanciaDe = (e) => `egi-${e.slug}`;
  const webhookDe = (e, c) => `${cfg.urlPublica}/hooks/whatsapp/${e.id}/${c.segredo_webhook}`;
  const configurado = () => Boolean(cfg.evolution.url && cfg.evolution.chave);

  async function evo(caminho, opcoes = {}, chave = cfg.evolution.chave) {
    if (!configurado()) throw new Error('Evolution API não configurada (EVO_URL e EVO_KEY da plataforma).');
    const r = await f(`${cfg.evolution.url}${caminho}`, { ...opcoes, headers: { apikey: chave, 'Content-Type': 'application/json', ...(opcoes.headers || {}) }, signal: AbortSignal.timeout(30_000) });
    const corpo = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(corpo?.response?.message?.toString() || corpo?.message || `Evolution respondeu ${r.status}`);
    return corpo;
  }

  async function canalDe(e) {
    const c = await registro.garantir(e.id, 'whatsapp', { instancia: instanciaDe(e), chatVoce: true });
    if (!c.token_cifrado) return registro.atualizar(c.id, { token_cifrado: registro.cifrar(token(24)) });
    return c;
  }

  // a instância some se alguém apagar pela Evolution: recria com o token e o webhook da empresa
  async function garantirInstancia(e) {
    const c = await canalDe(e);
    const inst = c.config.instancia || instanciaDe(e);
    let existe = false;
    try {
      const lista = await evo(`/instance/fetchInstances?instanceName=${encodeURIComponent(inst)}`);
      existe = (Array.isArray(lista) ? lista : [lista]).some((i) => (i?.name || i?.instance?.instanceName) === inst);
    } catch { /* 404: não existe */ }
    if (!existe) await evo('/instance/create', { method: 'POST', body: JSON.stringify({ instanceName: inst, token: registro.tokenDe(c), integration: 'WHATSAPP-BAILEYS', qrcode: false }) });
    await evo(`/webhook/set/${inst}`, { method: 'POST', body: JSON.stringify({ webhook: { enabled: true, url: webhookDe(e, c), byEvents: false, base64: false, events: ['MESSAGES_UPSERT'] } }) });
    await evo(`/settings/set/${inst}`, { method: 'POST', body: JSON.stringify({ rejectCall: false, msgCall: '', groupsIgnore: true, alwaysOnline: false, readMessages: false, readStatus: false, syncFullHistory: false }) }).catch(() => {});
    return { canal: c, instancia: inst };
  }

  const cacheNumero = new Map(); // empresa -> { n, t }
  async function estado(e) {
    const c = await registro.canal(e.id, 'whatsapp');
    const saida = { configurado: configurado(), estado: 'indisponivel', numero: '', instancia: c?.config?.instancia || instanciaDe(e), chatVoce: c?.config?.chatVoce !== false };
    if (!configurado() || !c) return { ...saida, estado: c ? 'indisponivel' : 'close' };
    try {
      const est = await evo(`/instance/connectionState/${saida.instancia}`);
      saida.estado = est?.instance?.state || est?.state || 'close';
      const lista = await evo(`/instance/fetchInstances?instanceName=${saida.instancia}`);
      const inst = (Array.isArray(lista) ? lista : [lista]).find((i) => (i.name || i.instance?.instanceName) === saida.instancia);
      saida.numero = String(inst?.ownerJid || inst?.instance?.owner || '').split('@')[0];
      saida.nomePerfil = inst?.profileName || '';
      if (saida.numero) cacheNumero.set(e.id, { n: saida.numero, t: Date.now() });
    } catch (err) { saida.erro = err.message; saida.estado = 'close'; }
    return saida;
  }
  async function meuNumero(e) {
    const c = cacheNumero.get(e.id);
    if (c && Date.now() - c.t < 600_000) return c.n;
    return (await estado(e)).numero;
  }

  async function conectar(e, { novo = false } = {}) {
    cacheNumero.delete(e.id);
    const { instancia } = await garantirInstancia(e);
    const est = await evo(`/instance/connectionState/${instancia}`);
    let st = est?.instance?.state || est?.state || 'close';
    if (st === 'open') return { estado: st };
    if (novo && st === 'connecting') { await evo(`/instance/logout/${instancia}`, { method: 'DELETE' }).catch(() => {}); st = 'close'; }
    const r = await evo(`/instance/connect/${instancia}`);
    return { qr: r.base64 || null, estado: 'connecting' };
  }
  async function qr(e) {
    const c = await registro.canal(e.id, 'whatsapp');
    const inst = c?.config?.instancia || instanciaDe(e);
    const est = await evo(`/instance/connectionState/${inst}`);
    const st = est?.instance?.state || est?.state || 'close';
    if (st !== 'connecting') { if (st === 'open') cacheNumero.delete(e.id); return { estado: st }; }
    const r = await evo(`/instance/connect/${inst}`);
    return { estado: st, qr: r.base64 || null };
  }
  async function desconectar(e) {
    cacheNumero.delete(e.id);
    const c = await registro.canal(e.id, 'whatsapp');
    if (c) await evo(`/instance/logout/${c.config.instancia}`, { method: 'DELETE' }).catch(() => {});
    return estado(e);
  }

  // ---------- quem pode dar ordens ----------
  async function acesso(e) {
    const c = await registro.canal(e.id, 'whatsapp');
    const numeros = (await registro.acessos(e.id, 'whatsapp')).map((a) => a.identificador);
    return { numeros, chatVoce: c?.config?.chatVoce !== false };
  }
  async function salvarAcesso(e, { numeros = [], chatVoce = true }) {
    const c = await canalDe(e);
    const limpos = [...new Set(numeros.map((n) => String(n).replace(/\D/g, '')).filter((n) => n.length >= 10 && n.length <= 13).map((n) => (n.length <= 11 ? `55${n}` : n)))].slice(0, 30);
    await registro.substituirAcessos(e.id, 'whatsapp', limpos);
    await registro.atualizar(c.id, { config: { ...c.config, chatVoce: chatVoce !== false } });
    return acesso(e);
  }
  // devolve o número pra onde a resposta vai, ou null se quem mandou não está autorizado
  async function autorizado(e, { deMim, chat, eu }) {
    const a = await acesso(e);
    const k = chaveNumero(chat);
    if (!k) return null;
    const euNumero = eu || await meuNumero(e);
    if (deMim) return a.chatVoce && k === chaveNumero(euNumero) ? String(chat).split('@')[0] : null;
    const lista = [...a.numeros, ...(e.whatsapp_dono ? [e.whatsapp_dono] : [])];
    return lista.some((n) => chaveNumero(n) === k) ? String(chat).split('@')[0] : null;
  }

  // ---------- envio ----------
  async function enviarPorInstancia(instancia, numero, texto, chave) {
    for (const parte of fatiar(texto, 3500)) {
      await evo(`/message/sendText/${instancia}`, { method: 'POST', body: JSON.stringify({ number: numero, text: parte }) }, chave);
    }
  }
  async function enviar(e, numero, texto) {
    const c = await registro.canal(e.id, 'whatsapp');
    if (!c) throw new Error('empresa sem WhatsApp');
    const eu = await meuNumero(e).catch(() => '');
    const marca = eu && chaveNumero(numero) === chaveNumero(eu) ? MARCA : '';
    await enviarPorInstancia(c.config.instancia, numero, `${marca}${texto}`);
  }
  // avisos de cobrança: pelo número da EGI (se houver) e, sem ele, pelo número da própria empresa
  async function enviarAviso(e, numero, texto) {
    if (cfg.avisos.evoInstancia) return enviarPorInstancia(cfg.avisos.evoInstancia, numero, texto);
    return enviar(e, numero, texto);
  }

  async function baixarAudio(instancia, msgId) {
    const r = await evo(`/chat/getBase64FromMediaMessage/${instancia}`, { method: 'POST', body: JSON.stringify({ message: { key: { id: msgId } }, convertToMp4: false }) });
    if (!r?.base64) throw new Error('Evolution não devolveu o áudio');
    return { dados: Buffer.from(r.base64, 'base64'), mime: r.mimetype || 'audio/ogg' };
  }

  // ---------- webhook de entrada ----------
  async function receberWebhook(empresaId, segredo, corpo) {
    const e = await empresas.buscar(empresaId);
    if (!e) return { status: 404 };
    const c = await registro.canal(e.id, 'whatsapp');
    if (!c || !iguais(segredo, c.segredo_webhook)) return { status: 401 };
    if (!c.ativo) return { status: 202, ignorado: 'canal desligado' };
    const evento = String(corpo?.event || '').toLowerCase();
    if (evento && !evento.includes('messages.upsert') && !evento.includes('messages_upsert')) return { status: 202, ignorado: evento };
    const m = lerMensagemEvolution(corpo);
    if (!m) return { status: 202, ignorado: 'sem mensagem' };
    const para = await autorizado(e, m);
    if (para === null) return { status: 202, ignorado: 'não autorizado' };
    // processa em segundo plano: a Evolution não espera o agente
    (async () => {
      let texto = m.texto;
      if (m.tipo === 'audio') {
        try {
          const vars = await empresas.variaveis(e.id);
          const audio = await baixarAudio(c.config.instancia, m.msgId);
          const t = await transcrever({ ...audio, chave: vars.GROQ_API_KEY || cfg.groqChave, fetch: f });
          texto = t ? `🎤 ${t}` : '';
        } catch (err) { log(`[whatsapp] ${e.slug}: transcrição falhou: ${err.message}`); }
        if (!texto) { await enviar(e, para, 'Não consegui ouvir esse áudio. Pode escrever?').catch(() => {}); return; }
      }
      if (m.tipo === 'outro' || !texto) { await enviar(e, para, 'Por enquanto eu leio texto e áudio. Escreve o que você precisa que eu faço.').catch(() => {}); return; }
      await nucleo.receber(e.id, {
        canal: 'whatsapp', chave: chaveNumero(para) || 'dono', de: para, nome: m.nome, texto,
        motor: c.motor || undefined, agente: c.agente || undefined, extraEnv: { WHATS_PARA: para },
        responder: (t) => enviar(e, para, t).catch((err) => log(`[whatsapp] ${e.slug}: falhou ao responder: ${err.message}`)),
      });
    })().catch((err) => log(`[whatsapp] ${e.slug}: ${err.message}`));
    return { status: 202, ok: true };
  }

  // variáveis que a skill whatsapp da empresa enxerga: só a instância dela, com o token dela
  async function variaveisDaEmpresa(e) {
    const c = await registro.canal(e.id, 'whatsapp');
    if (!c || !cfg.evolution.url) return {};
    const a = await acesso(e).catch(() => ({ numeros: [] }));
    return { EVO_URL: cfg.evolution.url, EVO_KEY: registro.tokenDe(c), EVO_INSTANCE: c.config.instancia, WHATS_PARA: a.numeros[0] || e.whatsapp_dono || '' };
  }

  return { configurado, estado, conectar, qr, desconectar, acesso, salvarAcesso, autorizado, enviar, enviarAviso, receberWebhook, garantirInstancia, variaveisDaEmpresa, instanciaDe };
}
