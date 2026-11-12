#!/usr/bin/env bash
# Operação do canal da Evolution na VM da homologação (SCRUM-275). Roda em /opt/lumens, depois
# de um deploy com CANAL_WHATSAPP=evolution. Fala com a Evolution pelo loopback (127.0.0.1:8081), que
# é a única porta dela fora do compose.
#
#   ./scripts/evolution.sh criar               cria a instância com o webhook do back-end
#   ./scripts/evolution.sh parear <numero>     código de 8 letras para parear sem QR
#   ./scripts/evolution.sh estado              open | connecting | close
#   ./scripts/evolution.sh webhook             reaplica o webhook (depois de trocar o segredo)
#   ./scripts/evolution.sh desvincular         tira o chip atual (troca de chip)
#
# Passo a passo e troca de chip: docs/operacao/evolution.md
set -Eeuo pipefail

REPO_DIR=${REPO_DIR:-/opt/lumens}
API=${EVOLUTION_LOCAL:-http://127.0.0.1:8081}
cd "$REPO_DIR"

# Lê uma variável do .env.producao sem `source`: o arquivo tem valores que o shell interpretaria.
valor() {
  grep -E "^[[:space:]]*$1=" .env.producao | tail -n 1 | cut -d= -f2- | tr -d '\r'
}

CHAVE=$(valor EVOLUTION_API_KEY)
SEGREDO=$(valor EVOLUTION_WEBHOOK_SEGREDO)
INSTANCIA=$(valor EVOLUTION_INSTANCIA)
INSTANCIA=${INSTANCIA:-lumens}
if [[ -z "$CHAVE" || -z "$SEGREDO" ]]; then
  echo "erro: preencha EVOLUTION_API_KEY e EVOLUTION_WEBHOOK_SEGREDO no .env.producao" >&2
  exit 1
fi

chamar() {
  local metodo=$1 caminho=$2 corpo=${3:-}
  if [[ -n "$corpo" ]]; then
    curl -fsS -X "$metodo" "$API$caminho" -H "apikey: $CHAVE" -H 'content-type: application/json' -d "$corpo"
  else
    curl -fsS -X "$metodo" "$API$caminho" -H "apikey: $CHAVE"
  fi
  echo
}

# O back-end recebe pela rede interna; a rota é fechada no Caddy para a internet.
WEBHOOK=$(printf '{"enabled":true,"url":"http://backend:3000/webhook/evolution","byEvents":false,"base64":false,"headers":{"Authorization":"Bearer %s"},"events":["MESSAGES_UPSERT","MESSAGES_UPDATE","CONNECTION_UPDATE"]}' "$SEGREDO")

case "${1:-}" in
  criar)
    # Sem grupos, sem marcar como lida, sem histórico antigo do chip, sem recusar chamada.
    chamar POST /instance/create "$(printf '{"instanceName":"%s","integration":"WHATSAPP-BAILEYS","qrcode":false,"groupsIgnore":true,"alwaysOnline":false,"readMessages":false,"readStatus":false,"syncFullHistory":false,"rejectCall":false,"webhook":%s}' "$INSTANCIA" "$WEBHOOK")"
    ;;
  parear)
    numero=${2:-}
    if [[ ! "$numero" =~ ^[0-9]{12,13}$ ]]; then
      echo "uso: $0 parear <numero do chip com DDI e DDD, só dígitos, ex.: 5582999990000>" >&2
      exit 1
    fi
    echo "No celular do chip: WhatsApp → Aparelhos conectados → Conectar um aparelho →"
    echo "\"Conectar com número de telefone\", e digite o pairingCode abaixo."
    chamar GET "/instance/connect/$INSTANCIA?number=$numero"
    ;;
  estado)
    chamar GET "/instance/connectionState/$INSTANCIA"
    ;;
  webhook)
    chamar POST "/webhook/set/$INSTANCIA" "{\"webhook\":$WEBHOOK}"
    ;;
  desvincular)
    chamar DELETE "/instance/logout/$INSTANCIA"
    ;;
  *)
    sed -n '2,12p' "$0" | sed 's/^# \{0,1\}//'
    exit 1
    ;;
esac
