#!/usr/bin/env bash
# EGI Brand · gera os fluxos do Google Chat (via n8n) de UMA empresa, apontando pra ponte dela.
# WhatsApp e Telegram NÃO usam n8n: a plataforma recebe direto (instância e bot da empresa).
#
# Uso: bash preparar.sh <EGI_PUBLIC_URL> <N8N_URL> <EMPRESA_ID> <SLUG> <TOKEN_DA_PONTE>
#  O EMPRESA_ID, a URL e o token aparecem no painel da empresa: Configurações › Outros canais (n8n) › Ligar.
#  ex: bash preparar.sh https://brand.appegi.com.br https://n8n.appegi.com.br 3f1c...-... padaria-sao-joao a1b2c3...
# Cada empresa ganha webhooks próprios no n8n (/webhook/egi-<slug>-gchat e /webhook/egi-<slug>-gchat-resposta).
set -euo pipefail
AQUI="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PAINEL="${1:?EGI_PUBLIC_URL}"; N8N="${2:?N8N_URL}"; EMPRESA="${3:?EMPRESA_ID}"; SLUG="${4:?SLUG da empresa}"; TOKEN="${5:?TOKEN da ponte}"
PAINEL="${PAINEL%/}"; N8N="${N8N%/}"
[[ "$EMPRESA" =~ ^[0-9a-f-]{36}$ ]] || { echo "EMPRESA_ID inválido"; exit 1; }
[[ "$SLUG" =~ ^[a-z0-9-]+$ ]] || { echo "SLUG inválido"; exit 1; }
mkdir -p "$AQUI/pronto/$SLUG"
for f in core-os-gchat-entrada core-os-gchat-resposta; do
  sed -e "s|{{PAINEL_URL}}/api/ponte/canal|$PAINEL/hooks/ponte/$EMPRESA|g" \
      -e "s|{{PAINEL_URL}}|$PAINEL|g" -e "s|{{N8N_URL}}|$N8N|g" -e "s|{{HOOK_TOKEN}}|$TOKEN|g" \
      -e "s|core-os-gchat|egi-$SLUG-gchat|g" -e "s|Core OS · |EGI Brand · $SLUG · |g" \
      "$AQUI/$f.json" >"$AQUI/pronto/$SLUG/$f.json"
  python3 -c "import json,sys; json.load(open(sys.argv[1]))" "$AQUI/pronto/$SLUG/$f.json"
  echo "✓ pronto/$SLUG/$f.json"
done
cat <<FIM

Importe os 2 arquivos de $AQUI/pronto/$SLUG/ no n8n ($N8N) e ative.
  Google Chat (app do Chat chama): $N8N/webhook/egi-$SLUG-gchat
  Resposta (o EGI Brand chama):    $N8N/webhook/egi-$SLUG-gchat-resposta
No painel da empresa, em "Outros canais", autorize quem pode falar (e-mail ou @dominio).
Nunca suba a pasta pronto/ pro Git (tem o token).
FIM
