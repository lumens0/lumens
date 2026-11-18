#!/usr/bin/env bash
# Espelha o bucket das fotos e dos PDFs em /backup (SCRUM-330). Roda DENTRO do contêiner
# `minio-preparar`, chamado pelo scripts/backup-banco.sh depois do dump do banco.
#
# O espelho usa `--remove`: o que saiu do bucket (a saída de um estudante, SCRUM-314) sai do
# espelho. Isso é perigoso se o bucket tiver sido RECRIADO (volume perdido, deploy que cria o bucket
# vazio): uma foto nova enviada antes do backup seguinte faria o bucket parecer "normal", e o
# espelho, a única cópia das fotos antigas, seria apagado. Por isso o bucket guarda um marcador com
# a identidade do volume, que o espelho também recebe:
#
#   - espelho vazio: primeira rodada. Cria o marcador no bucket (se não houver) e espelha;
#   - espelho com marcador igual ao do bucket: mesmo volume, espelha com --remove;
#   - qualquer outro caso (bucket sem marcador, marcador diferente, espelho sem marcador): o volume
#     mudou. NÃO espelha e termina com erro, até a pessoa restaurar o espelho
#     (docs/operacao/backup.md, "Fotos e PDFs"). Restaurar leva o marcador antigo de volta.
#
# ADOTAR_BUCKET=1 pula a checagem: para quando quem opera já confirmou que o bucket de agora é o
# certo (o espelho é reaproveitado e o marcador do bucket é criado, se faltar).
set -Eeuo pipefail

ALVO="lumens/${S3_BUCKET_FOTOS:?Falta S3_BUCKET_FOTOS}"
ESPELHO=${ESPELHO:-/backup}
MARCADOR=.lumens-volume-id

export MC_CONFIG_DIR=${MC_CONFIG_DIR:-/tmp/mc}
# Credencial pelo ambiente, não pela linha de comando: o argumento apareceria num `ps` do host.
if [[ -z ${MC_HOST_lumens:-} ]]; then
  export MC_HOST_lumens="http://${MINIO_ROOT_USER}:${MINIO_ROOT_PASSWORD}@minio:9000"
fi

id_do_bucket=$(mc cat "$ALVO/$MARCADOR" 2>/dev/null || true)
id_do_bucket=${id_do_bucket//[[:space:]]/}
id_do_espelho=
if [[ -f $ESPELHO/$MARCADOR ]]; then
  id_do_espelho=$(<"$ESPELHO/$MARCADOR")
  id_do_espelho=${id_do_espelho//[[:space:]]/}
fi

if [[ -z $(ls -A "$ESPELHO") || ${ADOTAR_BUCKET:-} == 1 ]]; then
  if [[ -z $id_do_bucket ]]; then
    # Só o bash: a imagem do MinIO não tem uuidgen nem grep.
    novo=$(printf '%08x%08x%08x%08x' "$((RANDOM * 32768 + RANDOM))" "$((RANDOM * 32768 + RANDOM))" \
      "$((RANDOM * 32768 + RANDOM))" "${EPOCHSECONDS:-$SECONDS}")
    printf '%s\n' "$novo" | mc pipe "$ALVO/$MARCADOR" >/dev/null
  fi
elif [[ -z $id_do_espelho || $id_do_espelho != "$id_do_bucket" ]]; then
  echo "O bucket $S3_BUCKET_FOTOS não é o volume que o espelho guarda (marcador ausente ou diferente). Não apaguei o espelho. Volume do MinIO perdido ou recriado? Restaure como em docs/operacao/backup.md (Fotos e PDFs)." >&2
  exit 1
fi

mc mirror --overwrite --remove --quiet "$ALVO" "$ESPELHO"
