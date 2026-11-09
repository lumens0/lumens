# Como criar uma migração

SCRUM-94 · T21. O esquema do banco mora em `packages/db/src/schema.ts` (Drizzle) e o que está
aplicado mora em `packages/db/migrations/`, em SQL versionado. Mudar o banco é **sempre** criar um
arquivo novo ali.

> **Nunca edite uma migração já aplicada.** Quem já rodou aquele arquivo não roda de novo: o
> histórico (`meta/_journal.json`) guarda o que passou. Editar significa um banco diferente em cada
> máquina e um `db:migrate` que falha em produção sem motivo visível. Corrigir é sempre com uma
> migração nova.

## O fluxo normal (mudança de tabela ou coluna)

1. **Edite o esquema** em `packages/db/src/schema.ts`.

2. **Gere o SQL:**

   ```bash
   pnpm db:generate
   ```

   Ele compara o esquema com as migrações existentes e escreve o arquivo seguinte em
   `packages/db/migrations/`, numerado (`0008_…`).

3. **Revise o SQL gerado.** É o passo que não dá para pular — o drizzle-kit não conhece as regras
   do projeto. Olhe principalmente se ele não quer apagar ou recriar o que uma view usa (veja
   [Views e enums](#views-e-enums) abaixo) e se um `NOT NULL` novo em tabela com dados tem
   `DEFAULT`.

4. **Aplique:**

   ```bash
   pnpm db:migrate
   ```

5. **Atualize o seed** se a coluna nova for obrigatória ou se o site/painel precisar dela com
   dados: `packages/db/seed/data.ts` e, se mudar a ordem de inserção, `packages/db/seed/index.ts`.
   Depois:

   ```bash
   pnpm db:fresh
   ```

6. **Rode os testes do pacote do banco:**

   ```bash
   pnpm --filter @lumens/db test
   ```

## SQL manual (trigger, view, índice parcial)

O que o Drizzle não descreve — trigger, view, índice com `WHERE`, função — entra numa migração
**custom**, escrita à mão:

```bash
pnpm --filter @lumens/db exec drizzle-kit generate --custom --name indice_atividade_publica
```

O comando cria o arquivo vazio, com o número certo e já registrado no histórico; você escreve o SQL
dentro. Separe comandos com `--> statement-breakpoint`.

Dois exemplos reais no repositório:

- [`0005_indice_atividade_publica.sql`](../packages/db/migrations/0005_indice_atividade_publica.sql) —
  índice parcial do feed de atividade, uma linha só:

  ```sql
  CREATE INDEX "evento_publico_criado_em_idx" ON "evento"
  USING btree ("criado_em" DESC NULLS FIRST) WHERE "evento"."publico";
  ```

- [`0002_evento_append_only.sql`](../packages/db/migrations/0002_evento_append_only.sql) — função
  mais três triggers que tornam a tabela `evento` append-only (`UPDATE`, `DELETE` e `TRUNCATE`
  levantam exceção). É por isso que nenhum teste limpa a linha do tempo com `TRUNCATE evento`.

Como o `schema.ts` não descreve esses objetos, **uma migração gerada depois pode tentar derrubá-los
sem avisar** — daí a revisão do passo 3.

## Views e enums

As views públicas (`v_pauta_publica`, `v_atividade`, …) vivem só na migração custom
[`0006_views_publicas.sql`](../packages/db/migrations/0006_views_publicas.sql), fora do `schema.ts`.
Mexer numa coluna ou num enum que elas usam quebra o `db:migrate` com
`cannot drop … because other objects depend on it`.

O passo a passo (dropar a view, aplicar a mudança, recriar a view com `security_barrier`, refazer o
`GRANT SELECT … TO "lumens_site"`) está em
[Migrações que mexem no que as views usam](../packages/db/README.md#migrações-que-mexem-no-que-as-views-usam),
no README do `@lumens/db`. **Status novo** em `status_pauta` ainda exige decidir se é público e
classificá-lo em `views-publicas.test.ts`, ou o teste de classificação falha.

Campo novo numa view **não** chega ao site sozinho: ele também precisa entrar no contrato zod de
`@lumens/contratos` e na consulta da rota — veja
[Mudando o contrato](api.md#mudando-o-contrato). E nunca exponha telefone, e-mail, HMAC, cifra ou
id. A varredura de identidade da SCRUM-89 quebra o build se isso acontecer; ela é descrita em
[docs/api.md](api.md).

## Reverter

Não existe `down`, e **recriar o banco não desfaz migração nenhuma**: o `pnpm db:fresh` apaga o
volume e aplica de novo _todos_ os arquivos de `packages/db/migrations/`, inclusive o que você quer
desfazer. São dois casos diferentes:

- **A migração ainda é só sua** (gerada agora, sem push e sem ninguém mais ter aplicado): apague o
  arquivo `.sql`, remova a entrada correspondente em `migrations/meta/_journal.json` e o
  `NNNN_snapshot.json` daquele índice, e rode `pnpm db:fresh`. É o único momento em que dá para
  fingir que ela nunca existiu.
- **A migração já saiu da sua máquina** (está na `main`, numa PR ou no banco de outra pessoa):
  escreva uma **migração compensatória**, que desfaz o que a anterior fez. Vale também em
  desenvolvimento — é o que deixa todas as máquinas no mesmo estado, e apagar o arquivo aqui só
  criaria um histórico divergente do de quem já aplicou.

## Em seguida

- [Como rodar local](rodar-local.md)
- [Como usar o domínio](../packages/dominio/README.md) — quem grava nas tabelas
- [Contrato do banco](database/schema.md) — diagrama ER, campos e status
- [`@lumens/db`](../packages/db/README.md) — papéis, views e seed em detalhe
