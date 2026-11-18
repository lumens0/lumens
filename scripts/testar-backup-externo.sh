#!/usr/bin/env bash
# Teste de regressão da cópia fora da VM e do alerta de falha (SCRUM-309). Só precisa do Docker:
# um MinIO faz o papel do Backblaze B2 (os dois falam a mesma API S3) e um Mailpit, o do SMTP.
# Nada aqui fala com o B2 nem com o Gmail de verdade.
#
#   Uso: ./scripts/testar-backup-externo.sh
#
# Cenários:
#   1. o envio cifra o diário mais novo, e o que chega ao bucket decifra igual ao original; sem o
#      espelho das fotos, só o dump vai;
#   1b. com o espelho das fotos, vai também um `.tar` cifrado que decifra com os mesmos arquivos;
#   2. a chave da VM só grava: não lê o que enviou;
#   3. destino fora do ar: o envio FALHA;
#   4. sem chave pública do age: FALHA;
#   5. sem .env.backup: FALHA;
#   6. o alerta chega por e-mail, com STARTTLS e o nome da unidade no assunto;
#   7. sem .env.backup (uma das falhas a avisar), o alerta ainda sai, para a conta do SMTP;
#   8. SMTP fora do ar: o alerta FALHA.
# Cada cenário pode ter mais de uma conferência; o teste imprime uma linha por conferência.
set -Euo pipefail

cd "$(dirname "$0")/.." || exit 1
REPO=$PWD
# Mesma imagem da cópia local do MinIO; aqui só serve de B2 de mentira.
MINIO=pgsty/minio:RELEASE.2026-08-04T00-00-00Z@sha256:b6bfe7239bfc83fb90d31612d9704d86039dd714f7904b3f1ad68f211e602372
MAILPIT=axllent/mailpit:v1.34.0
ALPINE=alpine:3.22
sufixo=$RANDOM
REDE=lumens-teste-backup-$sufixo
CERTS=lumens-teste-backup-certs-$sufixo
# No Git Bash do Windows, sem isto o Docker recebe /tmp e /repo convertidos em caminhos do Windows.
export MSYS_NO_PATHCONV=1

limpar() {
  docker rm -f "b2-$sufixo" "smtp-$sufixo" >/dev/null 2>&1
  docker network rm "$REDE" >/dev/null 2>&1
  docker volume rm "$CERTS" >/dev/null 2>&1
}
trap limpar EXIT

docker network create "$REDE" >/dev/null
docker volume create "$CERTS" >/dev/null

# Certificado do SMTP de mentira, para o STARTTLS ser de verdade (o curl confere com este CA).
docker run --rm -v "$CERTS:/certs" "$ALPINE" sh -c \
  'apk add -q openssl >/dev/null && openssl req -x509 -newkey rsa:2048 -nodes -days 1 -subj /CN=smtp \
     -addext subjectAltName=DNS:smtp -keyout /certs/smtp.key -out /certs/smtp.crt 2>/dev/null &&
   chmod 644 /certs/smtp.key'

docker run -d --name "b2-$sufixo" --network "$REDE" --network-alias b2 \
  -e MINIO_ROOT_USER=raiz -e MINIO_ROOT_PASSWORD=raiz-senha-de-teste "$MINIO" server /data >/dev/null
docker run -d --name "smtp-$sufixo" --network "$REDE" --network-alias smtp -v "$CERTS:/certs:ro" \
  -e MP_SMTP_TLS_CERT=/certs/smtp.crt -e MP_SMTP_TLS_KEY=/certs/smtp.key \
  -e MP_SMTP_REQUIRE_STARTTLS=true -e MP_SMTP_AUTH_ACCEPT_ANY=true "$MAILPIT" >/dev/null

# O bucket e uma chave só de escrita, como a Application Key com writeFiles do B2.
docker exec "b2-$sufixo" bash -c '
  for _ in $(seq 30); do curl -fsS http://127.0.0.1:9000/minio/health/live >/dev/null 2>&1 && break; sleep 1; done
  export MC_CONFIG_DIR=/tmp/mc MC_HOST_b2=http://raiz:raiz-senha-de-teste@127.0.0.1:9000
  mc mb -q b2/lumens-backup >/dev/null
  printf %s "{\"Version\":\"2012-10-17\",\"Statement\":[{\"Effect\":\"Allow\",\"Action\":[\"s3:PutObject\"],\"Resource\":[\"arn:aws:s3:::lumens-backup/*\"]}]}" >/tmp/p.json
  mc admin policy create b2 so-grava /tmp/p.json >/dev/null
  mc admin user add b2 chave-da-vm senha-da-vm-de-teste >/dev/null
  mc admin policy attach b2 so-grava --user chave-da-vm >/dev/null' || {
  echo "Não consegui preparar o B2 de mentira." >&2
  exit 1
}

docker run --rm -i --network "$REDE" -v "$REPO/scripts:/repo/scripts:ro" -v "$CERTS:/certs:ro" \
  -e CURL_CA_BUNDLE=/certs/smtp.crt "$ALPINE" sh -c 'apk add -q bash age rclone curl coreutils >/dev/null && bash -s' <<'TESTE'
set -Euo pipefail
export REPO_DIR=/tmp/vm BACKUP_DIR=/tmp/vm/backups
mkdir -p "$BACKUP_DIR/diario"
age-keygen -o /tmp/chave-privada.txt 2>/dev/null
publica=$(age-keygen -y /tmp/chave-privada.txt)
head -c 300000 /dev/urandom >"$BACKUP_DIR/diario/lumens-2026-11-16T150000Z.dump"
head -c 300000 /dev/urandom >"$BACKUP_DIR/diario/lumens-2026-11-17T150000Z.dump"

configurar() { # $1 = endpoint, $2 = chave pública
  cat >"$REPO_DIR/.env.backup" <<CONF
BACKUP_S3_ENDPOINT=$1
BACKUP_S3_REGIAO=us-east-1
BACKUP_S3_BUCKET="lumens-backup"
BACKUP_S3_REGIAO=us-east-1 # comentário e espaço no fim saem
BACKUP_S3_CHAVE_ID=chave-da-vm
BACKUP_S3_CHAVE=senha-da-vm-de-teste
BACKUP_AGE_DESTINATARIOS=$2
BACKUP_ALERTA_PARA=time@exemplo.org, outra@exemplo.org
CONF
}
cat >"$REPO_DIR/.env.producao" <<'CONF'
EMAIL_HOST=smtp
EMAIL_PORT=1025
EMAIL_USUARIO=lumens@exemplo.org
EMAIL_SENHA='senha com "aspas" e $(nada)'
EMAIL_REMETENTE=Lumens <lumens@exemplo.org>
CONF

# Leitura com a chave "da equipe" (root do B2 de mentira), que nunca fica na VM.
ler_do_b2() {
  RCLONE_CONFIG_B2_TYPE=s3 RCLONE_CONFIG_B2_PROVIDER=Other RCLONE_CONFIG_B2_ENDPOINT=http://b2:9000 \
    RCLONE_CONFIG_B2_REGION=us-east-1 RCLONE_CONFIG_B2_ACCESS_KEY_ID=${CHAVE_ID:-raiz} \
    RCLONE_CONFIG_B2_SECRET_ACCESS_KEY=${CHAVE:-raiz-senha-de-teste} rclone cat "b2:lumens-backup/diario/$1"
}

falhas=0
cenario() {
  local nome=$1 esperado=$2 obtido
  shift 2
  if "$@" >/tmp/saida 2>&1; then obtido=passou; else obtido=falhou; fi
  cp /tmp/saida /tmp/anterior # para a conferência seguinte olhar a mensagem desta
  if [[ $obtido == "$esperado" ]]; then
    echo "ok    $nome ($obtido)"
  else
    echo "ERRO  $nome: esperado $esperado, $obtido"
    sed 's/^/      /' /tmp/saida
    falhas=$((falhas + 1))
  fi
}
decifra_igual() {
  ler_do_b2 lumens-2026-11-17T150000Z.dump.age | age -d -i /tmp/chave-privada.txt |
    cmp - "$BACKUP_DIR/diario/lumens-2026-11-17T150000Z.dump"
}
cifrado_de_fato() { ! ler_do_b2 lumens-2026-11-17T150000Z.dump.age | cmp -s - "$BACKUP_DIR/diario/lumens-2026-11-17T150000Z.dump"; }

configurar http://b2:9000 "$publica"
cenario '1. envio do diário mais novo' passou /repo/scripts/enviar-backup.sh
cenario '1. o que chegou decifra igual ao dump' passou decifra_igual
cenario '1. o que chegou não é o dump em claro' passou cifrado_de_fato
cenario '1. nenhum temporário ficou para trás' passou bash -c '[[ -z $(find "$BACKUP_DIR" -name ".envio-*") ]]'
listar_b2() {
  RCLONE_CONFIG_B2_TYPE=s3 RCLONE_CONFIG_B2_PROVIDER=Other RCLONE_CONFIG_B2_ENDPOINT=http://b2:9000 \
    RCLONE_CONFIG_B2_REGION=us-east-1 RCLONE_CONFIG_B2_ACCESS_KEY_ID=raiz \
    RCLONE_CONFIG_B2_SECRET_ACCESS_KEY=raiz-senha-de-teste rclone lsf -R b2:lumens-backup
}
cenario '1. sem espelho de fotos, nada em arquivos/' passou bash -c "$(declare -f listar_b2); ! listar_b2 | grep -q '^arquivos/.'"

mkdir -p "$BACKUP_DIR/arquivos"
cenario '1. espelho vazio: só o banco vai' passou bash -c "/repo/scripts/enviar-backup.sh | grep -q 'só o banco vai'"
mkdir -p "$BACKUP_DIR/arquivos/fotos/2026/11" "$BACKUP_DIR/arquivos/respostas/2026/11"
head -c 50000 /dev/urandom >"$BACKUP_DIR/arquivos/fotos/2026/11/a.jpg"
printf '%%PDF-1.4 resposta' >"$BACKUP_DIR/arquivos/respostas/2026/11/b.pdf"
cenario '1b. envio com o espelho das fotos' passou /repo/scripts/enviar-backup.sh
arquivos_iguais() {
  mkdir -p /tmp/restaurado && ler_do_b2_raiz arquivos/lumens-arquivos-2026-11-17T150000Z.tar.age |
    age -d -i /tmp/chave-privada.txt | tar -C /tmp/restaurado -xf - && diff -r /tmp/restaurado "$BACKUP_DIR/arquivos"
}
ler_do_b2_raiz() {
  RCLONE_CONFIG_B2_TYPE=s3 RCLONE_CONFIG_B2_PROVIDER=Other RCLONE_CONFIG_B2_ENDPOINT=http://b2:9000 \
    RCLONE_CONFIG_B2_REGION=us-east-1 RCLONE_CONFIG_B2_ACCESS_KEY_ID=raiz \
    RCLONE_CONFIG_B2_SECRET_ACCESS_KEY=raiz-senha-de-teste rclone cat "b2:lumens-backup/$1"
}
cenario '1b. o .tar de fora decifra com os mesmos arquivos' passou arquivos_iguais
cenario '1b. nenhum temporário ficou para trás' passou bash -c '[[ -z $(find "$BACKUP_DIR" -name ".envio-*") ]]'
cenario '2. a chave da VM não lê o bucket' falhou env CHAVE_ID=chave-da-vm CHAVE=senha-da-vm-de-teste \
  bash -c "$(declare -f ler_do_b2); ler_do_b2 lumens-2026-11-17T150000Z.dump.age"

configurar http://b2:9999 "$publica"
cenario '3. destino fora do ar' falhou /repo/scripts/enviar-backup.sh
configurar http://b2:9000 ''
cenario '4. sem chave pública' falhou /repo/scripts/enviar-backup.sh
cenario '4. diz o que falta' passou grep -q 'Falta BACKUP_AGE_DESTINATARIOS' /tmp/anterior
cenario '5. sem .env.backup' falhou env BACKUP_CONFIG=/tmp/nao-existe /repo/scripts/enviar-backup.sh
cenario '5. diz o que falta' passou grep -q 'o backup não sai da VM' /tmp/anterior

configurar http://b2:9000 "$publica"
cenario '6. alerta por e-mail' passou /repo/scripts/alertar-falha.sh lumens-backup.service
chegou() {
  curl -fsS http://smtp:8025/api/v1/messages |
    grep -q '"Subject":"\[Lumens\] Falhou: lumens-backup.service em'
}
cenario '6. o e-mail chegou, com a unidade no assunto' passou chegou
cenario '7. sem .env.backup, o alerta sai mesmo assim' passou \
  env BACKUP_CONFIG=/tmp/nao-existe /repo/scripts/alertar-falha.sh lumens-backup.service
para_a_conta() {
  curl -fsS http://smtp:8025/api/v1/messages | grep -q '"To":\[{"Name":"","Address":"lumens@exemplo.org"}\]'
}
cenario '7. e vai para a conta do SMTP' passou para_a_conta
sed -i 's/^EMAIL_PORT=.*/EMAIL_PORT=2525/' "$REPO_DIR/.env.producao"
cenario '8. SMTP fora do ar' falhou /repo/scripts/alertar-falha.sh lumens-backup.service

exit "$falhas"
TESTE
