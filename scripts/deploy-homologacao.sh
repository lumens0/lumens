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

if [[ ! -f .env.producao ]]; then
  echo "::error::.env.producao não existe em $REPO_DIR. Copie do .env.producao.example e preencha." >&2
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

echo "--> Subindo back-end e Caddy"
"${COMPOSE[@]}" up -d --build

echo "--> Limpando imagens antigas"
# Sem isto o disco da t3.micro enche depois de alguns deploys e o build seguinte falha
# por falta de espaço — erro que não parece ter relação com o deploy.
docker image prune --force

echo "--> Pronto. Contêineres:"
"${COMPOSE[@]}" ps
