#!/usr/bin/env bash
# Prepara a instância do WhatsApp do cérebro na SUA Evolution (evo.appegi.com.br):
# cria a instância se não existir, aponta o webhook pro n8n e ajusta as configurações. Pode rodar quantas vezes quiser.
# Uso: EVO_KEY=suaApiKey bash configurar.sh [EVO_URL] [INSTANCIA] [N8N_URL]
#  ex: EVO_KEY=xxx bash configurar.sh https://evo.appegi.com.br cerebro https://n8n.appegi.com.br
set -euo pipefail
EVO_URL="${1:-https://evo.appegi.com.br}"; INST="${2:-cerebro}"; N8N="${3:-https://n8n.appegi.com.br}"
: "${EVO_KEY:?Exporte EVO_KEY (apikey global da Evolution)}"
EVO_URL="${EVO_URL%/}"; N8N="${N8N%/}"
evo() { curl -fsS -H "apikey: $EVO_KEY" -H 'Content-Type: application/json' "$@"; }

if evo "$EVO_URL/instance/fetchInstances" | jq -e --arg i "$INST" '.[] | select(.name==$i)' >/dev/null 2>&1; then
  echo "✓ instância \"$INST\" já existe"
else
  evo -X POST "$EVO_URL/instance/create" -d "{\"instanceName\":\"$INST\",\"integration\":\"WHATSAPP-BAILEYS\",\"qrcode\":true}" >/dev/null
  echo "✓ instância \"$INST\" criada"
fi

evo -X POST "$EVO_URL/webhook/set/$INST" -d "{\"webhook\":{\"enabled\":true,\"url\":\"$N8N/webhook/core-os-whatsapp\",\"byEvents\":false,\"base64\":false,\"events\":[\"MESSAGES_UPSERT\"]}}" >/dev/null
echo "✓ webhook → $N8N/webhook/core-os-whatsapp (MESSAGES_UPSERT)"

evo -X POST "$EVO_URL/settings/set/$INST" -d '{"rejectCall":false,"msgCall":"","groupsIgnore":true,"alwaysOnline":false,"readMessages":false,"readStatus":false,"syncFullHistory":false}' >/dev/null
echo "✓ configurações (grupos ignorados, sem histórico completo)"

ESTADO=$(evo "$EVO_URL/instance/connectionState/$INST" | jq -r '.instance.state // .state // empty')
if [ "$ESTADO" = "open" ]; then
  echo "✓ WhatsApp conectado"
else
  echo "! WhatsApp ainda não conectado. Leia o QR no painel do cérebro (Configurações > WhatsApp) ou no manager da Evolution ($EVO_URL/manager)."
fi
