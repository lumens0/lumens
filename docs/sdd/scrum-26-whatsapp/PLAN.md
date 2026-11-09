# Plano: SCRUM-26 — Botões de ação pelo WhatsApp

> Aprovação: pendente.

## Abordagem

Um helper puro (`apps/site/src/whatsapp.ts`) monta o link e os comandos; um componente
(`BotaoWhatsApp`) renderiza o `<a>` com cara de botão e some sem link. Os pontos de uso só
escolhem comando, texto e `aria-label`.

## Fontes e decisões

- **Leitura literal do env:** `process.env.NEXT_PUBLIC_WHATSAPP_BOT` escrito por extenso, porque o
  Next só embute no bundle do navegador a variável `NEXT_PUBLIC_*` acessada assim.
- **Regra de status com apoio em lista local:** `@lumens/dominio` tem a regra (`SEM_APOIO` em
  `apoio.ts`), mas não a exporta, e o pacote importa `@lumens/db` (drizzle, `pg`), dependência de
  servidor que o site não deve puxar. O site mantém `SEM_APOIO`/`aceitaApoio` em `dados/pautas-publicas.ts`, ao lado de `FORA_DO_SITE`,
  com comentário apontando a origem.
- **Botão fora do link:** o título do card é um `<Link>`; o "Apoiar" fica num `div` irmão, porque
  `<a>` dentro de `<a>` é HTML inválido.
- **Nova aba:** `target="_blank"` com `rel="noopener noreferrer"`, para a aba do WhatsApp Web não
  ter acesso à página do site.
- **`ListaVazia`:** passa a usar o helper; o link agora leva `?text=nova%20pauta`.

## Passos

1. Helper e testes.
2. `BotaoWhatsApp` e `BotaoVouAjudar`.
3. "Apoiar" no card; "Relatar um problema" na home; refatorar `ListaVazia`.
4. Variáveis no `.env.example`; `pnpm check`.

## Riscos

- Divergência entre a lista local e a do domínio. Mitigação: comentário apontando a origem e teste
  por status no site.
