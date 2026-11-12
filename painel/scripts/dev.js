// EGI Brand · roda a plataforma no localhost (pnpm dev). Sem Postgres: banco PGlite em painel/.dev/.
// Na primeira vez cria painel/.env.local (fora do Git) com chave mestra e admin de teste; depois só lê.
// Pra testar cobrança de verdade, coloque a chave SANDBOX do Asaas em ASAAS_API_KEY no .env.local.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const PAINEL = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const arq = path.join(PAINEL, '.env.local');
process.chdir(PAINEL);

if (!fs.existsSync(arq)) {
  const senha = `${crypto.randomBytes(6).toString('hex')}Egi9`;
  fs.writeFileSync(arq, [
    '# EGI Brand local (gerado pelo pnpm dev). Não vai pro Git.',
    'DATABASE_URL=pglite:./.dev/banco',
    `EGI_MASTER_KEY=${crypto.randomBytes(32).toString('hex')}`,
    'EGI_PUBLIC_URL=http://localhost:3000',
    'EGI_HOST=127.0.0.1',
    'EGI_PORT=3000',
    'EGI_ADMIN_EMAIL=admin@egi.local',
    `EGI_ADMIN_SENHA=${senha}`,
    'EGI_EMPRESAS_DIR=./.dev/empresas',
    'EGI_PLATAFORMA_DIR=./.dev/plataforma',
    'EGI_MODELO_CEREBRO=../cerebro',
    '# Opcional: cobrança no sandbox do Asaas (webhook não chega no localhost; use "Sincronizar com o Asaas" no admin)',
    'ASAAS_API_KEY=',
    'ASAAS_AMBIENTE=sandbox',
    'ASAAS_WEBHOOK_TOKEN=',
    '# Opcional: WhatsApp pela Evolution da EGI',
    'EVO_URL=',
    'EVO_KEY=',
    'GROQ_API_KEY=',
    '',
  ].join('\n'), { mode: 0o600 });
  console.log(`\n  Criei ${arq} com o admin de teste (EGI_ADMIN_EMAIL / EGI_ADMIN_SENHA). Abra o arquivo pra ver a senha.\n`);
}

// os agentes (claude, codex, agy) são achados no PATH deste terminal
process.env.EGI_PATH_AGENTES ||= process.env.PATH;
process.env.EGI_ENV_FILE = arq;
fs.mkdirSync(path.join(PAINEL, '.dev'), { recursive: true });
console.log('  EGI Brand local: cliente em http://localhost:3000 · admin em http://localhost:3000/admin\n');
await import('../server.js');
