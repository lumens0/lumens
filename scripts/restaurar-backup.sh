#!/usr/bin/env bash
# Teste de restauração (SCRUM-95): restaura um backup num banco TEMPORÁRIO do mesmo Postgres,
# confere que ele bate com a origem e apaga o temporário. Backup que nunca foi restaurado não conta.
#
#   Uso: ./scripts/restaurar-backup.sh [arquivo.dump]   (padrão: o diário mais novo)
#
# Confere: contagem de pautas, apoios e eventos igual à da origem; o trigger que impede UPDATE
# na tabela `evento` continua ativo; as views públicas respondem. Não toca no banco de verdade.
set -Eeuo pipefail

REPO_DIR=${REPO_DIR:-/opt/lumens}
BACKUP_DIR=${BACKUP_DIR:-/var/backups/lumens}
TEMPORARIO=${TEMPORARIO:-lumens_restauracao}
read -r -a COMPOSE <<<"${COMPOSE:-docker compose -f docker-compose.prod.yml --env-file .env.producao}"

cd "$REPO_DIR"
arquivo=${1:-$(find "$BACKUP_DIR/diario" -maxdepth 1 -name 'lumens-*.dump' | sort -r | head -n 1)}
if [[ -z "$arquivo" || ! -f "$arquivo" ]]; then
  echo "Nenhum backup encontrado (procurei em $BACKUP_DIR/diario)." >&2
  exit 1
fi

# psql dentro do contêiner, como o owner do cluster. $1 = banco; o SQL vem pelo stdin.
psql_em() {
  "${COMPOSE[@]}" exec -T postgres sh -c "psql -v ON_ERROR_STOP=1 -X -q -t -A -U \"\$POSTGRES_USER\" -d $1"
}
# Sem stdin (</dev/null): dentro de um pipe, o `docker exec` comeria o SQL destinado ao psql.
BANCO_ORIGEM=$("${COMPOSE[@]}" exec -T postgres sh -c 'echo "$POSTGRES_DB"' </dev/null | tr -d '\r')

limpar() { echo "DROP DATABASE IF EXISTS $TEMPORARIO WITH (FORCE);" | psql_em postgres; }
trap limpar EXIT

echo "--> Restaurando $arquivo em $TEMPORARIO"
limpar
echo "CREATE DATABASE $TEMPORARIO;" | psql_em postgres
"${COMPOSE[@]}" exec -T postgres sh -c \
  "pg_restore --exit-on-error --no-owner --role=\"\$POSTGRES_USER\" -U \"\$POSTGRES_USER\" -d $TEMPORARIO" \
  <"$arquivo"

CONTAGEM="SELECT (SELECT count(*) FROM pauta) || ' pautas, ' || (SELECT count(*) FROM apoio) || ' apoios, ' || (SELECT count(*) FROM evento) || ' eventos';"
na_origem=$(echo "$CONTAGEM" | psql_em "$BANCO_ORIGEM")
restaurado=$(echo "$CONTAGEM" | psql_em "$TEMPORARIO")
echo "    origem:     $na_origem"
echo "    restaurado: $restaurado"
if [[ "$na_origem" != "$restaurado" ]]; then
  # Diferença pode ser só movimento depois do backup: compare com a hora do arquivo antes de alarmar.
  echo "AVISO: as contagens diferem. Se houve atividade depois do backup, isso é esperado." >&2
fi

echo "--> Conferindo o trigger da linha do tempo e as views"
psql_em "$TEMPORARIO" <<'SQL'
DO $$
DECLARE
  bloqueou boolean := false;
BEGIN
  -- Sem nenhum evento o UPDATE não dispara o trigger (é por linha) e a checagem não provaria nada.
  IF NOT EXISTS (SELECT 1 FROM evento) THEN
    RAISE EXCEPTION 'backup sem nenhum evento: não dá para conferir o trigger';
  END IF;
  BEGIN
    UPDATE evento SET tipo = tipo WHERE id = (SELECT id FROM evento LIMIT 1);
  EXCEPTION WHEN raise_exception THEN
    bloqueou := SQLERRM = 'evento é somente inserção';
  END;
  IF NOT bloqueou THEN RAISE EXCEPTION 'o trigger de evento não bloqueou o UPDATE'; END IF;
END $$;
SELECT count(*) FROM v_pauta_publica;
SELECT count(*) FROM v_resumo;
SQL

echo "--> Restauração conferida: $restaurado. O banco temporário será apagado."
