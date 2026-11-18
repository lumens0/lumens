# shellcheck shell=bash
# Lê variáveis de um arquivo KEY=VALUE (os .env da VM) SEM executá-lo, ao contrário de `source`:
# um valor com $(...) ou crase continua sendo só texto. Define só as chaves pedidas, como variáveis
# do script, sem `export`: nenhum segredo vai para o ambiente dos comandos que o script chama. Aspas
# em volta do valor saem; sem aspas, saem também o espaço do fim e um ` # comentário`.
#
#   Uso: ler_env <arquivo> <CHAVE>...
ler_env() {
  local arquivo=$1 linha chave valor pedida
  shift
  if [[ ! -r $arquivo ]]; then
    echo "Não consigo ler $arquivo." >&2
    return 1
  fi
  while IFS= read -r linha || [[ -n $linha ]]; do
    linha=${linha%$'\r'}
    [[ $linha =~ ^[[:space:]]*([A-Za-z_][A-Za-z0-9_]*)=(.*)$ ]] || continue
    chave=${BASH_REMATCH[1]}
    valor=${BASH_REMATCH[2]}
    for pedida in "$@"; do
      if [[ $chave == "$pedida" ]]; then
        if [[ $valor =~ ^\"(.*)\"[[:space:]]*$ || $valor =~ ^\'(.*)\'[[:space:]]*$ ]]; then
          valor=${BASH_REMATCH[1]}
        else
          valor=${valor%%[[:space:]]#*}
          if [[ $valor =~ ^(.*[^[:space:]])[[:space:]]*$ ]]; then valor=${BASH_REMATCH[1]}; else valor=''; fi
        fi
        printf -v "$chave" '%s' "$valor"
      fi
    done
  done <"$arquivo"
}
