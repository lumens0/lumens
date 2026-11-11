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

echo "--> Atualizando o código para $REF"
git fetch --prune origin
# reset --hard em vez de pull: o servidor nunca tem commit local legítimo, e um merge
# pendurado aqui deixaria o deploy travado esperando resolução que ninguém vai fazer.
git reset --hard "$REF"

echo "--> Migrando o banco"
# Comando separado e antes do up: código de saída diferente de zero encerra o script
# pelo set -e, sem ter derrubado o back-end que está servindo.
#
# --build não é opcional: `run` reaproveita a imagem existente, então sem ele o segundo
# deploy em diante migraria com o código ANTIGO. As migrations novas ficariam de fora e o
# back-end novo subiria contra um banco desatualizado — falhando depois, por coluna ou
# tabela ausente, longe da causa.
"${COMPOSE[@]}" run --build --rm migracao

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

echo "--> Limpando imagens antigas"
# Sem isto o disco da t3.micro enche depois de alguns deploys e o build seguinte falha
# por falta de espaço — erro que não parece ter relação com o deploy.
docker image prune --force

echo "--> Pronto. Contêineres:"
"${COMPOSE[@]}" ps
