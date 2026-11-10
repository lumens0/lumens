# @lumens/dominio

Regras de negócio do Lumens. É a única porta de escrita nas tabelas de negócio: bot, agendador e
curadoria chamam uma função daqui em vez de gravar direto no banco. Assim cada regra existe uma vez
e é testada uma vez.

## Funções disponíveis

**Escrevem no banco.** Todas recebem a transação de quem chama (`tx: Tx`) como primeiro
argumento, validam a regra, gravam e registram o evento — na mesma transação.

| Função                         | O que faz                                                                                  |
| ------------------------------ | ------------------------------------------------------------------------------------------ |
| `registrarEvento`              | Grava um evento na linha do tempo, com `publico` vindo do catálogo da T7                   |
| `transicionarStatus`           | Única porta para `pauta.status`; só aceita as transições da tabela abaixo                  |
| `registrarApoio`               | Registra o apoio; recusas voltam como resultado, sem exceção                               |
| `adicionarCoOwner`             | Apoiador vira co-owner, se houver vaga (`LIMITE_DE_OWNERS`)                                |
| `registrarAtividadeOwner`      | Owner mandou mensagem ao bot: renova o prazo de `DIAS_SEM_ATIVIDADE`                       |
| `removerOwnerInativo`          | Tira o papel de quem está 30 dias sem atividade e diz se abriu vaga (agendador)            |
| `abrirCaminho`                 | Abre um caminho em pauta aprovada e não conquistada; registra `caminho_aberto`             |
| `registrarProtocolo`           | Guarda o protocolo do Fala.BR; reenviar o mesmo número não é erro, outro número é recusado |
| `registrarPromessa`            | Registra a promessa e leva a pauta a `prometido`, encerrando a promessa ativa anterior     |
| `registrarExecucaoProposta`    | Proposta da comunidade executada (RN09): conquista parcial, mas a pauta continua cobrada   |
| `registrarRespostaConferencia` | Resposta de um apoiador; só de quem apoiou, e responder de novo troca o voto               |
| `enfileirarDisparos`           | Põe avisos na fila; o mesmo aviso para a mesma pessoa entra uma vez só                     |
| `reservarLote`                 | Escolhe e reserva o próximo lote de envio, respeitando as 24h da Meta                      |
| `registrarEnvio`               | A Meta aceitou o envio (guarda o wamid)                                                    |
| `registrarEntrega`             | O webhook confirmou a entrega: é a prova de que a pessoa foi avisada                       |
| `registrarFalha`               | A Meta recusou de vez; o disparo sai da fila com o motivo                                  |

`processarUmaVez(db, wamidHmac, acao)` é a exceção: recebe o `db` e abre a própria transação,
porque o registro da mensagem em `mensagem_processada` e a ação têm de valer ou sumir juntos
(RNF07). Mensagem repetida volta como `{ processada: false, motivo: 'duplicada' }` sem rodar a
ação; a chave é o HMAC do wamid, calculado por quem chama.

**Leem o banco** (recebem `db: Db`):

| Função                  | O que faz                                                                     |
| ----------------------- | ----------------------------------------------------------------------------- |
| `buscarPautasParecidas` | Até três pautas abertas parecidas com o relato, da mais para a menos parecida |
| `listarBlocos`          | Blocos para o bot perguntar onde é o problema                                 |
| `caminhosDaPauta`       | Os caminhos da pauta, do mais antigo ao mais novo (estado no bot, 3.3)        |
| `pautasDoOwner`         | Pautas em que o estudante é owner ativo e que aceitam caminho                 |

**Regras puras** (não tocam no banco; servem ao painel e aos testes sem subir nada):

| Função                        | O que faz                                                                                |
| ----------------------------- | ---------------------------------------------------------------------------------------- |
| `calcularMeta`                | RN04: 10% da base do bloco, entre `META_MINIMA` (30) e `META_MAXIMA` (300)               |
| `podeTransicionar`            | A transição está na tabela? É o que o painel usa para decidir quais botões mostrar       |
| `apurarConferencia`           | RN10: com quórum, exige maioria absoluta nos extremos; o resto é `entregue_em_parte`     |
| `interpretarResposta`         | Traduz o que o apoiador escreveu em `sim`/`em_parte`/`nao`; `null` quando não dá certeza |
| `planejarEnvio`               | Quais disparos pendentes cabem no limite agora, por prioridade (não envia nada)          |
| `calcularPrazo`               | Prazo de resposta a partir do dia do protocolo (30 dias, +30 na prorrogação)             |
| `prazoLegal`                  | O prazo do caminho, ou `null` — só o Fala.BR tem prazo em lei                            |
| `diasAteOPrazo`               | Dias que faltam: positivo ainda há tempo, zero vence hoje, negativo venceu               |
| `conferirAnonimato`           | RN08: o texto pode ir ao Fala.BR? Bloqueio impede; aviso é para quem revisa olhar        |
| `gerarTextoFalaBr`            | Monta a manifestação na terceira pessoa do plural e confere a RN08 sobre ela             |
| `palavrasDe`, `termosDaBusca` | Normalização do relato que alimenta a busca de parecidas                                 |

Os valores de referência (`META_MINIMA`, `QUORUM_MINIMO`, `PRAZO_INICIAL_DIAS`,
`LIMITE_DE_OWNERS`, `DIAS_SEM_ATIVIDADE`, `DIAS_DE_CONFERENCIA`, `TRANSICOES`, `TIPOS_EVENTO`…)
também são exportados: use a constante, não o número solto.

## Chamando do bot

Exemplo real, de [`relato.ts`](../../apps/backend/src/bot/conversation/relato.ts) (história 2.5):
leitura simples, sem transação, porque nada é gravado.

```ts
import { buscarPautasParecidas } from '@lumens/dominio';

const achadas = await buscarPautasParecidas(db, { relato, blocoId });
```

Quando grava, quem chama abre a transação e trata a recusa como resultado:

```ts
import { registrarApoio } from '@lumens/dominio';

await db.transaction(async (tx) => {
  const resultado = await registrarApoio(tx, { pautaId, estudanteId, origem: 'bot' });
  if (!resultado.registrado) return respostaDeRecusa(resultado.motivo);
});
```

## Como criar uma regra nova

Toda função de regra segue o mesmo desenho: **valida → grava → registra o evento**, tudo na
transação de quem chama.

```ts
import { eq, propostas, type Tx } from '@lumens/db';
import { registrarEvento } from './eventos';

export async function registrarExecucaoProposta(
  tx: Tx,
  {
    pautaId,
    propostaId,
    agora = new Date(),
  }: { pautaId: string; propostaId: string; agora?: Date },
) {
  // 1. valida (lendo o que precisar com a mesma tx)
  // 2. grava
  await tx
    .update(propostas)
    .set({ status: 'executada', executadaEm: agora })
    .where(eq(propostas.id, propostaId));
  // 3. registra o evento: se algo falhar depois, a ação e o evento somem juntos
  await registrarEvento(tx, {
    pautaId,
    tipo: 'proposta_executada',
    dados: { proposta_id: propostaId },
    origem: 'bot',
  });
}
```

Quem chama abre a transação e pode compor várias regras nela:

```ts
await db.transaction(async (tx) => {
  await registrarPromessa(tx, { pautaId /* ... */ });
  await transicionarStatus(tx, { pautaId, para: 'prometido', origem: 'curadoria' });
});
```

### Status da pauta

`pauta.status` só muda por `transicionarStatus`, que aceita apenas as transições de
`TRANSICOES` e grava `status_alterado`.

| De                  | Pode ir para                                      | Quem leva até lá          |
| ------------------- | ------------------------------------------------- | ------------------------- |
| `em_curadoria`      | `juntando_apoios`, `recusada`                     | curadoria                 |
| `juntando_apoios`   | `meta_batida`, `cobrando`                         | agendador / curadoria     |
| `meta_batida`       | `cobrando`                                        | curadoria                 |
| `cobrando`          | `prometido`                                       | curadoria                 |
| `prometido`         | `conquistada`, `entregue_em_parte`, `descumprida` | **só o agendador** (RN10) |
| `entregue_em_parte` | `prometido`                                       | curadoria                 |
| `descumprida`       | `cobrando`, `prometido`                           | curadoria                 |
| `recusada`          | — (fim)                                           | —                         |
| `conquistada`       | — (fim)                                           | —                         |

Dos nove status, sete são públicos: `em_curadoria` e `recusada` não aparecem no site
([views públicas](../db/README.md#views-públicas-contrato-com-o-site)). `podeTransicionar(de, para)` é a versão pura, para o
painel decidir quais botões mostrar. Os resultados da conferência (`conquistada`,
`entregue_em_parte`, `descumprida`) só são aceitos com `origem: 'agendador'`: nem owner nem
curadoria marcam conquista.

### Recusa ou erro?

- **Recusa esperada** (apoio duplicado, protocolo divergente, conferência fechada): devolva um
  resultado com motivo, por exemplo `{ registrado: false, motivo: 'protocolo_divergente' }`. O bot
  traduz o `motivo` em mensagem para o estudante.
- **Quando a transação precisa ser desfeita** (transição de status inválida, evento com dado
  pessoal): lance `ErroDeRegra` com um `codigo` estável. Lançado dentro de `db.transaction`, ele
  desfaz tudo o que a transação já gravou.

### Eventos

`registrarEvento` só aceita os tipos do catálogo da T7 ([`docs/esquema.md`](../../docs/esquema.md),
"Tipos de evento decididos"), com o `dados` tipado de cada um. O campo `publico` sai do catálogo.
Recusa `dados` com campo de identidade (estudante, curador, telefone, e-mail, nome), mesmo
aninhado. A pessoa fica na entidade de origem, nunca na linha do tempo.

### Relógio

Funções que dependem da hora recebem `agora` (com padrão `new Date()`), para os testes fixarem o
instante.

## Testes

Os testes usam o Postgres em memória (`criarBancoEmMemoria`, de `@lumens/db/teste`), com as
mesmas migrações do banco real, e as fábricas de [`src/fabricas.ts`](src/fabricas.ts)
(`criarBloco`, `criarEstudanteVerificado`, `criarPauta`). Cada teste cria os próprios dados, então
a ordem de execução não muda o resultado.

```bash
pnpm --filter @lumens/dominio test
```
