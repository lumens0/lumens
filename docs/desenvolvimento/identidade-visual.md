# Identidade visual (guia curto)

Os tokens ficam em `packages/marca/src/tokens.css` e valem para o site e o painel. Estilo novo usa
token; cor fixa só para texto sobre o âmbar (`#161a2e`) e para cores de status.

## Cores

- Fundo: névoa azulada `--fundo` (`#f3f5fa`); cartões brancos (`--superficie`); trilhos e fundos
  suaves em `--superficie-2` (`#e6eaf4`). Bordas partem do azul da noite (`--borda`, `--borda-forte`).
- Texto: `--tinta` (15,8:1 sobre o fundo), `--tinta-2` (8,3:1), `--tinta-3` (5,4:1).
- Topo e hero em noite (`--noite`, `--noite-2`). A luz é âmbar: `--luz` no botão principal, `--luz-tinta`
  (6,0:1) para texto e links.
- Status públicos (`--status-*`): todos com contraste mínimo de 3:1 sobre o fundo; a cor nunca é o
  único sinal, sempre vem com rótulo.

## Fontes

Títulos em `--fonte-titulo`, texto e números em `--fonte-corpo` (números com algarismos tabulares).

## Espaçamento e componentes

Raio `--raio` (16px) nos cartões e `--raio-controle` (12px) em botões e campos. Alvos de toque de, no
mínimo, 44px de altura (SCRUM-381). Gráficos são barras em HTML/CSS, com o valor sempre em texto.

## Logo

Usar o arquivo de `packages/marca` sobre o fundo noite; o brilho em volta do círculo faz parte do
desenho, então não cortar a imagem.
