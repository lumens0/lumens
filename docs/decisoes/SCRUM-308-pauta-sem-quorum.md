# SCRUM-308 · Para onde vai a pauta depois de duas conferências sem quórum

Bug · Parte 3 · 2026-11-16 · @JGSEIXAS
**Situação:** decidida. Aprovada por Sthefany Lima em 16/11/2026. Completa a decisão 4 da
[SCRUM-80](SCRUM-80-decisoes-da-equipe.md), que não dizia o que acontece depois da segunda rodada.

## O problema

Pela decisão 4 da SCRUM-80, quando menos de 10% dos apoiadores respondem, a pauta continua em
`prometido` e a conferência reabre uma vez por mais sete dias. Se a segunda rodada também fica sem
quórum, a promessa fecha com `resultado = 'sem_quorum'` e a pauta seguia em `prometido`.

Dali ela não saía mais:

- `prometido` só levava a `conquistada`, `entregue_em_parte` ou `descumprida`, que só a apuração
  alcança, e a apuração já tinha rodado;
- `registrarPromessa` muda a pauta para `prometido`, e `prometido → prometido` não é transição
  válida: a curadoria não conseguia registrar uma promessa nova;
- o site mostrava "Aguardando a entrega" para sempre.

A SCRUM-297 (conferência de pauta sem apoiadores) leva ao mesmo beco, porque trata zero apoiadores
como `sem_quorum`.

## Decisão

1. **Depois da segunda rodada sem quórum, a pauta volta a `cobrando`.** A promessa fica registrada
   com `resultado = 'sem_quorum'`, e a linha do tempo pública mostra a conferência apurada e a
   mudança de status.
2. **Só a apuração faz essa volta.** `prometido → cobrando` entra na tabela de transições, mas,
   como os três resultados, só com origem `agendador`. Nem owner nem curadoria desfazem uma promessa
   na mão: a RN10 dá esse veredito à base.
3. **A partir de `cobrando`, o ciclo segue normal.** O owner continua cobrando e a curadoria pode
   registrar uma promessa nova (`cobrando → prometido`), que abre outra conferência na nova data. A
   promessa antiga não vira `substituida`: o resultado dela continua `sem_quorum`.

## Por que `cobrando`, e não as outras saídas

| Alternativa                                            | Por que não                                                                                                                                                        |
| ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Ficar em `prometido`                                   | É o bug: anuncia uma promessa vencida para sempre e não deixa registrar outra.                                                                                     |
| Aceitar promessa nova em `prometido`                   | Resolve a curadoria, mas a pauta continua dizendo "aguardando a entrega" de uma promessa já vencida até alguém agir. E `prometido → prometido` vira caso especial. |
| Cair em `descumprida` ou `entregue_em_parte`           | Silêncio não é veredito. É o mesmo motivo que a SCRUM-190 já registrou.                                                                                            |
| Status novo (`sem_conferencia`, proposta da SCRUM-190) | A equipe descartou na SCRUM-80, e um status terminal deixaria a pauta parada do mesmo jeito.                                                                       |

`cobrando` é o que a pauta de fato está: sem promessa válida, esperando a universidade se
comprometer de novo. É também a saída que `descumprida` já tem (`descumprida → cobrando`).

## O que mudou no código

| Onde                                                       | Mudança                                                                                           |
| ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| `packages/dominio/src/pauta/status.ts`                     | `prometido → cobrando` na tabela, reservado ao agendador.                                         |
| `packages/dominio/src/conferencia/conferencia-apuracao.ts` | Com `sem_quorum`, a apuração leva a pauta a `cobrando`. Na 1ª rodada o savepoint desfaz e reabre. |

## O que depende de alguém

- **Aprovação da equipe:** registrar na SCRUM-308 do Jira, com menção à Sthefany, como pede a task.

## Limites aceitos

- **Pauta com 0 apoiadores** gasta as duas rodadas (15 dias) antes de voltar a `cobrando`, sem aviso
  na primeira. Foi aceito: sem apoiador não há quem avisar, e a rodada vazia só atrasa a volta.
- **Erro de transição na apuração:** `sem_quorum` agora chama `transicionarStatus`, e um erro de
  regra lançado ali desfaz o savepoint da promessa. Como a pauta só chega à apuração em `prometido`
  e `prometido → cobrando` está na tabela, o erro só aparece se a tabela mudar; o teste de
  `conferencia-apuracao` cobre a volta e quebraria antes.
