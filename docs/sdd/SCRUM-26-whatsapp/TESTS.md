# Plano de testes — SCRUM-26: Botões de ação pelo WhatsApp

Linguagem/framework: TypeScript, Vitest, `renderToStaticMarkup`
Exemplos do repo usados como base: `apps/site/src/componentes/estados.test.tsx` (`vi.stubEnv`)
Oráculo: ticket SCRUM-26, `encodeURIComponent` conferido à mão e a regra `SEM_APOIO` de
`packages/dominio/src/pauta/apoio.ts`.

## Casos — helper (`apps/site/src/whatsapp.test.ts`)

- [principal] **número com `+`, espaços e hífen** vira só dígitos no link.
- [codificação] **`apoiar iluminação já`** sai como `apoiar%20ilumina%C3%A7%C3%A3o%20j%C3%A1`;
  `&` e `=` também são codificados.
- [negativo] **sem env, env vazia ou só símbolos** devolvem `null`.
- [negativo] **`exigirNumeroDoBot`** falha com mensagem clara sem env, vazia ou só símbolos;
  devolve só os dígitos com número válido.
- [dados] **comandos** `apoiar <slug>`, `ajudar <id>` e `nova pauta`.

## Casos — config (`apps/site/src/next-config.test.ts`)

- [negativo] **build de produção sem número** lança o erro do `exigirNumeroDoBot`.
- [principal] **build de produção com número** devolve a config.
- [dev] **`next dev` sem número** não falha.

## Casos — componentes (`apps/site/src/componentes/whatsapp.test.tsx`)

- [principal] **botão** com `href`, `aria-label`, `target="_blank"` e `rel="noopener noreferrer"`.
- [negativo] **sem número** não renderiza nada.
- [flag] **"Vou ajudar"** some sem a flag e com `0`; aparece com `1`.
- [regra] **card por status**: os nove status de `STATUS_PAUTA`; "Apoiar" só fora de
  `em_curadoria`, `recusada` e `conquistada`.
- [HTML] **"Apoiar" fora do link do título**: nenhum `<a>` aninhado.
- [regressão] **`ListaVazia`** (`estados.test.tsx`) usa o `BotaoRelatar`: leva `?text=nova%20pauta`,
  `aria-label`, `target="_blank"` e `rel="noopener noreferrer"`.
- [flag] **"Vou ajudar"**: o `aria-label` começa pelo texto visível (`Vou ajudar no caminho …`).

## Casos — home (`apps/site/src/app/page.test.tsx`)

- [regressão] **lista vazia**: "Relatar um problema" aparece uma vez só (o da `ListaVazia`), sem
  repetir o do topo.

## Casos — regra de apoio (`apps/site/src/dados/pautas-publicas.test.ts`)

- [sincronia] **`SEM_APOIO` do site** é igual ao `SEM_APOIO` de `packages/dominio/src/pauta/apoio.ts`: o
  teste lê o fonte do domínio e compara os status; se as listas divergirem, o CI falha.

## Lacunas conhecidas

- Nenhum teste prova que o bot entende os comandos; isso fica na 2.7 e na 3.5.
- O teste de sincronia lê o `SEM_APOIO` do domínio por regex: se a declaração mudar de formato, ele
  falha (não passa em silêncio) e precisa ser ajustado.
