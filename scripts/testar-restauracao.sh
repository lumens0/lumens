#!/usr/bin/env bash
# Teste de regressão dos scripts de backup (SCRUM-95), contra o Postgres LOCAL do
# docker-compose.yml (`pnpm db:up` + `pnpm db:fresh` antes).
#
#   Uso: ./scripts/testar-restauracao.sh
#
# Cenários:
#   1. backup e restauração normais, comparando com a origem;
#   2. origem sem uma das tabelas (migração acidental): a restauração ainda tem de passar;
#   3. origem que nem existe: idem;
#   4. backup truncado: a restauração tem de FALHAR.
# Nada aqui toca no banco `lumens`: a origem quebrada é um banco à parte, apagado no fim.
set -Euo pipefail

cd "$(dirname "$0")/.."
export REPO_DIR=$PWD
export COMPOSE="docker compose --env-file .env.database"
export BACKUP_DIR
BACKUP_DIR=$(mktemp -d)
ORIGEM_QUEBRADA=lumens_origem_quebrada
read -r -a CMD <<<"$COMPOSE"

sql() { "${CMD[@]}" exec -T postgres sh -c 'psql -v ON_ERROR_STOP=1 -X -q -U "$POSTGRES_USER" -d postgres'; }
limpar() {
  echo "DROP DATABASE IF EXISTS $ORIGEM_QUEBRADA WITH (FORCE);" | sql
  rm -rf "$BACKUP_DIR"
}
trap limpar EXIT

falhas=0
cenario() {
  local nome=$1 esperado=$2
  shift 2
  if "$@" >/dev/null 2>&1; then obtido=passou; else obtido=falhou; fi
  if [[ $obtido == "$esperado" ]]; then
    echo "ok    $nome ($obtido)"
  else
    echo "ERRO  $nome: esperado $esperado, $obtido"
    falhas=$((falhas + 1))
  fi
}

./scripts/backup-banco.sh >/dev/null
dump=$(find "$BACKUP_DIR/diario" -name 'lumens-*.dump' | head -n 1)

cenario '1. restauração normal' passou ./scripts/restaurar-backup.sh "$dump"

echo "CREATE DATABASE $ORIGEM_QUEBRADA;" | sql
"${CMD[@]}" exec -T postgres sh -c \
  "pg_restore --no-owner -U \"\$POSTGRES_USER\" -d $ORIGEM_QUEBRADA" <"$dump" >/dev/null 2>&1
"${CMD[@]}" exec -T postgres sh -c \
  "psql -q -U \"\$POSTGRES_USER\" -d $ORIGEM_QUEBRADA -c 'DROP TABLE apoio CASCADE'" >/dev/null
cenario '2. origem sem a tabela apoio' passou env ORIGEM=$ORIGEM_QUEBRADA ./scripts/restaurar-backup.sh "$dump"

cenario '3. origem inexistente' passou env ORIGEM=banco_que_nao_existe ./scripts/restaurar-backup.sh "$dump"

truncado="$BACKUP_DIR/truncado.dump"
head -c 20000 "$dump" >"$truncado"
cenario '4. backup truncado' falhou ./scripts/restaurar-backup.sh "$truncado"

exit "$falhas"
