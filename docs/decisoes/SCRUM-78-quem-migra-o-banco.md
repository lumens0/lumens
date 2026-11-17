# SCRUM-78 · As migrações rodam sempre como o dono do banco

Decisão · registrada em 2026-11-17 a partir da SDD da SCRUM-78 e da SCRUM-100, removidas na
limpeza do repositório · @sthefanyblima
**Situação:** em vigor.

## O que foi escolhido

`pnpm db:migrate` roda com `DATABASE_URL_MIGRACAO`, sempre com o mesmo papel: `lumens`, o dono do
banco. Duas coisas dependem disso e quebram em silêncio se outro papel migrar.

### 1. Tabela nova chega sozinha ao `lumens_app`

A migração 0003 (`packages/db/migrations/0003_app_role_privileges.sql`) dá ao `lumens_app` leitura
e escrita nas tabelas que já existem e, por `ALTER DEFAULT PRIVILEGES`, em toda tabela e sequência
que o dono criar depois. Por isso as migrações seguintes (a fila de disparos na 0004, os
documentos da resposta na 0013...) criam tabela sem nenhum `GRANT`, e o back-end enxerga.

O privilégio padrão só vale para objetos criados pelo papel que o declarou. Se outro papel rodar a
migração (o administrador de um Postgres gerenciado, por exemplo), a tabela nova nasce sem acesso
para o back-end, a migração não dá erro, e a falha só aparece em produção, como "permission
denied" na primeira consulta.

O nome `lumens_app` é fixo no projeto (`packages/db/src/app-role.ts`); só a senha muda por
ambiente. Assim a migração concede privilégio sem montar o nome a partir de texto externo.

Duas consequências para quem cria tabela:

- Tabela que só aceita inserção, como `evento` (RN11), precisa tirar `UPDATE` e `DELETE` do
  `lumens_app` na própria migração: o privilégio padrão dá `SELECT`, `INSERT`, `UPDATE` e `DELETE`.
  A 0003 faz isso com `evento` e, por defesa, revoga também o `TRUNCATE`, inclusive de `PUBLIC`.
- Para o `lumens_site` é o contrário: tabela e view nova **não** chegam a ele, e cada uma precisa
  de `GRANT` explícito (veja `packages/db/README.md`).

### 2. Quem migra precisa poder criar extensão

A busca de pautas parecidas depende de `unaccent` e `pg_trgm`, que a migração 0007 instala. As
duas são _trusted_ desde o PostgreSQL 13, então o dono do banco basta. Num serviço gerenciado, o
papel que migra precisa ser o dono do banco ou o administrador do serviço.

## O que fica de fora

Trocar o papel que migra exige, antes, refazer o `ALTER DEFAULT PRIVILEGES` para o papel novo
(ou passar a dar `GRANT` explícito em toda migração) e conferir o privilégio de criar extensão.
