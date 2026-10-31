#!/usr/bin/env bash
# WhatsApp do cérebro pela Evolution API local (mão dupla: lê conversas e envia pra qualquer pessoa).
# Uso:
#   whatsapp.sh conversas [N]              últimas N conversas (padrão 20)
#   whatsapp.sh ler <numero|nome> [N]      últimas N mensagens de uma conversa (padrão 20)
#   whatsapp.sh contato <nome>             acha o número de um contato pelo nome
#   whatsapp.sh text "msg" [destino]       destino = número (55+DDD+número) ou JID; vazio = o dono
#   whatsapp.sh image|doc <arquivo> "legenda" [destino]
#   whatsapp.sh audio <arquivo> [destino]
#   whatsapp.sh status | eu
set -euo pipefail
ENV=/opt/core-os/.env; [ -f "$ENV" ] && set -a && . "$ENV" && set +a
: "${EVO_URL:?EVO_URL faltando em $ENV}" "${EVO_KEY:?}" "${EVO_INSTANCE:?}"
export TZ=${TZ:-America/Sao_Paulo}
cmd=${1:-}; shift || true

api(){ curl -sS --max-time 300 -X POST "$EVO_URL/$1/$EVO_INSTANCE" -H "apikey: $EVO_KEY" -H "Content-Type: application/json" --data-binary @"$2"; }
api_json(){ local tmp; tmp=$(mktemp); printf '%s' "$2" >"$tmp"; api "$1" "$tmp"; rm -f "$tmp"; }
so_digitos(){ printf '%s' "$1" | tr -cd '0-9'; }

# o número de quem está conectado (o dono é sempre quem leu o QR)
eu(){
  local n
  n=$(curl -sS --max-time 20 "$EVO_URL/instance/fetchInstances?instanceName=$EVO_INSTANCE" -H "apikey: $EVO_KEY" \
    | jq -r --arg i "$EVO_INSTANCE" '[.[]? | select(.name==$i) | .ownerJid][0] // empty' | cut -d@ -f1)
  printf '%s' "$n"
}

# lista de conversas como JSON: [{jid, numero, nome, grupo, quando, ultima}]
lista_conversas(){
  local contatos
  contatos=$(api_json chat/findContacts '{}' | jq -c 'map({key: .remoteJid, value: (.pushName // "")}) | from_entries')
  api_json chat/findChats '{}' | jq -c --argjson c "$contatos" '
    map({
      jid: .remoteJid,
      numero: ((.lastMessage.key.remoteJidAlt // .remoteJid) | split("@")[0]),
      grupo: (.remoteJid | endswith("@g.us")),
      nome: ($c[.remoteJid] // (if (.lastMessage.key.fromMe | not) then .lastMessage.pushName else null end) // .name // ""),
      quando: ((.updatedAt // "") | if . == "" then "" else (sub("\\.[0-9]+Z$"; "Z") | fromdateiso8601 | strflocaltime("%Y-%m-%d %H:%M")) end),
      ultima: ((.lastMessage.message.conversation // .lastMessage.message.extendedTextMessage.text // .lastMessage.messageType // "") | tostring | gsub("\\s+"; " ") | .[0:80])
    }) | map(select(.jid != "status@broadcast"))
    | group_by(.numero) | map(sort_by(.quando) | reverse | .[0] + {jids: map(.jid), nome: (map(.nome) | map(select(. != "")) | .[0] // "")})'
}

# resolve número, JID ou nome pros JIDs de UMA pessoa (um por linha; sai com 2 se ambíguo)
resolver(){
  local alvo=$1 lista achados
  if [[ $alvo == *@* ]]; then printf '%s\n' "$alvo"; return; fi
  lista=$(lista_conversas)
  if [[ ! $alvo =~ [[:alpha:]] && ${#alvo} -ge 8 ]]; then
    achados=$(jq -c --arg d "$(so_digitos "$alvo")" '[.[] | select((.numero | endswith($d)) or any(.jids[]; split("@")[0] | endswith($d)))]' <<<"$lista")
  else
    achados=$(jq -c --arg n "$alvo" '[.[] | select(.nome | ascii_downcase | contains($n | ascii_downcase))]' <<<"$lista")
  fi
  case $(jq length <<<"$achados") in
    0) echo "Nenhuma conversa encontrada pra \"$alvo\"." >&2; exit 2;;
    1) jq -r '.[0].jids[]' <<<"$achados";;
    *) echo "Mais de uma pessoa bate com \"$alvo\". Escolha pelo número:" >&2
       jq -r '.[] | "  \(.nome) | \(.numero)\(if .grupo then " | grupo" else "" end)"' <<<"$achados" >&2; exit 2;;
  esac
}

# destino de envio: vazio = o dono (quem está falando com o cérebro pelo WhatsApp, o primeiro número autorizado
# nas Configurações do painel, ou o próprio número conectado). Número curto ganha @s.whatsapp.net pela Evolution.
destino(){ local d=${1:-}; [ -n "$d" ] && { printf '%s' "$d"; return; }; [ -n "${WHATS_PARA:-}" ] && { printf '%s' "$WHATS_PARA"; return; }; eu; }
# resposta pro próprio dono leva um caractere invisível: o fluxo do n8n ignora (sem loop no chat "Você")
marca(){ [ "$(so_digitos "$1")" = "$(eu)" ] && printf '⁣' || true; }

media(){ # tipo caminho legenda destino
  local tmp; tmp=$(mktemp); local f=$2 n; n=$(destino "${4:-}")
  if [[ $f == http* ]]; then jq -n --arg n "$n" --arg t "$1" --arg m "$f" --arg c "$3" --arg fn "$(basename "$f")" '{number:$n,mediatype:$t,media:$m,caption:$c,fileName:$fn}' >"$tmp"
  else base64 <"$f" | tr -d '\n' >"$tmp.b64"
    jq -n --arg n "$n" --arg t "$1" --rawfile m "$tmp.b64" --arg c "$3" --arg fn "$(basename "$f")" --arg mt "$(file -b --mime-type "$f")" '{number:$n,mediatype:$t,media:$m,caption:$c,fileName:$fn,mimetype:$mt}' >"$tmp"; rm -f "$tmp.b64"; fi
  api message/sendMedia "$tmp" | jq -r 'if .key then "enviado" else . end'; rm -f "$tmp"; }

case "$cmd" in
  conversas)
    lista_conversas | jq -r --argjson n "${1:-20}" 'sort_by(.quando) | reverse | .[0:$n][] |
      "\(.quando) | \(if .nome == "" then "(sem nome)" else .nome end) | \(.numero)\(if .grupo then " | grupo" else "" end) | \(.ultima)"';;
  ler)
    jids=$(resolver "${1:?diga o número ou o nome}")
    { while read -r j; do
        api_json chat/findMessages "$(jq -nc --arg j "$j" --argjson n "${2:-20}" '{where:{key:{remoteJid:$j}}, limit:$n}')" | jq -c '.messages.records[]?'
      done <<<"$jids"; } \
      | jq -rs --argjson n "${2:-20}" 'unique_by(.key.id) | sort_by(.messageTimestamp) | .[-$n:][] |
        "[\(.messageTimestamp | strflocaltime("%d/%m %H:%M"))] \(if .key.fromMe then "Você" else (.pushName // "Contato") end): \(.message.conversation // .message.extendedTextMessage.text // .message.imageMessage.caption // ("(" + .messageType + ")"))"';;
  contato)
    lista_conversas | jq -r --arg n "${1:?diga o nome}" '.[] | select(.nome | ascii_downcase | contains($n | ascii_downcase)) |
      "\(.nome) | \(.numero)\(if .grupo then " | grupo" else "" end)"';;
  text)
    n=$(destino "${2:-}")
    api_json message/sendText "$(jq -nc --arg n "$n" --arg t "$(marca "$n")$1" '{number:$n,text:$t}')" | jq -r 'if .key then "enviado" else . end';;
  image) media image "$1" "${2:-}" "${3:-}";;
  doc)   media document "$1" "${2:-}" "${3:-}";;
  audio) n=$(destino "${2:-}"); tmp=$(mktemp); base64 <"$1" | tr -d '\n' >"$tmp.b64"
         jq -n --arg n "$n" --rawfile a "$tmp.b64" '{number:$n,audio:$a}' >"$tmp"; api message/sendWhatsAppAudio "$tmp" | jq -r 'if .key then "enviado" else . end'; rm -f "$tmp" "$tmp.b64";;
  status) curl -sS "$EVO_URL/instance/connectionState/$EVO_INSTANCE" -H "apikey: $EVO_KEY"; echo;;
  eu) eu; echo;;
  *) sed -n '2,10p' "$0"; exit 1;;
esac
