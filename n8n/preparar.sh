#!/usr/bin/env bash
# Preenche os fluxos do n8n com as suas URLs e o token, e gera a pasta n8n/pronto/ pra importar.
# Uso: bash preparar.sh <PAINEL_URL> <N8N_URL> <HOOK_TOKEN>
#  ex: bash preparar.sh https://cerebro.appegi.com.br https://n8n.appegi.com.br a1b2c3...
# Depois, no n8n: Workflows > Import from File (ou cole o JSON em "Import from URL/clipboard"), salve e ATIVE cada um.
set -euo pipefail
AQUI="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PAINEL="${1:?PAINEL_URL (ex. https://cerebro.appegi.com.br)}"; N8N="${2:?N8N_URL (ex. https://n8n.appegi.com.br)}"; TOKEN="${3:?HOOK_TOKEN (o mesmo CORE_OS_HOOK_TOKEN do Coolify)}"
PAINEL="${PAINEL%/}"; N8N="${N8N%/}"
mkdir -p "$AQUI/pronto"
for f in core-os-whatsapp core-os-gchat-entrada core-os-gchat-resposta; do
  sed -e "s|{{PAINEL_URL}}|$PAINEL|g" -e "s|{{N8N_URL}}|$N8N|g" -e "s|{{HOOK_TOKEN}}|$TOKEN|g" "$AQUI/$f.json" >"$AQUI/pronto/$f.json"
  python3 -c "import json,sys; json.load(open(sys.argv[1]))" "$AQUI/pronto/$f.json"
  echo "✓ pronto/$f.json"
done
cat <<FIM

Importe os 3 arquivos de $AQUI/pronto/ no n8n ($N8N) e ative.
Webhooks que o n8n vai expor:
  WhatsApp (Evolution chama):      $N8N/webhook/core-os-whatsapp
  Google Chat (app do Chat chama): $N8N/webhook/core-os-gchat
  Resposta (o painel chama):       $N8N/webhook/core-os-gchat-resposta
Nunca suba a pasta pronto/ pro Git (tem o token).
FIM
# Áudio no WhatsApp: o fluxo usa 2 credenciais "Header Auth" no n8n: "Evolution EGI (apikey)" (header apikey) e "Groq (Whisper)" (header Authorization: Bearer ...).
# Crie as duas no n8n antes de importar e, se quiser, passe os ids em CRED_EVOLUTION_ID / CRED_GROQ_ID; senão, selecione na mão nos nós "Baixa áudio" e "Transcreve".
