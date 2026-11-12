#!/usr/bin/env bash
# EGI Brand · sobe a plataforma dentro do container.
# 1) confere as variáveis obrigatórias da plataforma;
# 2) prepara /data (empresas: 0711, só atravessa; plataforma: 0700);
# 3) espera o Postgres responder (o compose sobe os dois juntos);
# 4) roda o servidor como root: ele migra o banco, cria o admin EGI, recria os usuários Unix das empresas
#    (o /etc/passwd não sobrevive à recriação do container) e abre cada agente com o usuário da empresa.
set -euo pipefail
log() { printf '\033[1;36m[egi-brand]\033[0m %s\n' "$*"; }

: "${DATABASE_URL:?Defina DATABASE_URL (Postgres dedicado do EGI Brand).}"
: "${EGI_MASTER_KEY:?Defina EGI_MASTER_KEY (openssl rand -hex 32). Guarde num cofre: sem ela as variáveis das empresas não decifram.}"
: "${EGI_PUBLIC_URL:?Defina EGI_PUBLIC_URL (ex.: https://brand.appegi.com.br).}"

mkdir -p /data/empresas /data/plataforma
chmod 711 /data/empresas
chmod 700 /data/plataforma

# espera o banco (até 60 s) pra não morrer na primeira subida do compose
for i in $(seq 1 30); do
  node -e "const u=new URL(process.env.DATABASE_URL);require('net').connect(u.port||5432,u.hostname).on('connect',()=>process.exit(0)).on('error',()=>process.exit(1))" 2>/dev/null && break
  log "esperando o Postgres ($i/30)..."; sleep 2
done

cd /opt/core-os/painel
export HOME=/root
log "subindo o EGI Brand na porta ${EGI_PORT:-3000}"
exec node server.js
