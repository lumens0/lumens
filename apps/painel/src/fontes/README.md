# Fontes locais do painel

Bricolage Grotesque nos títulos (`--fonte-titulo`) e Instrument Sans no texto (`--fonte-corpo`),
consumidas por `next/font/local` em `src/app/layout.tsx`.

Eram as mesmas do site (SCRUM-285) até o SCRUM-374, quando o site passou para a Geist. Os arquivos
daqui são recortes dos originais variáveis que continuam em `apps/site/src/fontes` (procedência no
README de lá): sem eixo de largura e, na Bricolage, só os pesos de 600 a 800.

## Por que local

O `next/font/google` baixa as fontes durante o build, e uma falha de rede no runner quebra o
`check`, que é pré-requisito do `deploy`. O `eslint.config.js` barra esse import em todo o
repositório.

## Licença

SIL Open Font License 1.1, que permite redistribuir desde que o texto da licença acompanhe os
arquivos. É o que os `*-OFL.txt` desta pasta são: não remova.
