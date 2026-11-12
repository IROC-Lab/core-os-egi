// EGI Brand (por EGI Group) · plataforma multi-tenant do segundo cérebro.
// Um deploy atende todas as empresas: cada uma com cérebro, logins de IA (Claude Code, Codex, Antigravity),
// variáveis, WhatsApp, Telegram e marca próprios, isolada por usuário Unix. Cobrança recorrente pelo Asaas.
import { createServer } from 'node:http';
import fs from 'node:fs';
import { criarPlataforma } from './lib/app.js';
import { carregarArquivoEnv, lerConfig } from './lib/config.js';
import { conectar, migrar } from './lib/db.js';

carregarArquivoEnv(process.env.EGI_ENV_FILE || '/opt/core-os/.env');
const cfg = lerConfig();

const faltando = [['DATABASE_URL', cfg.bancoUrl], ['EGI_MASTER_KEY', cfg.chaveMestra], ['EGI_PUBLIC_URL', cfg.urlPublica]].filter(([, v]) => !v).map(([k]) => k);
if (faltando.length) {
  console.error(`\n  Faltam variáveis da plataforma: ${faltando.join(', ')}. Veja .env.example.\n`);
  process.exit(1);
}
if (!cfg.asaas.chave) console.log('[asaas] AVISO: ASAAS_API_KEY vazia. Dá pra cadastrar empresas, mas nenhuma cobrança sai.');
if (cfg.asaas.chave && !cfg.asaas.tokenWebhook) console.log('[asaas] AVISO: ASAAS_WEBHOOK_TOKEN vazio: todo webhook do Asaas será recusado.');

fs.mkdirSync(cfg.pastaEmpresas, { recursive: true, mode: 0o711 });
fs.mkdirSync(cfg.pastaPlataforma, { recursive: true, mode: 0o700 });

const db = await conectar(cfg.bancoUrl);
await migrar(db);
const plataforma = criarPlataforma({ cfg, db });
const { auth, empresas } = plataforma.servicos;
await auth.bootstrap();
await empresas.garantirTodos();

const servidor = createServer(plataforma.app);
plataforma.anexarWebsocket(servidor);
plataforma.iniciarRotinas();
servidor.listen(cfg.porta, cfg.host, () => {
  console.log(`EGI Brand no ar em http://${cfg.host}:${cfg.porta}  ·  público: ${cfg.urlPublica}  ·  empresas em ${cfg.pastaEmpresas}  ·  Asaas: ${cfg.asaas.chave ? cfg.asaas.ambiente : 'desligado'}`);
});

const desligar = async () => { plataforma.pararRotinas(); servidor.close(); await db.fechar().catch(() => {}); process.exit(0); };
process.on('SIGTERM', desligar);
process.on('SIGINT', desligar);
