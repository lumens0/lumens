# TESTS — SCRUM-100

## Calibração

`packages/dominio/src/pautas-parecidas.test.ts` tem 16 pautas em 6 blocos (abertas, em curadoria,
recusadas e encerradas) e 28 relatos: 21 que têm de achar uma pauta específica em primeiro lugar e
7 que não podem achar nenhuma. Os 5 mais recentes (3 e 2) foram escritos pela equipe na fase de teste e passam com os limiares atuais, que não foram alterados. Os relatos imitam o WhatsApp: sem acento, gíria ("ta", "pra"), erro
de digitação ("bibloteca", "bebedor"), sinônimo ("pcs", "circular", "postes apagados") e número de
sala no meio.

Os limiares foram escolhidos rodando a mesma consulta num PostgreSQL 16 com essa massa:

| variação                                    | acertos |
| ------------------------------------------- | ------: |
| `ts_rank` puro, sem limiar                  |   18/23 |
| pontos ≥ 2, sem palavras do campus na lista |   17/23 |
| pontos ≥ 1 + metade da primeira (escolhida) |   23/23 |
| a escolhida com similaridade 0,5            |   22/23 |

**Para calibrar com mais relatos:** acrescente casos em `RELATOS` ou `SEM_PAUTA` e rode
`pnpm --filter @lumens/dominio test`. O teste diz qual relato deixou de achar a pauta certa.

## O que mais é exercitado

| arquivo                                  | o quê                                                                                                                                        |
| ---------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `pautas-parecidas.test.ts`               | só pautas abertas; filtro por bloco inclui o campus e exclui outros blocos; desempate pelo bloco; corte pela metade; termos só `[a-z0-9]`    |
| `relato.test.ts`                         | o fluxo pelo router: bloco citado, lista de blocos, bloco digitado, escolha, "outro", sem resultado (sim/não), relato cifrado, chave trocada |
| `relato.test.ts`                         | limites da lista da Meta, corte sem partir emoji, mais de 9 blocos                                                                           |
| `schema.test.ts`                         | busca sem acento, pesos A/B, `normalizar_busca` e `word_similarity` instalados                                                               |
| `conversation.test.ts`, `worker.test.ts` | os testes existentes, ajustados para `db`/`segredo` no router e `Resposta[]`                                                                 |

## Lacunas conhecidas

- Relatos de calibração escritos para o teste, não coletados de estudantes.
- A lista ainda não foi enviada a um WhatsApp de verdade (o sender da Meta não existe); os limites
  vêm da documentação da Cloud API.
- `pnpm db:generate` deve responder "No schema changes" depois desta migração; o snapshot 0007 foi
  escrito à mão a partir do 0006.
