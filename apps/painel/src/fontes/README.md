# Fontes locais do painel

As mesmas do site (SCRUM-285): Bricolage Grotesque nos títulos (`--fonte-titulo`) e Instrument Sans
no texto (`--fonte-corpo`), consumidas por `next/font/local` em `src/app/layout.tsx`.

Os arquivos são cópias exatas dos recortes de `apps/site/src/fontes` (procedência e como gerar no
README de lá). O teste `src/app/marca.test.ts` falha se as cópias divergirem.

## Por que local

O `next/font/google` baixa as fontes durante o build, e uma falha de rede no runner quebra o
`check`, que é pré-requisito do `deploy`. O `eslint.config.js` barra esse import em todo o
repositório.

## Licença

SIL Open Font License 1.1, que permite redistribuir desde que o texto da licença acompanhe os
arquivos. É o que os `*-OFL.txt` desta pasta são: não remova.
