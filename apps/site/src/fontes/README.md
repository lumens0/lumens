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

O `adjustFontFallback` fica ligado, e o Next calcula as métricas a partir dos
próprios arquivos.

## O que o site serve

Desde o SCRUM-374 o site usa uma família só, a **Geist**, num arquivo variável com os pesos 100 a 900
(`geist-latin-var.woff2`, 29 KB). Ele é menor que os dois recortes de antes juntos (97 KB), então não
precisa de recorte.

A Bricolage Grotesque e a Instrument Sans continuam aqui só como fonte dos TTF do card da pauta
(`card/`); o `layout.tsx` não as carrega mais.

## Origem

Baixados do Google Fonts, bloco `/* latin */` do CSS de cada família.

| arquivo                               | família             | faixa de pesos | origem                                                                                   |
| ------------------------------------- | ------------------- | -------------- | ---------------------------------------------------------------------------------------- |
| `bricolage-grotesque-latin-var.woff2` | Bricolage Grotesque | 200–800        | `fonts.gstatic.com/s/bricolagegrotesque/v9/3y996as8bTXq_nANBjzKo3IeZx8z6up5L-iNGQ.woff2` |
| `instrument-sans-latin-var.woff2`     | Instrument Sans     | 400–700        | `fonts.gstatic.com/s/instrumentsans/v4/pxicypc9vsFDm051Uf6KVwgkfoSbT2lB.woff2`           |
| `geist-latin-var.woff2`               | Geist               | 100–900        | `fonts.gstatic.com/s/geist/v5/gyByhwUxId8gMEwcGFU.woff2`                                 |

Para atualizar, pegue a URL do bloco `latin` em
`https://fonts.googleapis.com/css2?family=<Família>:wght@<faixa>&display=swap`
com User-Agent de navegador moderno — sem isso o Google devolve `ttf` em vez de
`woff2`. Confira se a faixa de pesos mudou e ajuste o `weight` no `layout.tsx`.

## Licença

As três famílias são SIL Open Font License 1.1, que permite redistribuir desde
que o texto da licença acompanhe os arquivos. Os `*-OFL.txt` desta pasta são
isso — não remova.
