# Fontes locais do site

Arquivos `.woff2` variáveis, subset `latin`, consumidos por `next/font/local` em
`src/app/layout.tsx`.

## Por que locais

O `next/font/google` baixa as fontes de `fonts.gstatic.com` **durante o build**.
Quando essa chamada falha no runner, o Turbopack não resolve o módulo e o build
do site quebra — foi o que derrubou a `main` no merge da PR 33. Como o job
`deploy` depende do `check`, a mesma falha passou a bloquear a publicação.
Arquivos locais tiram a rede do caminho do build.

Para a dependência não voltar sem ninguém perceber, o `eslint.config.js` tem um
`no-restricted-imports` barrando `next/font/google` em todo o repositório.

## Fallback de métricas

O `next/font/google` injetava sozinho uma fonte de fallback com métricas
ajustadas, que reduz o pulo de layout enquanto a fonte carrega. O
`next/font/local` não faz isso sozinho, então o `layout.tsx` declara `fallback`
em cada família.

Nas duas famílias o `adjustFontFallback` fica ligado, e o Next calcula as métricas a partir dos
próprios arquivos.

## O que o site serve: recortes

O `layout.tsx` não carrega os originais (`*-var.woff2`), e sim recortes gerados a partir deles por
`apps/site/scripts/recortar-fontes.py` (SCRUM-59):

| arquivo servido                           | recorte                                          | tamanho        |
| ----------------------------------------- | ------------------------------------------------ | -------------- |
| `bricolage-grotesque-latin-600-800.woff2` | pesos 600–800 (os dos títulos), largura fixa 100 | 129 KB → 67 KB |
| `instrument-sans-latin-400-700.woff2`     | largura fixa 100                                 | 56 KB → 29 KB  |

Nada muda na tela: o site não usa `font-stretch`, e os títulos só usam 600, 700 e 800. O eixo de
tamanho óptico da Bricolage fica inteiro. As duas fontes vão no `preload` e, no celular em 4G, são
o que mais pesa no LCP de texto: o recorte tira quase meio segundo.

Se um título passar a usar peso fora de 600–800, ou se um original for trocado, rode o script de
novo (o comando está no topo dele) e ajuste o `weight` no `layout.tsx`. Os originais ficam aqui
porque são a fonte do recorte e dos TTF do card da pauta (`card/`).

## Origem

Baixados do Google Fonts, bloco `/* latin */` do CSS de cada família.

| arquivo                               | família             | faixa de pesos | origem                                                                                   |
| ------------------------------------- | ------------------- | -------------- | ---------------------------------------------------------------------------------------- |
| `bricolage-grotesque-latin-var.woff2` | Bricolage Grotesque | 200–800        | `fonts.gstatic.com/s/bricolagegrotesque/v9/3y996as8bTXq_nANBjzKo3IeZx8z6up5L-iNGQ.woff2` |
| `instrument-sans-latin-var.woff2`     | Instrument Sans     | 400–700        | `fonts.gstatic.com/s/instrumentsans/v4/pxicypc9vsFDm051Uf6KVwgkfoSbT2lB.woff2`           |

Para atualizar, pegue a URL do bloco `latin` em
`https://fonts.googleapis.com/css2?family=<Família>:wght@<faixa>&display=swap`
com User-Agent de navegador moderno — sem isso o Google devolve `ttf` em vez de
`woff2`. Confira se a faixa de pesos mudou e ajuste o `weight` no `layout.tsx`.

## Licença

As duas famílias são SIL Open Font License 1.1, que permite redistribuir desde
que o texto da licença acompanhe os arquivos. Os `*-OFL.txt` desta pasta são
isso — não remova.
