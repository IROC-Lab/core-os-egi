// EGI Brand · configuração da plataforma (variáveis do Coolify). Estas variáveis são da PLATAFORMA e nunca chegam
// aos agentes das empresas: cada empresa tem as suas em `variaveis_ambiente` (cifradas no banco).
import fs from 'node:fs';
import path from 'node:path';

export function carregarArquivoEnv(arquivo) {
  try {
    for (const linha of fs.readFileSync(arquivo, 'utf8').split('\n')) {
      const m = linha.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
      if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/\s+#.*$/, '').replace(/^['"]|['"]$/g, '');
    }
  } catch { /* sem arquivo: segue com o ambiente */ }
}

const num = (v, padrao) => (Number.isFinite(Number(v)) && String(v ?? '').trim() !== '' ? Number(v) : padrao);
const semBarra = (u) => String(u || '').replace(/\/+$/, '');

export function lerConfig(env = process.env) {
  const base = env.EGI_DADOS || '/data';
  return {
    porta: num(env.EGI_PORT ?? env.CORE_OS_PORT, 3000),
    host: env.EGI_HOST || env.CORE_OS_HOST || '127.0.0.1',
    urlPublica: semBarra(env.EGI_PUBLIC_URL || env.CORE_OS_PUBLIC_URL),
    bancoUrl: env.DATABASE_URL || '',
    chaveMestra: env.EGI_MASTER_KEY || '',
    adminEmail: (env.EGI_ADMIN_EMAIL || '').trim().toLowerCase(),
    adminSenha: env.EGI_ADMIN_SENHA || '',
    pastaEmpresas: path.resolve(env.EGI_EMPRESAS_DIR || path.join(base, 'empresas')),
    pastaPlataforma: path.resolve(env.EGI_PLATAFORMA_DIR || path.join(base, 'plataforma')),
    modeloCerebro: path.resolve(env.EGI_MODELO_CEREBRO || '/opt/core-os/cerebro-modelo'),
    evolution: { url: semBarra(env.EVO_URL), chave: env.EVO_KEY || '' },
    groqChave: env.GROQ_API_KEY || '',
    asaas: {
      chave: env.ASAAS_API_KEY || '',
      ambiente: /^(prod|producao|production)$/i.test(env.ASAAS_AMBIENTE || '') ? 'producao' : 'sandbox',
      tokenWebhook: env.ASAAS_WEBHOOK_TOKEN || '',
    },
    cobranca: {
      diasSuspensao: num(env.EGI_DIAS_SUSPENSAO, 5),
      diasLembrete: num(env.EGI_DIAS_LEMBRETE, 3),
      setupVencimentoDias: num(env.EGI_SETUP_VENCIMENTO_DIAS, 0),
      fuso: env.TZ || 'America/Sao_Paulo',
    },
    avisos: {
      // número de WhatsApp da EGI que manda os avisos de cobrança (instância na Evolution). Vazio = usa o da empresa.
      evoInstancia: env.EGI_AVISOS_EVO_INSTANCIA || '',
      suporte: env.EGI_SUPORTE_CONTATO || '',
    },
    maxParalelo: num(env.EGI_MAX_PARALELO, 3),
    limiteMinutos: num(env.EGI_LIMITE_MINUTOS, 20),
    bins: {
      claude: env.CLAUDE_BIN || 'claude',
      codex: env.CODEX_BIN || 'codex',
      antigravity: env.AGY_BIN || 'agy',
    },
    // pasta com os executáveis (claude, agy, npm global) que os usuários das empresas podem rodar
    pathAgentes: env.EGI_PATH_AGENTES || '/home/coreos/.local/bin:/usr/local/bin:/usr/bin:/bin',
  };
}
