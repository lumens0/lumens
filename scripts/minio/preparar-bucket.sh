#!/usr/bin/env bash
# Prepara o storage das fotos e dos PDFs da resposta oficial (SCRUM-330). Roda DENTRO do contêiner
# `minio-preparar` do docker-compose.prod.yml, chamado pelo scripts/deploy-homologacao.sh a cada
# deploy. Tudo aqui é idempotente: rodar de novo não muda nada que já esteja certo.
#
#   1. cria o bucket S3_BUCKET_FOTOS, privado (nada é público: o PDF pode ter nome de quem
#      manifestou, e o painel serve os arquivos só para a curadoria logada);
#   2. cria (ou atualiza a senha de) um usuário só para o Lumens, com AWS_ACCESS_KEY_ID e
#      AWS_SECRET_ACCESS_KEY do .env.producao, e dá a ele ler, gravar, apagar e listar objetos
#      NESSE bucket e nada mais. Listar entra porque, sem isso, o S3 responde "Access Denied" (e
#      não "NoSuchKey") para a chave que não existe, e o painel daria 500 em vez de 404 para a
#      foto já apagada. Quem lista já tem as chaves no banco, então isso não abre nada novo.
#
# O back-end e o painel usam esse usuário, nunca o root do MinIO: é a mesma separação do banco,
# em que quem atende a internet não tem o login de owner.
set -Eeuo pipefail

for variavel in MINIO_ROOT_USER MINIO_ROOT_PASSWORD S3_BUCKET_FOTOS AWS_ACCESS_KEY_ID AWS_SECRET_ACCESS_KEY; do
  if [[ -z ${!variavel:-} ]]; then
    echo "::error::Falta ${variavel} para preparar o storage (docs/operacao/homologacao.md)." >&2
    exit 1
  fi
done
if [[ $AWS_ACCESS_KEY_ID == "$MINIO_ROOT_USER" ]]; then
  echo "::error::AWS_ACCESS_KEY_ID não pode ser o root do MinIO: use um usuário só para o Lumens." >&2
  exit 1
fi

export MC_CONFIG_DIR=/tmp/mc
# Credencial pelo ambiente, não pela linha de comando: o argumento apareceria num `ps` do host.
export MC_HOST_lumens="http://${MINIO_ROOT_USER}:${MINIO_ROOT_PASSWORD}@minio:9000"

mc mb --ignore-existing "lumens/$S3_BUCKET_FOTOS"
mc anonymous set private "lumens/$S3_BUCKET_FOTOS" >/dev/null

politica=/tmp/lumens-arquivos.json
cat >"$politica" <<JSON
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": ["s3:GetObject", "s3:PutObject", "s3:DeleteObject"],
      "Resource": ["arn:aws:s3:::${S3_BUCKET_FOTOS}/*"]
    },
    {
      "Effect": "Allow",
      "Action": ["s3:ListBucket"],
      "Resource": ["arn:aws:s3:::${S3_BUCKET_FOTOS}"]
    }
  ]
}
JSON
mc admin policy create lumens lumens-arquivos "$politica" >/dev/null
# O `mc` não lê esta senha do ambiente: ela passa como argumento, por um instante, dentro do
# contêiner de uma vez só.
mc admin user add lumens "$AWS_ACCESS_KEY_ID" "$AWS_SECRET_ACCESS_KEY" >/dev/null
# `policy attach` recusa a política que já está ligada ao usuário; aqui isso não é erro. A imagem
# do MinIO não tem grep: a busca é do próprio bash.
info=$(mc admin user info lumens "$AWS_ACCESS_KEY_ID" --json)
if [[ $info != *'"lumens-arquivos"'* ]]; then
  mc admin policy attach lumens lumens-arquivos --user "$AWS_ACCESS_KEY_ID" >/dev/null
fi

echo "--> Storage pronto: bucket $S3_BUCKET_FOTOS, usuário $AWS_ACCESS_KEY_ID"
