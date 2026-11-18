# Migrações 0026 e 0027: várias fotos, pedidos de edição e limpeza de blocos

Este documento diz o que as duas migrações fazem num banco que já tem dados, como conferir depois
de aplicar e como voltar atrás. O `db:migrate` aplica as duas na ordem, numa única execução.

## 0026 · `fotos_e_pedidos_de_edicao`

**O que muda**

- Nova tabela `relato_foto`: até 3 fotos por relato (`ordem` de 1 a 3, única por relato; a chave do
  arquivo também é única). Cada foto tem a própria moderação (`pendente`, `aprovado`, `recusado`) e,
  na recusa, um **motivo obrigatório** (CHECK no banco).
- Nova tabela `pedido_edicao`: pedido do owner para mudar o título ou a descrição de uma pauta já
  publicada. No máximo um pedido `pendente` por pauta e campo (índice único parcial). A recusa leva
  motivo obrigatório.
- Dois valores novos em `tipo_disparo`: `foto_recusada` e `edicao_decidida` (avisos do bot).
- A coluna `relato.foto_chave` **sai**, e a view pública `v_relato_publico` troca `foto_chave` por
  `fotos` (`text[]`, só fotos aprovadas, em ordem). A view é recriada com `security_barrier` e o
  `GRANT SELECT` ao `lumens_site`, como as outras.

**Dados existentes.** Antes de apagar a coluna, a migração copia cada `foto_chave` não nula para
`relato_foto` como foto 1, com a moderação do relato:

| Relato   | Foto 1 copiada                                    |
| -------- | ------------------------------------------------- |
| aprovado | `aprovado` (continua no ar)                       |
| pendente | `pendente` (a curadoria ainda vai ver)            |
| recusado | `recusado`, motivo `Recusada junto com o relato.` |

Nenhum relato é apagado ou alterado, e nenhuma foto sai do ar nem entra no ar por causa da migração.
O arquivo no armazenamento não é tocado: a chave é a mesma.

**Conferir depois de aplicar** (os dois números devem ser iguais, e o terceiro, zero):

```sql
SELECT count(*) FROM relato_foto;                    -- fotos migradas
SELECT count(*) FROM relato_foto WHERE ordem = 1;    -- igual ao anterior em banco que só tinha 1 foto
SELECT count(*) FROM v_relato_publico WHERE cardinality(fotos) > 3;  -- 0
```

**Voltar atrás (só em emergência).** A migração é para frente: o Drizzle não tem "down". O SQL abaixo
devolve o esquema anterior. **Perde** o que só existe no esquema novo: a 2ª e a 3ª foto de cada
relato, os motivos de recusa por foto e os pedidos de edição. Faça um backup antes
(`docs/operacao/backup.md`) e pare o back-end, o painel e o site durante o procedimento.

```sql
BEGIN;
ALTER TABLE relato ADD COLUMN foto_chave text;
-- Fica a primeira foto que não foi recusada; se todas foram recusadas, a primeira.
UPDATE relato r SET foto_chave = (
  SELECT f.chave FROM relato_foto f WHERE f.relato_id = r.id
  ORDER BY (f.moderacao = 'recusado'), f.ordem LIMIT 1
);
DROP VIEW v_relato_publico;
CREATE VIEW v_relato_publico WITH (security_barrier = true) AS
SELECT p.slug AS pauta_slug, r.texto, r.foto_chave, e.curso, r.moderado_em
FROM relato r
JOIN pauta p ON p.id = r.pauta_id
JOIN estudante e ON e.id = r.estudante_id
WHERE r.moderacao = 'aprovado' AND p.status IN ('juntando_apoios', 'meta_batida', 'cobrando',
  'prometido', 'entregue_em_parte', 'descumprida', 'conquistada');
GRANT SELECT ON v_relato_publico TO lumens_site;
DROP TABLE relato_foto;
DROP TABLE pedido_edicao;
DROP TYPE status_pedido_edicao;
-- Os valores novos de tipo_disparo ficam (o Postgres não remove valor de enum); nenhum código
-- antigo os usa. Antes de voltar o código, apague os avisos desses tipos que ainda estejam na fila:
DELETE FROM disparo WHERE tipo IN ('foto_recusada', 'edicao_decidida');
-- E tire as duas migrações do registro do Drizzle, para o db:migrate poder reaplicá-las depois:
DELETE FROM drizzle.__drizzle_migrations WHERE created_at >= 1795043510405;
COMMIT;
```

(O valor `1795043510405` é o `when` da 0026 no `_journal.json`; o filtro tira a 0026 e a 0027. O
teste `packages/db/src/migracao-fotos.test.ts` executa este bloco SQL sobre um banco migrado.)

## 0027 · `remove_praca_de_alimentacao`

A Praça de Alimentação saiu do catálogo de blocos (`packages/db/seed/blocos-ufal.ts`), mas continuava
nos bancos que já tinham sido semeados, aparecendo na escolha do bloco do bot e no filtro do site.

A migração apaga o bloco `praca-de-alimentacao` **somente se nenhuma pauta o referencia**:

```sql
DELETE FROM bloco b
WHERE b.slug = 'praca-de-alimentacao'
  AND NOT EXISTS (SELECT 1 FROM pauta p WHERE p.bloco_id = b.id);
```

- Se uma pauta (em qualquer status, inclusive recusada) usa o bloco, ele **fica**: a pauta guarda a
  meta calculada com a base do bloco e o histórico dele, e a FK `pauta.bloco_id` é `RESTRICT`. O
  bloco só some quando a curadoria corrigir o bloco dessas pautas (tela "Ajustes de meta" da
  pauta, que registra o motivo) e a migração, ou o `DELETE` acima, rodar de novo.
- A migração é idempotente: rodar o `DELETE` de novo não muda nada.
- Para saber se ficou: `SELECT slug FROM bloco WHERE slug = 'praca-de-alimentacao';` (vazio = apagado).
- Não há volta automática: o bloco apagado não tinha pauta, então nenhum dado se perde. Para
  recriá-lo, insira a linha em `bloco` à mão (`slug`, `nome`, `base_estudantes`).
