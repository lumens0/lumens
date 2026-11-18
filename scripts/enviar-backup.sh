#!/usr/bin/env bash
# Cópia do backup para fora da VM (SCRUM-309). Roda DENTRO da VM, logo depois do
# backup-banco.sh, pelo mesmo lumens-backup.service (docs/operacao/backup.md), ou na mão.
#
#   Uso: ./scripts/enviar-backup.sh [arquivo.dump]   (padrão: o diário mais novo)
#
# Cifra o dump com `age` para as chaves PÚBLICAS de BACKUP_AGE_DESTINATARIOS e envia o `.age` ao
# bucket do Backblaze B2 pela API S3 dele. A VM não tem como decifrar: a chave privada fica só no
# gerenciador de senhas da equipe. E a chave do B2 que fica na VM só grava, não lê nem apaga: quem
# invadir a VM não apaga nem lê as cópias de fora. Quanto tempo elas ficam é regra do bucket
# (ciclo de vida), não deste script.
#
# A configuração vem do .env.backup (modelo em .env.backup.example). Precisa de `age` e `rclone`
# instalados na VM.
set -Eeuo pipefail

REPO_DIR=${REPO_DIR:-/opt/lumens}
BACKUP_DIR=${BACKUP_DIR:-/var/backups/lumens}
CONFIG=${BACKUP_CONFIG:-$REPO_DIR/.env.backup}
# shellcheck source-path=SCRIPTDIR source=lib/ler-env.sh
source "$(dirname "$0")/lib/ler-env.sh"

if [[ ! -r $CONFIG ]]; then
  echo "Sem $CONFIG: o backup não sai da VM. Copie do .env.backup.example e preencha (docs/operacao/backup.md)." >&2
  exit 1
fi
VARIAVEIS=(BACKUP_S3_ENDPOINT BACKUP_S3_REGIAO BACKUP_S3_BUCKET BACKUP_S3_CHAVE_ID BACKUP_S3_CHAVE BACKUP_AGE_DESTINATARIOS)
ler_env "$CONFIG" "${VARIAVEIS[@]}"
for variavel in "${VARIAVEIS[@]}"; do
  if [[ -z ${!variavel:-} ]]; then
    echo "Falta $variavel em $CONFIG." >&2
    exit 1
  fi
done
for comando in age rclone; do
  if ! command -v "$comando" >/dev/null; then
    echo "Falta o $comando na VM: sudo apt-get install -y age rclone" >&2
    exit 1
  fi
done

arquivo=${1:-$(find "$BACKUP_DIR/diario" -maxdepth 1 -name 'lumens-*.dump' | sort -r | head -n 1)}
if [[ -z $arquivo || ! -f $arquivo ]]; then
  echo "Nenhum backup para enviar (procurei em $BACKUP_DIR/diario)." >&2
  exit 1
fi

umask 077
cifrado=$(mktemp "$BACKUP_DIR/.envio-XXXXXX")
trap 'rm -f "$cifrado"' EXIT

destinatarios=()
for chave in $BACKUP_AGE_DESTINATARIOS; do destinatarios+=(-r "$chave"); done
echo "--> Cifrando $arquivo"
age "${destinatarios[@]}" -o "$cifrado" "$arquivo"

# O rclone lê o destino destas variáveis: nada de chave na linha de comando (um `ps` a mostraria)
# nem arquivo de configuração a mais na VM. A chave só grava, então o rclone não pode fazer nada
# além de enviar: `no_check_bucket` (não tenta criar o bucket), `--no-check-dest` (não procura o
# arquivo antes) e `no_head` (não relê depois). A integridade continua conferida: o MD5 do envio
# volta na resposta do próprio PUT.
export RCLONE_CONFIG_EXTERNO_TYPE=s3
export RCLONE_CONFIG_EXTERNO_PROVIDER=Other
export RCLONE_CONFIG_EXTERNO_ENDPOINT=$BACKUP_S3_ENDPOINT
export RCLONE_CONFIG_EXTERNO_REGION=$BACKUP_S3_REGIAO
export RCLONE_CONFIG_EXTERNO_ACCESS_KEY_ID=$BACKUP_S3_CHAVE_ID
export RCLONE_CONFIG_EXTERNO_SECRET_ACCESS_KEY=$BACKUP_S3_CHAVE
export RCLONE_CONFIG_EXTERNO_NO_CHECK_BUCKET=true
export RCLONE_CONFIG_EXTERNO_NO_HEAD=true

destino="externo:$BACKUP_S3_BUCKET/diario/$(basename "$arquivo").age"
echo "--> Enviando para $BACKUP_S3_BUCKET/diario/$(basename "$arquivo").age"
rclone copyto --no-check-dest --retries 3 "$cifrado" "$destino"

echo "--> Cópia fora da VM pronta: $(du -h "$cifrado" | cut -f1), cifrada"
