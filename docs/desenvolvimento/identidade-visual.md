# Identidade visual (guia curto)

Os tokens ficam em `packages/marca/src/tokens.css` e valem para o site e o painel. Estilo novo usa
token; cor fixa só para texto sobre o âmbar (`#161a2e`) e para cores de status.

## Cores

- Fundo: papel claro `--fundo` (`#faf7f0`), como no protótipo; cartões brancos (`--superficie`); trilhos e
  fundos suaves em `--superficie-2` (`#f1ece1`). Bordas partem da tinta (`--borda`, `--borda-forte`).
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

No cabeçalho do site e do painel, a marca é o círculo desenhado em CSS do protótipo, sobre o fundo noite.
O arquivo de `packages/marca` segue para quem precisa de imagem (login, favicon, prévias).
