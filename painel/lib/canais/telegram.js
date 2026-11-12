// EGI Brand · Telegram de cada empresa: o bot DA EMPRESA (criado no @BotFather) atende pelo cérebro dela.
// - o token do bot fica cifrado no canal; o webhook aponta pra /hooks/telegram/<empresa> com secret_token próprio;
// - quem pode falar entra por pareamento: o painel gera um código e a pessoa manda "/start CODIGO" pro bot
//   (ou abre o link t.me/<bot>?start=CODIGO). Só chats privados;
// - voz e áudio são transcritos (Groq Whisper) e entram como texto com 🎤.
import { codigoCurto, iguais } from '../cripto.js';
import { fatiar } from './nucleo.js';
import { transcrever } from './transcricao.js';

const API = 'https://api.telegram.org';

export function criarTelegram({ cfg, db, registro, empresas, nucleo, fetch: f = fetch, log = console.log }) {
  async function tg(tokenBot, metodo, corpo) {
    const r = await f(`${API}/bot${tokenBot}/${metodo}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corpo || {}), signal: AbortSignal.timeout(30_000) });
    const j = await r.json().catch(() => ({}));
    if (!j.ok) throw new Error(j.description || `Telegram respondeu ${r.status}`);
    return j.result;
  }
  const webhookDe = (e) => `${cfg.urlPublica}/hooks/telegram/${e.id}`;

  async function configurar(e, tokenBot) {
    const t = String(tokenBot || '').trim();
    if (!/^\d{5,}:[A-Za-z0-9_-]{30,}$/.test(t)) throw Object.assign(new Error('Token inválido. Copie o token que o @BotFather mandou (formato 123456:ABC...).'), { status: 400 });
    if (!cfg.urlPublica.startsWith('https://')) throw Object.assign(new Error('O Telegram exige HTTPS: defina EGI_PUBLIC_URL com https://.'), { status: 400 });
    const eu = await tg(t, 'getMe');
    const c = await registro.garantir(e.id, 'telegram');
    await tg(t, 'setWebhook', { url: webhookDe(e), secret_token: c.segredo_webhook, allowed_updates: ['message'], drop_pending_updates: true });
    return registro.atualizar(c.id, { token_cifrado: registro.cifrar(t), ativo: true, estado: 'conectado', config: { ...c.config, bot: eu.username, botId: eu.id, nomeBot: eu.first_name } });
  }

  async function desligar(e) {
    const c = await registro.canal(e.id, 'telegram');
    if (!c) return null;
    const t = registro.tokenDe(c);
    if (t) await tg(t, 'deleteWebhook', {}).catch(() => {});
    return registro.atualizar(c.id, { ativo: false, estado: 'desligado', token_cifrado: null });
  }

  async function estado(e) {
    const c = await registro.canal(e.id, 'telegram');
    const acessos = await registro.acessos(e.id, 'telegram');
    if (!c || !c.token_cifrado) return { conectado: false, acessos };
    let info = null;
    try { info = await tg(registro.tokenDe(c), 'getWebhookInfo'); } catch (err) { return { conectado: false, bot: c.config.bot, erro: err.message, acessos }; }
    return { conectado: c.ativo && info?.url === webhookDe(e), bot: c.config.bot, pendentes: info?.pending_update_count || 0, ultimoErro: info?.last_error_message || null, acessos };
  }

  async function gerarCodigo(e) {
    const c = await registro.canal(e.id, 'telegram');
    if (!c?.config?.bot) throw Object.assign(new Error('Conecte o bot primeiro.'), { status: 400 });
    const codigo = codigoCurto(8);
    await db.query("insert into canal_pareamentos (codigo, empresa_id, canal_tipo, expira_em) values ($1,$2,'telegram', now() + interval '30 minutes')", [codigo, e.id]);
    return { codigo, link: `https://t.me/${c.config.bot}?start=${codigo}`, validoPor: '30 minutos' };
  }

  async function enviar(e, chatId, texto) {
    const c = await registro.canal(e.id, 'telegram');
    const t = registro.tokenDe(c);
    if (!t) throw new Error('empresa sem bot do Telegram');
    for (const parte of fatiar(texto, 4000)) await tg(t, 'sendMessage', { chat_id: chatId, text: parte, disable_web_page_preview: true });
  }
  // avisos: pra todos os chats pareados. Devolve quantos receberam.
  async function enviarAviso(e, texto) {
    const c = await registro.canal(e.id, 'telegram');
    if (!c?.token_cifrado) return 0;
    let n = 0;
    for (const a of await registro.acessos(e.id, 'telegram')) { await enviar(e, a.identificador, texto.replace(/\*/g, '')); n++; }
    return n;
  }

  async function baixarArquivo(tokenBot, fileId) {
    const arq = await tg(tokenBot, 'getFile', { file_id: fileId });
    const r = await f(`${API}/file/bot${tokenBot}/${arq.file_path}`, { signal: AbortSignal.timeout(60_000) });
    if (!r.ok) throw new Error(`download ${r.status}`);
    return { dados: Buffer.from(await r.arrayBuffer()), nome: arq.file_path.split('/').pop() || 'audio.ogg' };
  }

  const avisadosNaoAutorizados = new Map();
  async function receberWebhook(empresaId, segredoCabecalho, update) {
    const e = await empresas.buscar(empresaId);
    if (!e) return { status: 404 };
    const c = await registro.canal(e.id, 'telegram');
    if (!c || !iguais(segredoCabecalho, c.segredo_webhook)) return { status: 401 };
    if (!c.ativo) return { status: 200, ignorado: 'canal desligado' };
    const msg = update?.message;
    if (!msg?.chat || msg.chat.type !== 'private') return { status: 200, ignorado: 'não é chat privado' };
    const chatId = String(msg.chat.id);
    const nome = [msg.from?.first_name, msg.from?.last_name].filter(Boolean).join(' ') || msg.from?.username || '';
    const texto = String(msg.text || msg.caption || '').trim();
    const responder = (t) => enviar(e, chatId, t).catch((err) => log(`[telegram] ${e.slug}: falhou ao responder: ${err.message}`));

    // pareamento: /start CODIGO
    const start = texto.match(/^\/start(?:@\w+)?\s+([A-Z0-9]{6,12})\s*$/i);
    if (start) {
      const par = await db.um(`update canal_pareamentos set usado_em = now(), usado_por = $3
        where codigo = $1 and empresa_id = $2 and usado_em is null and expira_em > now() returning codigo`, [start[1].toUpperCase(), e.id, chatId]);
      if (!par) { await responder('Código inválido ou vencido. Gere outro no painel do EGI Brand (Configurações › Telegram).'); return { status: 200, ignorado: 'código inválido' }; }
      await registro.autorizar(e.id, 'telegram', chatId, nome + (msg.from?.username ? ` (@${msg.from.username})` : ''));
      await responder(`Pronto${nome ? `, ${nome.split(' ')[0]}` : ''}! Este chat agora fala com o cérebro da ${e.nome}. Pode mandar o que precisa (texto ou áudio). /nova abre uma conversa do zero.`);
      return { status: 200, ok: true, pareado: chatId };
    }

    const permitidos = new Set((await registro.acessos(e.id, 'telegram')).map((a) => a.identificador));
    if (!permitidos.has(chatId)) {
      if (Date.now() - (avisadosNaoAutorizados.get(chatId) || 0) > 6 * 3600_000) {
        avisadosNaoAutorizados.set(chatId, Date.now());
        await responder('Este bot é privado. Peça ao responsável o código de acesso (painel do EGI Brand › Configurações › Telegram).');
      }
      return { status: 200, ignorado: 'não autorizado' };
    }
    if (/^\/start\b/i.test(texto)) { await responder('Você já está conectado. Pode mandar.'); return { status: 200 }; }

    (async () => {
      let entrada = texto;
      const audio = msg.voice || msg.audio;
      if (!entrada && audio) {
        try {
          const vars = await empresas.variaveis(e.id);
          const arq = await baixarArquivo(registro.tokenDe(c), audio.file_id);
          const t = await transcrever({ dados: arq.dados, nome: arq.nome, mime: audio.mime_type || 'audio/ogg', chave: vars.GROQ_API_KEY || cfg.groqChave, fetch: f });
          entrada = t ? `🎤 ${t}` : '';
        } catch (err) { log(`[telegram] ${e.slug}: transcrição falhou: ${err.message}`); }
        if (!entrada) { await responder('Não consegui ouvir esse áudio. Pode escrever?'); return; }
      }
      if (!entrada) { await responder('Por enquanto eu leio texto e áudio. Escreve o que você precisa que eu faço.'); return; }
      await nucleo.receber(e.id, { canal: 'telegram', chave: chatId, de: chatId, nome, texto: entrada, motor: c.motor || undefined, agente: c.agente || undefined, extraEnv: { TELEGRAM_CHAT: chatId }, responder });
    })().catch((err) => log(`[telegram] ${e.slug}: ${err.message}`));
    return { status: 200, ok: true };
  }

  async function variaveisDaEmpresa(e) {
    const c = await registro.canal(e.id, 'telegram');
    return c?.token_cifrado ? { TELEGRAM_BOT_TOKEN: registro.tokenDe(c) } : {};
  }

  return { configurar, desligar, estado, gerarCodigo, enviar, enviarAviso, receberWebhook, variaveisDaEmpresa, remover: (e, chatId) => registro.desautorizar(e.id, 'telegram', chatId) };
}
