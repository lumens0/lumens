#!/usr/bin/env bash
# Operação do canal da Evolution na VM da homologação (SCRUM-275). Roda em /opt/lumens, depois
# de um deploy com CANAL_WHATSAPP=evolution. Fala com a Evolution pelo loopback (127.0.0.1:8081), que
# é a única porta dela fora do compose.
#
#   ./scripts/evolution.sh parear <numero>     (re)cria a instância com o número: código e QR
#   ./scripts/evolution.sh qr                  QR atual da instância, para quando o anterior expirou
#   ./scripts/evolution.sh estado              open | connecting | close, e o motivo da última queda
#   ./scripts/evolution.sh webhook             reaplica o webhook (depois de trocar o segredo)
#   ./scripts/evolution.sh desvincular         tira o chip atual (troca de chip)
#
# Passo a passo e troca de chip: docs/operacao/evolution.md
set -Eeuo pipefail

SCRIPT="$(cd "$(dirname "$0")" && pwd)/$(basename "$0")"
REPO_DIR=${REPO_DIR:-/opt/lumens}
API=${EVOLUTION_LOCAL:-http://127.0.0.1:8081}
# O QR vincula um aparelho ao chip enquanto vale: só o dono da VM lê o arquivo.
QR_PNG=${EVOLUTION_QR_PNG:-/tmp/evolution-qr.png}
cd "$REPO_DIR"

# Lê uma variável do .env.producao sem `source`: o arquivo tem valores que o shell interpretaria.
#
# Variável ausente vale vazio: com `set -e` e `pipefail`, o grep sem resultado encerraria o script
# antes do padrão (EVOLUTION_INSTANCIA é opcional, como no back-end). As obrigatórias são
# conferidas logo abaixo.
valor() {
  { grep -E "^[[:space:]]*$1=" .env.producao || true; } | tail -n 1 | cut -d= -f2- | tr -d '\r'
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
}

# Estado da instância, sem o token dela que a listagem também traz. Instância inexistente: "nenhuma".
estado() {
  local resposta http
  # Sem -f, com o status no fim: a instância inexistente volta 404, e só ela vale "nenhuma". Chave
  # errada (401) ou erro da Evolution não podem passar por ausência, ou o parear recriaria às cegas.
  resposta=$(curl -sS -w '\n%{http_code}' "$API/instance/fetchInstances?instanceName=$INSTANCIA" -H "apikey: $CHAVE" || true)
  http=${resposta##*$'\n'}
  resposta=${resposta%$'\n'*}
  case "$http" in
    200) ;;
    404)
      echo nenhuma
      return
      ;;
    000 | '')
      echo "erro: a Evolution não respondeu em $API; logo depois de ligar a VM, espere um minuto" >&2
      return 1
      ;;
    *)
      echo "erro: a Evolution respondeu HTTP $http ao consultar a instância $INSTANCIA (401: confira a EVOLUTION_API_KEY)" >&2
      return 1
      ;;
  esac
  python3 -c '
import json, sys
dados = json.load(sys.stdin)
if not isinstance(dados, list):
    sys.exit("erro: resposta inesperada da Evolution ao listar as instâncias")
if not dados:
    print("nenhuma")
    sys.exit()
i = dados[0]
print(i.get("connectionStatus") or "?")
if i.get("disconnectionReasonCode"):
    print("última queda: código %s em %s" % (i["disconnectionReasonCode"], i.get("disconnectionAt")), file=sys.stderr)
' <<<"$resposta"
}

# Mostra o código de 8 letras e salva o QR em $QR_PNG. A resposta da criação traz o token da
# instância e o webhook com o segredo, então ela nunca vai inteira para o terminal.
mostrar_pareamento() {
  (umask 077 && python3 -c '
import base64, json, sys
dados = json.load(sys.stdin)
qr = dados.get("qrcode", dados)
codigo, imagem = qr.get("pairingCode"), qr.get("base64") or ""
if codigo:
    print(f"pairingCode: {codigo}")
if imagem.startswith("data:image/png;base64,"):
    with open(sys.argv[1], "wb") as png:
        png.write(base64.b64decode(imagem.split(",", 1)[1]))
    print(f"QR salvo em {sys.argv[1]}")
if not codigo and not imagem:
    print("a Evolution não devolveu código nem QR; veja ./scripts/evolution.sh estado", file=sys.stderr)
    sys.exit(1)
' "$QR_PNG")
}

# O back-end recebe pela rede interna; a rota é fechada no Caddy para a internet.
WEBHOOK=$(printf '{"enabled":true,"url":"http://backend:3000/webhook/evolution","byEvents":false,"base64":false,"headers":{"Authorization":"Bearer %s"},"events":["MESSAGES_UPSERT","MESSAGES_UPDATE","CONNECTION_UPDATE"]}' "$SEGREDO")

case "${1:-}" in
  parear)
    # A Evolution só gera o código de 8 letras para a instância criada já com o número; o connect
    # com ?number= numa instância sem número devolve só o QR. Por isso parear recria a instância.
    numero=${2:-}
    if [[ ! "$numero" =~ ^[0-9]{12,13}$ ]]; then
      echo "uso: $0 parear <numero do chip como o WhatsApp o vê, só dígitos, ex.: 558299990000>" >&2
      exit 1
    fi
    atual=$(estado)
    if [[ "$atual" == open ]]; then
      echo "erro: a instância $INSTANCIA já está conectada; use desvincular antes de trocar o chip" >&2
      exit 1
    fi
    if [[ "$atual" != nenhuma ]]; then
      chamar DELETE "/instance/delete/$INSTANCIA" >/dev/null
    fi
    rm -f "$QR_PNG"
    # Sem grupos, sem marcar como lida, sem histórico antigo do chip, sem recusar chamada.
    chamar POST /instance/create "$(printf '{"instanceName":"%s","integration":"WHATSAPP-BAILEYS","number":"%s","qrcode":true,"groupsIgnore":true,"alwaysOnline":false,"readMessages":false,"readStatus":false,"syncFullHistory":false,"rejectCall":false,"webhook":%s}' "$INSTANCIA" "$numero" "$WEBHOOK")" | mostrar_pareamento
    echo "No celular do chip: WhatsApp → Aparelhos conectados → Conectar um aparelho. Leia o QR, ou"
    echo "toque em \"Conectar com número de telefone\" e digite o pairingCode. Os dois expiram rápido."
    ;;
  qr)
    rm -f "$QR_PNG"
    chamar GET "/instance/connect/$INSTANCIA" | mostrar_pareamento
    ;;
  estado)
    estado
    ;;
  webhook)
    chamar POST "/webhook/set/$INSTANCIA" "{\"webhook\":$WEBHOOK}" >/dev/null
    echo "webhook reaplicado"
    ;;
  desvincular)
    chamar DELETE "/instance/logout/$INSTANCIA"
    echo
    ;;
  *)
    sed -n '2,12p' "$SCRIPT" | sed 's/^# \{0,1\}//'
    exit 1
    ;;
esac
