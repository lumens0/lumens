#!/usr/bin/env bash
# Cópia do backup para fora da VM (SCRUM-309). Roda DENTRO da VM, logo depois do
# backup-banco.sh, pelo mesmo lumens-backup.service (docs/operacao/backup.md), ou na mão.
#
#   Uso: ./scripts/enviar-backup.sh [arquivo.dump]   (padrão: o diário mais novo)
#
# Cifra o dump com `age` para as chaves PÚBLICAS de BACKUP_AGE_DESTINATARIOS e envia o `.age` ao
# bucket do Backblaze B2 pela API S3 dele. Se existir o espelho das fotos e dos PDFs da resposta
# oficial ($BACKUP_DIR/arquivos, que o backup-banco.sh faz quando o storage é o MinIO do compose),
# ele vai junto: um `.tar` cifrado do mesmo jeito, em `arquivos/`. A VM não tem como decifrar: a chave privada fica só no
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
cifrado='' cifrado_arquivos=''
trap 'rm -f "$cifrado" "$cifrado_arquivos"' EXIT
cifrado=$(mktemp "$BACKUP_DIR/.envio-XXXXXX")
destinatarios=()
for chave in $BACKUP_AGE_DESTINATARIOS; do destinatarios+=(-r "$chave"); done

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

enviar() { # $1 = arquivo local cifrado, $2 = caminho no bucket
  echo "--> Enviando para $BACKUP_S3_BUCKET/$2 ($(du -h "$1" | cut -f1))"
  rclone copyto --no-check-dest --retries 3 "$1" "externo:$BACKUP_S3_BUCKET/$2"
}

# O banco primeiro: um problema nas fotos (disco cheio para o pacote, arquivo ilegível) não pode
# deixar o dump do dia sem cópia fora da VM. O script ainda termina com erro, e o alerta sai.
echo "--> Cifrando $arquivo"
age "${destinatarios[@]}" -o "$cifrado" "$arquivo"
enviar "$cifrado" "diario/$(basename "$arquivo").age"

# Fotos e PDFs: um `.tar` inteiro por dia, não arquivo por arquivo. A chave só grava, então não dá
# para listar o que já está lá nem apagar o que saiu; com o pacote do dia, a foto de quem saiu
# (SCRUM-314) deixa de ir no seguinte, e as cópias antigas somem pela regra de ciclo de vida, em
# até 60 dias. O preço é reenviar tudo todo dia, o que cabe enquanto o volume for pequeno
# (docs/operacao/backup.md). O nome leva o carimbo do dump: é o par a restaurar junto.
espelho=$BACKUP_DIR/arquivos
if [[ -n $(find "$espelho" -mindepth 1 -print -quit 2>/dev/null) ]]; then
  carimbo=$(basename "$arquivo" .dump)
  carimbo=${carimbo#lumens-}
  cifrado_arquivos=$(mktemp "$BACKUP_DIR/.envio-XXXXXX")
  echo "--> Empacotando e cifrando $espelho"
  tar -C "$espelho" -cf - . | age "${destinatarios[@]}" -o "$cifrado_arquivos"
  enviar "$cifrado_arquivos" "arquivos/lumens-arquivos-$carimbo.tar.age"
else
  echo "--> Sem espelho de fotos em $espelho (storage fora do MinIO ou vazio): só o banco vai."
fi

echo "--> Cópia fora da VM pronta, cifrada"
