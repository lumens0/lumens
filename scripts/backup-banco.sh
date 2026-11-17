#!/usr/bin/env bash
# Backup diário do Postgres da homologação (SCRUM-95). Roda DENTRO da VM, pelo timer do systemd
# (docs/operacao/backup.md), ou na mão.
#
#   Uso: ./scripts/backup-banco.sh
#
# Gera um `pg_dump --format=custom` em $BACKUP_DIR e mantém os 7 diários mais novos e os 4
# semanais (o de domingo) mais novos. O dump sai do contêiner pelo stdout: o banco não tem porta
# publicada, e nada aqui precisa dela.
#
# O backup NÃO contém CHAVE_CIFRA nem CHAVE_HMAC (ficam só no .env.producao). Sem elas, os
# telefones e e-mails restaurados não decifram — veja "Chaves" no docs/operacao/backup.md.
set -Eeuo pipefail

REPO_DIR=${REPO_DIR:-/opt/lumens}
BACKUP_DIR=${BACKUP_DIR:-/var/backups/lumens}
DIARIOS=${DIARIOS:-7}
SEMANAIS=${SEMANAIS:-4}
# Na VM é o compose de produção. Localmente: COMPOSE="docker compose --env-file .env.database".
read -r -a COMPOSE <<<"${COMPOSE:-docker compose -f docker-compose.prod.yml --env-file .env.producao}"

cd "$REPO_DIR"
umask 077 # o dump tem os dados cifrados e a linha do tempo: só o dono da VM lê.
mkdir -p "$BACKUP_DIR/diario" "$BACKUP_DIR/semanal"

carimbo=$(date -u +%Y-%m-%dT%H%M%SZ)
destino="$BACKUP_DIR/diario/lumens-$carimbo.dump"
parcial="$destino.parcial"
trap 'rm -f "$parcial"' ERR

echo "--> Gerando $destino"
# As variáveis são expandidas DENTRO do contêiner ($$): usuário e banco são os do próprio Postgres.
"${COMPOSE[@]}" exec -T postgres sh -c 'pg_dump --format=custom -U "$POSTGRES_USER" -d "$POSTGRES_DB"' \
  >"$parcial"

# Um dump truncado (disco cheio, contêiner que caiu no meio) não pode passar por backup bom:
# pg_restore --list lê o índice inteiro do arquivo e falha se ele estiver incompleto.
"${COMPOSE[@]}" exec -T postgres pg_restore --list >/dev/null <"$parcial"
mv "$parcial" "$destino"

if [[ $(date -u +%u) == 7 ]]; then
  cp "$destino" "$BACKUP_DIR/semanal/"
fi

# Retenção: ordena por nome (o carimbo ISO ordena por data) e apaga os mais velhos.
reter() {
  local pasta=$1 quantos=$2
  find "$pasta" -maxdepth 1 -name 'lumens-*.dump' | sort -r | tail -n +"$((quantos + 1))" |
    xargs -r rm -f --
}
reter "$BACKUP_DIR/diario" "$DIARIOS"
reter "$BACKUP_DIR/semanal" "$SEMANAIS"

echo "--> Backup pronto: $(du -h "$destino" | cut -f1)"

# Fotos e PDFs da resposta oficial (SCRUM-330), quando o storage é o MinIO do compose: espelha o
# bucket em $BACKUP_DIR/arquivos. Espelho, não cópia datada: as fotos não mudam depois de gravadas,
# e o `--remove` leva para o backup a remoção de quem saiu (SCRUM-314) no backup seguinte. O
# preço: um arquivo apagado por engano só é recuperável até a próxima rodada. Volume perdido (ou
# recriado pelo deploy) não é remoção: o bucket guarda um marcador com a identidade do volume, e se
# ele não bater com o do espelho o espelho para com erro em vez de apagar o único backup das fotos
# (scripts/minio/espelhar-fotos.sh).
#
# Depois do dump de propósito: se o MinIO estiver fora, o banco já está salvo, e o script ainda
# termina com erro para o systemd marcar a falha.
if grep -qsE '^[[:space:]]*S3_ENDPOINT=["'\'']?http://minio:9000/?["'\'']?[[:space:]]*$' .env.producao; then
  mkdir -p "$BACKUP_DIR/arquivos"
  echo "--> Espelhando o bucket das fotos em $BACKUP_DIR/arquivos"
  # Roda como o dono do $BACKUP_DIR, para os arquivos não ficarem de root. --no-deps: o MinIO
  # parado tem de virar falha do backup, não ser ligado por ele.
  "${COMPOSE[@]}" --profile minio run --rm --no-deps -T --user "$(id -u):$(id -g)" \
    -e ADOTAR_BUCKET="${ADOTAR_BUCKET:-}" -v "$BACKUP_DIR/arquivos:/backup" \
    --entrypoint bash minio-preparar /scripts/espelhar-fotos.sh
  echo "--> Arquivos espelhados: $(du -sh "$BACKUP_DIR/arquivos" | cut -f1)"
fi
