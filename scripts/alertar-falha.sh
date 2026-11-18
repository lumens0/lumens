#!/usr/bin/env bash
# Avisa o time por e-mail que uma unidade do systemd falhou (SCRUM-309). Chamado pelo
# lumens-alerta@.service, que o OnFailure= do backup e do teste de restauração disparam.
#
#   Uso: ./scripts/alertar-falha.sh <unidade>   (ex.: lumens-backup.service)
#
# Usa o mesmo SMTP do back-end (EMAIL_* do .env.producao) e manda para BACKUP_ALERTA_PARA do
# .env.backup. Sem o .env.backup (que é uma das falhas a avisar), manda para a própria conta do
# EMAIL_USUARIO, dizendo isso no corpo. O corpo leva o fim do log da unidade sem as linhas em que o
# Postgres repete conteúdo de linha de tabela (CONTEXT, DETAIL, COPY...), que podem ter texto de
# pauta ou de relato.
set -Eeuo pipefail

REPO_DIR=${REPO_DIR:-/opt/lumens}
CONFIG=${BACKUP_CONFIG:-$REPO_DIR/.env.backup}
AMBIENTE=${AMBIENTE_PRODUCAO:-$REPO_DIR/.env.producao}
unidade=${1:?Uso: alertar-falha.sh <unidade>}
# shellcheck source-path=SCRIPTDIR source=lib/ler-env.sh
source "$(dirname "$0")/lib/ler-env.sh"

ler_env "$AMBIENTE" EMAIL_HOST EMAIL_PORT EMAIL_USUARIO EMAIL_SENHA EMAIL_REMETENTE
for variavel in EMAIL_HOST EMAIL_PORT EMAIL_USUARIO EMAIL_SENHA EMAIL_REMETENTE; do
  if [[ -z ${!variavel:-} ]]; then
    echo "Não dá para avisar a falha de $unidade: falta $variavel." >&2
    exit 1
  fi
done

aviso_de_config=''
if ! ler_env "$CONFIG" BACKUP_ALERTA_PARA 2>/dev/null || [[ -z ${BACKUP_ALERTA_PARA:-} ]]; then
  BACKUP_ALERTA_PARA=$EMAIL_USUARIO
  aviso_de_config="Sem BACKUP_ALERTA_PARA em $CONFIG (ou sem o arquivo): este aviso foi para $EMAIL_USUARIO."
fi

# 465 é TLS desde a conexão; qualquer outra porta (587) começa em claro e exige o STARTTLS.
if [[ $EMAIL_PORT == 465 ]]; then url="smtps://$EMAIL_HOST:$EMAIL_PORT"; else url="smtp://$EMAIL_HOST:$EMAIL_PORT"; fi

umask 077
temporario=$(mktemp -d)
trap 'rm -rf "$temporario"' EXIT

# Usuário, senha e destinatários num arquivo de configuração do curl: na linha de comando, a senha
# apareceria num `ps`. As aspas e barras do valor são escapadas para o formato do arquivo. O
# envelope (MAIL FROM) é o endereço da conta: o EMAIL_REMETENTE pode vir como `Nome <endereço>`,
# que o nodemailer do back-end aceita e o SMTP não; ele fica só no cabeçalho From.
escapar() { local v=${1//\\/\\\\}; printf '%s' "${v//\"/\\\"}"; }
{
  printf 'user = "%s:%s"\n' "$(escapar "$EMAIL_USUARIO")" "$(escapar "$EMAIL_SENHA")"
  printf 'mail-from = "%s"\n' "$(escapar "$EMAIL_USUARIO")"
  for para in ${BACKUP_ALERTA_PARA//,/ }; do printf 'mail-rcpt = "%s"\n' "$(escapar "$para")"; done
} >"$temporario/curl.conf"

if command -v journalctl >/dev/null && log=$(journalctl -u "$unidade" -n 40 --no-pager 2>&1); then
  log=$(printf '%s\n' "$log" | grep -vE 'CONTEXT:|DETAIL:|HINT:|LINE [0-9]+:|COPY ' || true)
else
  log="(sem acesso ao journal; veja na VM: journalctl -u $unidade -n 50)"
fi

# Quebras de linha em LF aqui: o --crlf do curl converte tudo para CRLF, como o SMTP exige.
{
  printf 'From: %s\n' "$EMAIL_REMETENTE"
  printf 'To: %s\n' "$BACKUP_ALERTA_PARA"
  printf 'Subject: [Lumens] Falhou: %s em %s\n' "$unidade" "$(hostname)"
  printf 'Date: %s\n' "$(LC_ALL=C date -R)"
  printf 'MIME-Version: 1.0\nContent-Type: text/plain; charset=UTF-8\nContent-Transfer-Encoding: 8bit\n\n'
  printf 'A unidade %s falhou em %s, %s.\n\n' "$unidade" "$(hostname)" "$(date '+%Y-%m-%d %H:%M %Z')"
  [[ -n $aviso_de_config ]] && printf '%s\n\n' "$aviso_de_config"
  printf 'O que fazer: docs/operacao/backup.md, seção "Quando o backup falha".\n\n'
  printf 'Últimas linhas do log:\n\n%s\n' "$log"
} >"$temporario/mensagem.eml"

curl --silent --show-error --fail --ssl-reqd --crlf --max-time 60 --url "$url" \
  --config "$temporario/curl.conf" --upload-file "$temporario/mensagem.eml"
echo "--> Aviso da falha de $unidade enviado para $BACKUP_ALERTA_PARA"
