#!/usr/bin/env bash
# Deploy da homologação (SCRUM-93). Roda DENTRO da instância EC2, chamado por SSH pelo
# job `deploy-backend` do CI — ou na mão, se precisar.
#
# A ordem aqui é o critério de aceite do ticket: migração primeiro, em comando separado.
# Se ela falhar, o script para e o back-end antigo continua no ar com a versão anterior.
#
#   Uso: ./scripts/deploy-homologacao.sh [ref]   (ref padrão: origin/main)
#
# O CI passa o SHA exato que passou nos testes, não `origin/main`: entre o fim do job
# `check` e este deploy pode entrar outro merge, e aí subiria código que ninguém testou.
# O ref precisa estar na `main` (SCRUM-336): commit de outra branch é recusado antes de
# tocar no código ou no banco, que não tem backup.

# -E propaga o trap para funções, -u pega variável não definida, pipefail evita que uma
# falha no meio de um pipe passe como sucesso.
set -Eeuo pipefail

REPO_DIR=${REPO_DIR:-/opt/lumens}
REF=${1:-origin/main}
COMPOSE=(docker compose -f docker-compose.prod.yml --env-file .env.producao)

cd "$REPO_DIR"

for arquivo in .env.producao .env.producao.admin; do
  if [[ ! -f "$arquivo" ]]; then
    echo "::error::$arquivo não existe em $REPO_DIR. Copie do $arquivo.example e preencha." >&2
    exit 1
  fi
done

# O back-end recebe só o .env.producao. Se a credencial de owner do banco vazar para esse
# arquivo, o processo que atende a internet passa a poder apagar trigger e reescrever a
# linha do tempo de eventos, contornando os privilégios de lumens_app. A separação está em
# packages/db/README.md e é exercida pelo teste de isolamento do back-end; aqui ela vira
# portão de deploy, porque um `cat` distraído desfaz o invariante sem nenhum sintoma.
if grep -qE '^[[:space:]]*(POSTGRES_PASSWORD|DATABASE_URL_MIGRACAO)=' .env.producao; then
  echo "::error::.env.producao contém credencial administrativa do banco. Ela pertence só ao .env.producao.admin." >&2
  exit 1
fi

# Sem AUTH_SECRET o painel sobe, mas todo login responde 500 (MissingSecret do Auth.js).
# Melhor parar aqui, com a causa no log, do que publicar um painel que não deixa ninguém entrar.
if ! grep -qE '^[[:space:]]*AUTH_SECRET=[^[:space:]]+' .env.producao; then
  echo "::error::.env.producao não tem AUTH_SECRET. Gere com: openssl rand -base64 32" >&2
  exit 1
fi

# Storage das fotos e dos PDFs no MinIO do compose (SCRUM-330): liga o perfil dele e confere o que
# o `minio-preparar` vai precisar. Sem isto o back-end sobe, mas cada foto e cada PDF da resposta
# oficial falha só no meio da conversa, longe da causa.
USA_MINIO=false
# Aceita o valor entre aspas, como o compose aceita.
if grep -qE '^[[:space:]]*S3_ENDPOINT=["'\'']?http://minio:9000/?["'\'']?[[:space:]]*$' .env.producao; then
  if ! grep -qsE '^[[:space:]]*MINIO_ROOT_PASSWORD=[^[:space:]]+' .env.producao.minio; then
    echo "::error::S3_ENDPOINT aponta para o MinIO, mas .env.producao.minio não existe ou não tem MINIO_ROOT_PASSWORD. Copie do .env.producao.minio.example e gere com: openssl rand -hex 32" >&2
    exit 1
  fi
  for variavel in S3_BUCKET_FOTOS AWS_ACCESS_KEY_ID AWS_SECRET_ACCESS_KEY; do
    if ! grep -qE "^[[:space:]]*${variavel}=[^[:space:]]+" .env.producao; then
      echo "::error::.env.producao tem S3_ENDPOINT=http://minio:9000 mas não tem ${variavel}. Veja o .env.producao.example." >&2
      exit 1
    fi
  done
  COMPOSE+=(--profile minio)
  USA_MINIO=true
fi

# WhatsApp pela Evolution (SCRUM-275): liga o perfil dos serviços dela e confere os segredos. Sem
# a senha do banco dela o Postgres não sobe; sem a chave, a API fica aberta na rede do compose.
# Com CANAL_BOT=telegram a Evolution não sobe, mesmo com CANAL_WHATSAPP=evolution: um canal só.
if grep -qE '^[[:space:]]*CANAL_WHATSAPP=evolution[[:space:]]*$' .env.producao &&
  ! grep -qE '^[[:space:]]*CANAL_BOT=telegram[[:space:]]*$' .env.producao; then
  for variavel in EVOLUTION_API_KEY EVOLUTION_WEBHOOK_SEGREDO EVOLUTION_PG_SENHA; do
    if ! grep -qE "^[[:space:]]*${variavel}=[^[:space:]]+" .env.producao; then
      echo "::error::.env.producao tem CANAL_WHATSAPP=evolution mas não tem ${variavel}. Gere com: openssl rand -hex 32" >&2
      exit 1
    fi
  done
  COMPOSE+=(--profile evolution)
fi

# Backup diário (docs/operacao/backup.md). Na homologação ele nunca foi instalado, e ninguém
# percebeu (SCRUM-328): o timer é um passo à mão, fora do deploy. Aqui não para o deploy, porque
# publicar não piora o backup que falta, mas o aviso aparece em todo deploy até alguém instalar.
# Timer ativo não basta: se o último backup falhou (disco cheio, Postgres parado), ou se nenhum
# dump novo existe (timer instalado e nunca disparado, VM sempre desligada às 12:00), avisa também.
# 72 h e não 24: a VM fica desligada no fim de semana, e o `Persistent=true` só recupera o backup
# perdido uns minutos depois do boot, então a segunda de manhã não deve soar alarme falso.
BACKUP_DIARIO=${BACKUP_DIR:-/var/backups/lumens}/diario
if ! systemctl is-active --quiet lumens-backup.timer 2>/dev/null; then
  echo "::warning::O timer lumens-backup.timer não está ativo nesta VM: o banco está sem backup diário. Instale como em docs/operacao/backup.md (Instalar na VM)." >&2
elif systemctl is-failed --quiet lumens-backup.service 2>/dev/null; then
  echo "::warning::O último backup do banco falhou. Veja: journalctl -u lumens-backup.service -n 50" >&2
elif [[ -z $(find "$BACKUP_DIARIO" -maxdepth 1 -name 'lumens-*.dump' -mmin -$((72 * 60)) 2>/dev/null) ]]; then
  echo "::warning::Nenhum backup do banco nas últimas 72 h em $BACKUP_DIARIO. Rode: sudo systemctl start lumens-backup.service" >&2
fi

echo "--> Atualizando o código para $REF"
git fetch --prune origin
if ! git rev-parse --verify --quiet "$REF^{commit}" >/dev/null ||
  ! git merge-base --is-ancestor "$REF" origin/main; then
  echo "::error::$REF não é um commit da main. A homologação só publica o que já entrou na main (SCRUM-336)." >&2
  exit 1
fi
# reset --hard em vez de pull: o servidor nunca tem commit local legítimo, e um merge
# pendurado aqui deixaria o deploy travado esperando resolução que ninguém vai fazer.
git reset --hard "$REF"
# O /saude devolve este SHA, e o smoke test do CI confere que é o do run (SCRUM-322). O compose
# passa para o build da imagem do back-end.
# O CI também manda VERSAO no ambiente da chamada, para o primeiro deploy depois desta linha existir.
VERSAO=$(git rev-parse HEAD)
export VERSAO

echo "--> Migrando o banco"
# Comando separado e antes do up: código de saída diferente de zero encerra o script
# pelo set -e, sem ter derrubado o back-end que está servindo.
#
# --build não é opcional: `run` reaproveita a imagem existente, então sem ele o segundo
# deploy em diante migraria com o código ANTIGO. As migrations novas ficariam de fora e o
# back-end novo subiria contra um banco desatualizado — falhando depois, por coluna ou
# tabela ausente, longe da causa.
"${COMPOSE[@]}" run --build --rm migracao

if [[ $USA_MINIO == true ]]; then
  echo "--> Preparando o storage (bucket e usuário do Lumens no MinIO)"
  # Idempotente, como o provision do banco. Sobe o MinIO antes, se ele ainda não estiver no ar, e
  # para o deploy se falhar: o back-end antigo segue no ar.
  "${COMPOSE[@]}" run --rm minio-preparar
fi

echo "--> Subindo back-end, painel e Caddy"
"${COMPOSE[@]}" up -d --build

echo "--> Reiniciando o Caddy para ler o Caddyfile novo"
# O `up` só recria contêiner cuja imagem ou configuração mudou, e o do Caddy (caddy:2) quase
# nunca muda: ele seguiria com o Caddyfile antigo na memória. Pior, o arquivo é montado
# sozinho e o `git reset --hard` o recria com outro inode, então nem um `caddy reload` dentro
# do contêiner o enxergaria — o bind mount continua preso ao arquivo velho. O restart refaz a
# montagem. Foi assim que painel.<DOMINIO> ficou sem bloco e o TLS respondia "internal error".
# Os certificados ficam no volume caddy-data, então reiniciar não pede emissão nova.
"${COMPOSE[@]}" restart caddy

echo "--> Limpando imagens antigas e cache de build"
# Sem isto o disco da VM enche depois de alguns deploys e o build seguinte falha por falta de
# espaço, erro que não parece ter relação com o deploy (SCRUM-329). Cada deploy faz dois builds
# (`run --build` e `up --build`): `image prune` sozinho só tirava imagem sem tag, e o cache do
# BuildKit e as imagens antigas com tag ficavam para sempre.
#
# - Imagens primeiro: enquanto uma imagem existe, o BuildKit protege o cache dela.
#   - Sem tag (o rebuild deixa a anterior sem o `lumens-homologacao-<serviço>:latest`): sai na hora.
#   - Com tag e sem contêiner: sai se foi CRIADA há mais de 72 h. O `until` olha a data de
#     criação, não há quanto tempo está sem uso: imagem baixada do registry (Evolution, Caddy) é
#     antiga e sai no primeiro deploy em que nenhum contêiner a usa, e o `up` baixa de novo
#     quando precisar. Imagem usada por contêiner, parado ou não, nunca sai.
# - Cache: o de mais de 72 h sai, e o resto fica em no máximo 3 GB, mantendo o usado por último.
#
# A limpeza não derruba o deploy: o código novo já está no ar quando ela roda.
# A imagem base dos builds (`FROM node:24-slim`) não tem contêiner e é antiga, então o prune abaixo
# a tiraria a cada deploy e o build seguinte a baixaria de novo. Um contêiner parado por base a
# protege ("imagem usada por contêiner nunca sai"); ele é refeito a cada deploy, para acompanhar a
# base que o build acabou de usar e deixar a anterior sair no prazo.
for base in $(awk '/^FROM[[:space:]]/ {print $2}' Dockerfile apps/painel/Dockerfile | sort -u); do
  guarda="lumens-base-$(echo "$base" | tr -c 'a-zA-Z0-9_.-' '-')"
  docker rm --force "$guarda" >/dev/null 2>&1 || true
  docker create --name "$guarda" "$base" true >/dev/null ||
    echo "::warning::Não consegui proteger a imagem base $base da limpeza." >&2
done
docker image prune --force ||
  echo "::warning::Não consegui limpar as imagens sem tag do Docker." >&2
docker image prune --all --force --filter until=72h ||
  echo "::warning::Não consegui limpar as imagens antigas do Docker." >&2
docker builder prune --force --filter until=72h ||
  echo "::warning::Não consegui limpar o cache de build antigo do Docker." >&2
# --keep-storage: no Docker 29 virou `--reserved-space` (o nome antigo segue aceito, com aviso);
# o docker.io do Ubuntu da VM pode ser anterior e só conhecer o antigo. Sem --all, o cache ainda
# ligado a alguma imagem não conta para o teto.
docker builder prune --all --force --keep-storage 3gb ||
  echo "::warning::Não consegui limitar o cache de build do Docker a 3 GB." >&2

# O que sobrou fica no log de todo deploy, para conferir sem entrar na VM. O aviso vem antes de
# encher: com o Postgres no mesmo disco, disco cheio também para o banco.
docker system df || true
uso_do_disco=$(df --output=pcent / | tail -n 1 | tr -dc '0-9')
echo "Disco: ${uso_do_disco}% usado."
if ((uso_do_disco > 85)); then
  echo "::warning::Disco da VM em ${uso_do_disco}% depois da limpeza. Veja 'docker system df' e 'df -h /'." >&2
fi

echo "--> Pronto. Contêineres:"
"${COMPOSE[@]}" ps
