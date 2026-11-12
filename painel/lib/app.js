// EGI Brand · monta a plataforma inteira: serviços, rotas (admin, cliente, webhooks), websocket e rotinas.
// Tudo injetável (banco, fetch), então os testes sobem a plataforma real com PGlite e APIs de mentira.
import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';
import { criarAsaas } from './asaas.js';
import { criarAuth } from './auth.js';
import { criarAvisos } from './avisos.js';
import { criarNucleoCanais } from './canais/nucleo.js';
import { criarPonte } from './canais/ponte.js';
import { criarRegistroCanais } from './canais/registro.js';
import { criarTelegram } from './canais/telegram.js';
import { criarWhatsapp } from './canais/whatsapp.js';
import { criarCobranca } from './cobranca.js';
import { criarCofre } from './cripto.js';
import { criarServicoEmpresas, STATUS_USO } from './empresas.js';
import { criarMarca } from './marca.js';
import { criarRuntime } from './runtime.js';
import { rotasAdmin } from './rotas/admin.js';
import { rotasCliente } from './rotas/cliente.js';
import { rotasHooks } from './rotas/hooks.js';
import { arquivosDe } from './arquivos.js';

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const PUBLICO = path.join(AQUI, '..', 'public');

export function criarPlataforma({ cfg, db, fetch: f = fetch, log = console.log }) {
  const cofre = criarCofre(cfg.chaveMestra);
  const empresas = criarServicoEmpresas({ db, cfg, cofre, log });
  const auth = criarAuth({ db, cfg, log });
  const runtime = criarRuntime({ cfg, empresas, log });
  const registro = criarRegistroCanais({ db, cofre });
  const asaas = criarAsaas({ chave: cfg.asaas.chave, ambiente: cfg.asaas.ambiente, fetch: f });

  // a cobrança precisa do núcleo (situação no bloqueio) e o núcleo da cobrança: liga pelos objetos
  const s = { cfg, db, cofre, empresas, auth, runtime, registro, asaas, log };
  s.nucleo = criarNucleoCanais({ runtime, empresas, cobranca: { situacao: (id) => s.cobranca.situacao(id) }, log });
  s.whatsapp = criarWhatsapp({ cfg, registro, empresas, nucleo: s.nucleo, fetch: f, log });
  s.telegram = criarTelegram({ cfg, db, registro, empresas, nucleo: s.nucleo, fetch: f, log });
  s.ponte = criarPonte({ registro, empresas, nucleo: s.nucleo, fetch: f, log });
  s.avisos = criarAvisos({ db, cfg, log, enviadores: { whatsapp: (e, n, t) => s.whatsapp.enviarAviso(e, n, t), telegram: (e, t) => s.telegram.enviarAviso(e, t) } });
  s.cobranca = criarCobranca({
    db, cfg, asaas, empresas, avisos: s.avisos, log,
    // suspensa, cancelada ou de volta a aguardar: derruba os agentes que estiverem rodando
    aoMudarStatus: async (e, de, para) => { if (!STATUS_USO.has(para)) runtime.encerrar(e.id); log(`[empresa] ${e.slug}: ${de} -> ${para}`); },
  });
  s.marca = criarMarca({ db, empresas, log });
  // o que os agentes da empresa enxergam além das variáveis dela: a instância de WhatsApp e o bot do Telegram DELA
  runtime.definirExtrasEnv(async (e) => ({ ...(await s.whatsapp.variaveisDaEmpresa(e).catch(() => ({}))), ...(await s.telegram.variaveisDaEmpresa(e).catch(() => ({}))) }));

  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 1); // atrás do Traefik do Coolify
  app.use((req, res, next) => {
    res.set({ 'X-Frame-Options': 'DENY', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer' });
    next();
  });
  app.use(express.json({ limit: '2mb' }));
  app.get('/saude', (req, res) => res.json({ ok: true }));

  app.use(rotasHooks(s));
  app.use(rotasAdmin(s));
  app.use(rotasCliente(s));

  // estáticos: painel do cliente em /, painel EGI em /admin
  const vendor = (p) => path.join(AQUI, '..', 'node_modules', p);
  app.use('/vendor/xterm', express.static(vendor('@xterm/xterm')));
  app.use('/vendor/xterm-fit', express.static(vendor('@xterm/addon-fit')));
  app.use('/vendor/marked', express.static(vendor('marked')));
  app.use('/vendor/xterm-unicode', express.static(vendor('@xterm/addon-unicode11')));
  app.get(['/admin', '/admin/'], (req, res) => res.sendFile('admin/index.html', { root: PUBLICO }));
  app.use(express.static(PUBLICO, { setHeaders: (res, arq) => { if (/(sw\.js|manifest\.webmanifest)$/.test(arq)) res.set('Cache-Control', 'no-cache'); } }));

  // erros: status do erro (400, 404...) ou 500 sem vazar detalhe interno
  app.use((err, req, res, next) => { // eslint-disable-line no-unused-vars
    const status = err.status || (err.type === 'entity.parse.failed' ? 400 : 500);
    if (status >= 500) log(`[erro] ${req.method} ${req.path}: ${err.stack || err.message}`);
    res.status(status).json({ erro: status >= 500 ? 'Erro interno. Tente de novo.' : err.message });
  });

  // terminal real no navegador: /ws?conversa=<id>, só pra quem está logado na empresa dona da conversa
  function anexarWebsocket(servidor) {
    const wss = new WebSocketServer({ noServer: true });
    servidor.on('upgrade', async (req, socket, head) => {
      try {
        const url = new URL(req.url, 'http://x');
        const origemOk = !req.headers.origin || new URL(req.headers.origin).host === req.headers.host;
        const sessao = await auth.sessao(req);
        const empresa = sessao?.empresaId ? await empresas.buscar(sessao.empresaId) : null;
        if (url.pathname !== '/ws' || !origemOk || !empresa || !STATUS_USO.has(empresa.status)) { socket.destroy(); return; }
        const cerebro = runtime.de(empresa);
        const conv = cerebro.conversa(url.searchParams.get('conversa'));
        if (!conv) { socket.destroy(); return; }
        const cols = Math.min(Number(url.searchParams.get('cols')) || 120, 400);
        const rows = Math.min(Number(url.searchParams.get('rows')) || 32, 200);
        const vivo = await cerebro.iniciarTerminal(conv, cols, rows);
        wss.handleUpgrade(req, socket, head, (ws) => {
          vivo.clientes.add(ws);
          if (vivo.buffer) ws.send(vivo.buffer);
          ws.on('message', (raw) => {
            let m; try { m = JSON.parse(raw); } catch { return; }
            const v = cerebro.vivos.get(conv.id);
            if (!v) return;
            if (m.t === 'i') v.proc.write(m.d);
            if (m.t === 'r' && m.cols > 0 && m.rows > 0) v.proc.resize(Math.min(m.cols, 400), Math.min(m.rows, 200));
          });
          ws.on('close', () => vivo.clientes.delete(ws));
        });
      } catch (e) { log(`[ws] ${e.message}`); socket.destroy(); }
    });
    return wss;
  }

  // rotinas: mídias e Codex a cada poucos segundos (só das empresas com painel aberto), cobrança a cada hora
  const timers = [];
  function iniciarRotinas() {
    timers.push(setInterval(() => { for (const c of runtime.todos()) { try { c.vigiarMidias(arquivosDe); } catch { /* */ } } }, 3000));
    timers.push(setInterval(() => { for (const c of runtime.todos()) { try { c.vincularCodex(); } catch { /* */ } } }, 4000));
    const cobrar = () => s.cobranca.rotina().then((n) => n && log(`[cobrança] rotina: ${n} empresa(s) reavaliada(s)`)).catch((e) => log(`[cobrança] rotina falhou: ${e.message}`));
    timers.push(setTimeout(cobrar, 15_000));
    timers.push(setInterval(cobrar, 3600_000));
    timers.push(setInterval(() => auth.limpar().catch(() => {}), 6 * 3600_000));
  }
  const pararRotinas = () => { for (const t of timers) { clearInterval(t); clearTimeout(t); } };

  return { app, servicos: s, anexarWebsocket, iniciarRotinas, pararRotinas };
}
