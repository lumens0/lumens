# SCRUM-315 · `papel` da pauta é histórico, e o banco impede papel ativo duplicado

## Contexto

Só `criarPauta` (e o seed) gravam `papel = 'owner'`. Quando o owner sai (`sairDoLumens`) ou é
removido por inatividade (`removerOwnerInativo`), o papel dele só ganha `ate`; ninguém vira owner.
Uma pauta pode ficar só com `co_owner`. Nenhuma regra em `docs` dizia se isso era esperado.

Além disso, `papel_pauta` não tinha nada no banco que impedisse dois papéis ativos para a mesma
pessoa na mesma pauta: a unicidade dependia só do `FOR UPDATE` em `adicionarCoOwner`.

## Decisão

1. **`papel` é histórico: diz quem criou a pauta, não quem cuida dela.** `owner` é quem criou,
   `co_owner` quem entrou depois. Quem cuida hoje é qualquer papel com `ate` nulo, e todas as
   checagens de responsável já contam assim (limite de 3, convite, caminhos, inatividade). Quando o
   owner sai, ninguém é promovido.
2. **Índice único parcial** `papel_pauta_ativo_unico` em `(pauta_id, estudante_id) WHERE ate IS
NULL`. A pessoa pode ter vários papéis encerrados na mesma pauta (sair e voltar), mas só um ativo.

## Por que não promover o co-owner

- **A curadoria depende de `owner` = quem criou.** A foto do relato de origem
  (`packages/dominio/src/pauta/curadoria.ts`) é a do relato do owner, e a consulta não filtra `ate`
  de propósito, para continuar achando o criador depois que ele sai. Com promoção, ela passaria a
  pegar o relato de outra pessoa.
- **Promover não muda nada para quem usa.** Nenhuma tela, aviso ou regra trata o owner diferente
  de um co-owner ativo.
- **Promover apagaria a história.** Trocar o papel de uma linha, ou abrir uma linha nova de
  `owner`, faria `papel` deixar de dizer quem criou a pauta, sem ganho.

Se um dia precisar de "responsável principal" (por exemplo, para avisar uma pessoa só), o caminho é
uma regra explícita (o co-owner ativo mais antigo, por `desde`) na consulta que precisar, sem mexer
no histórico.

## Migração

`CREATE UNIQUE INDEX "papel_pauta_ativo_unico" ON "papel_pauta" ("pauta_id","estudante_id") WHERE
"ate" IS NULL`. Falha se já houver duplicata ativa. Nenhum caminho atual cria duplicata, mas, antes
do deploy em um banco com dados, confira:

```sql
select pauta_id, estudante_id, count(*) from papel_pauta
where ate is null group by pauta_id, estudante_id having count(*) > 1;
```

Se vier alguma linha, encerre (`ate = now()`) a mais nova de cada par antes de migrar.
