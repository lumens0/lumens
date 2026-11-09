# Plano de testes — SCRUM-26: Botões de ação pelo WhatsApp

Linguagem/framework: TypeScript, Vitest, `renderToStaticMarkup`
Exemplos do repo usados como base: `apps/site/src/componentes/estados.test.tsx` (`vi.stubEnv`)
Oráculo: ticket SCRUM-26, `encodeURIComponent` conferido à mão e a regra `SEM_APOIO` de
`packages/dominio/src/apoio.ts`.

## Casos — helper (`apps/site/src/whatsapp.test.ts`)

- [principal] **número com `+`, espaços e hífen** vira só dígitos no link.
- [codificação] **`apoiar iluminação já`** sai como `apoiar%20ilumina%C3%A7%C3%A3o%20j%C3%A1`;
  `&` e `=` também são codificados.
- [negativo] **sem env, env vazia ou só símbolos** devolvem `null`.
- [dados] **comandos** `apoiar <slug>`, `ajudar <id>` e `nova pauta`.

## Casos — componentes (`apps/site/src/componentes/whatsapp.test.tsx`)

- [principal] **botão** com `href`, `aria-label`, `target="_blank"` e `rel="noopener noreferrer"`.
- [negativo] **sem número** não renderiza nada.
- [flag] **"Vou ajudar"** some sem a flag e com `0`; aparece com `1`.
- [regra] **card por status**: os nove status de `STATUS_PAUTA`; "Apoiar" só fora de
  `em_curadoria`, `recusada` e `conquistada`.
- [HTML] **"Apoiar" fora do link do título**: nenhum `<a>` aninhado.
- [regressão] **`ListaVazia`** (`estados.test.tsx`) leva `?text=nova%20pauta`.

## Lacunas conhecidas

- Nenhum teste prova que o bot entende os comandos; isso fica na 2.7 e na 3.5.
- A igualdade entre a lista local e `SEM_APOIO` do domínio é conferida à mão, não por teste.
