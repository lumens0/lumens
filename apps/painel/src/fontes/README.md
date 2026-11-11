# Fonte local do painel

`inter-latin-var.woff2`, variável, subset `latin`, consumida por
`next/font/local` em `src/app/layout.tsx` e exposta como `--fonte-corpo`.

## Por que local

O `next/font/google` baixa as fontes durante o build, e uma falha de rede no
runner quebra o `check` — que é pré-requisito do `deploy`. O
`eslint.config.js` barra esse import em todo o repositório.

## Origem

Baixado do Google Fonts, bloco `/* latin */` do CSS da família:
`fonts.gstatic.com/s/inter/v20/UcC73FwrK3iLTeHuS_nVMrMxCp50SjIa1ZL7.woff2` (pesos 100–900).

O site usava a mesma Inter e havia um teste que comparava as duas cópias. Desde que o site passou
a usar outras famílias, a do painel é a única.

## Licença

SIL Open Font License 1.1, que permite redistribuir desde que o texto da
licença acompanhe os arquivos. É o que o `inter-OFL.txt` desta pasta é — não
remova.
