#!/usr/bin/env bash
# Core OS · EGI — sobe o painel dentro do container.
# 1) monta /opt/core-os/.env a partir das variáveis do Coolify (as skills do cérebro leem esse arquivo);
# 2) copia o cérebro modelo pro volume na primeira vez (depois nunca mais mexe);
# 3) avisa se o Claude Code ainda não está logado;
# 4) roda o painel como usuário coreos.
set -euo pipefail

BASE=/opt/core-os
ENV_FILE=$BASE/.env
VAULT=${CORE_OS_VAULT:-/data/cerebro}
DADOS=${CORE_OS_DATA:-/data/dados}
CASA=/home/coreos

log() { printf '\033[1;34m[core-os]\033[0m %s\n' "$*"; }

# volumes do Coolify nascem como root: devolve pro coreos
mkdir -p "$DADOS" "$(dirname "$VAULT")" "$CASA/.claude"
chown -R coreos:coreos /data "$CASA/.claude" 2>/dev/null || true

# --- 1. .env que o painel e as skills leem --------------------------------------
: "${CORE_OS_PASSWORD:?Defina CORE_OS_PASSWORD no Coolify (senha do painel).}"
: "${CORE_OS_HOOK_TOKEN:?Defina CORE_OS_HOOK_TOKEN no Coolify (token que o n8n usa pra falar com o painel).}"
: "${EVO_URL:=https://evo.appegi.com.br}"
: "${EVO_KEY:?Defina EVO_KEY no Coolify (apikey global da Evolution).}"
: "${EVO_INSTANCE:=cerebro}"
: "${N8N_URL:=https://n8n.appegi.com.br}"
: "${CORE_OS_PUBLIC_URL:=}"
: "${GCHAT_PERMITIDOS:=}"
: "${WHATS_DONO:=}"
: "${ANTHROPIC_API_KEY:=}"

umask 027
{
  echo "# gerado pelo entrypoint a partir das variáveis do Coolify. Não editar à mão: edite no Coolify."
  echo "CORE_OS_PORT=${CORE_OS_PORT:-3000}"
  echo "CORE_OS_HOST=${CORE_OS_HOST:-0.0.0.0}"
  echo "CORE_OS_VAULT=$VAULT"
  echo "CORE_OS_DATA=$DADOS"
  echo "CORE_OS_PASSWORD=$CORE_OS_PASSWORD"
  echo "CORE_OS_HOOK_TOKEN=$CORE_OS_HOOK_TOKEN"
  echo "CORE_OS_PUBLIC_URL=$CORE_OS_PUBLIC_URL"
  echo "CLAUDE_BIN=${CLAUDE_BIN:-$CASA/.local/bin/claude}"
  echo "EVO_URL=${EVO_URL%/}"
  echo "EVO_KEY=$EVO_KEY"
  echo "EVO_INSTANCE=$EVO_INSTANCE"
  echo "N8N_URL=${N8N_URL%/}"
  echo "GCHAT_PERMITIDOS=$GCHAT_PERMITIDOS"
  [ -n "$WHATS_DONO" ] && echo "WHATS_DONO=$(echo "$WHATS_DONO" | tr -cd '0-9')"
  [ -n "$ANTHROPIC_API_KEY" ] && echo "ANTHROPIC_API_KEY=$ANTHROPIC_API_KEY"
  echo "TZ=${TZ:-America/Sao_Paulo}"
} >"$ENV_FILE"
chown root:coreos "$ENV_FILE"; chmod 640 "$ENV_FILE"
log ".env montado em $ENV_FILE"

# --- 2. cérebro no volume -------------------------------------------------------
if [ ! -f "$VAULT/CLAUDE.md" ]; then
  log "primeira subida: criando o cérebro em $VAULT"
  mkdir -p "$VAULT"
  cp -a "$BASE/cerebro-modelo/." "$VAULT/"
  NOME_ESC=$(printf '%s' "${CORE_OS_NOME:-Iuri}" | sed 's/[&|]/\\&/g')
  grep -rl '{{NOME}}' "$VAULT" | xargs -r sed -i "s|{{NOME}}|$NOME_ESC|g"
  chown -R coreos:coreos "$VAULT"
else
  log "cérebro já existe em $VAULT, mantido"
  # skills novas do modelo que ainda não existem no cérebro entram (nunca sobrescreve o que já tem)
  for d in "$BASE"/cerebro-modelo/.claude/skills/* "$BASE"/cerebro-modelo/.claude/agents/*; do
    [ -e "$d" ] || continue
    rel=${d#"$BASE"/cerebro-modelo/}
    [ -e "$VAULT/$rel" ] || { mkdir -p "$(dirname "$VAULT/$rel")"; cp -a "$d" "$VAULT/$rel"; log "adicionado $rel"; }
  done
  chown -R coreos:coreos "$VAULT"
fi
find "$VAULT/.claude/skills" -path '*/motor/*' -type f \( -name '*.sh' -o -name '*.py' \) -exec chmod +x {} + 2>/dev/null || true

# --- 3. acesso por canal (Google Chat etc.) -------------------------------------
if [ ! -f "$DADOS/canais-acesso.json" ] && [ -n "$GCHAT_PERMITIDOS" ]; then
  python3 - "$GCHAT_PERMITIDOS" >"$DADOS/canais-acesso.json" <<'PY'
import json, sys
itens = [x.strip() for x in sys.argv[1].split(',') if x.strip()]
print(json.dumps({"gchat": {"permitidos": itens}}, indent=2, ensure_ascii=False))
PY
  chown coreos:coreos "$DADOS/canais-acesso.json"
  log "canais-acesso.json criado com GCHAT_PERMITIDOS"
fi

# --- 4. Claude Code logado? -----------------------------------------------------
if [ -z "$ANTHROPIC_API_KEY" ] && [ ! -s "$CASA/.claude/.credentials.json" ] && ! ls "$CASA"/.claude/*.json >/dev/null 2>&1; then
  log "AVISO: Claude Code ainda não está logado neste container."
  log "       No Coolify > Terminal do container (ou docker exec -it <container> bash) rode:"
  log "         gosu coreos claude        e depois /login, siga o link e cole o código."
  log "       Ou defina ANTHROPIC_API_KEY no Coolify. O login fica salvo no volume /home/coreos/.claude."
fi

# --- 5. painel ------------------------------------------------------------------
cd "$BASE/painel"
export HOME=$CASA CORE_OS_ENV=$ENV_FILE PATH=$CASA/.local/bin:$PATH
log "subindo o painel na porta ${CORE_OS_PORT:-3000}"
exec gosu coreos node server.js
