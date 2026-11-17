# SCRUM-257 · O seed continua com inserções diretas, e um teste confere as regras do domínio

Dívida · 2026-11-16 · @JGSEIXAS
**Situação:** proposta, aguardando a aprovação da equipe na PR. Substitui o `TODO(T9)` de
`packages/db/seed/index.ts`.

## O problema

O seed insere direto nas tabelas, e o `TODO(T9)` pedia trocar isso pelos casos de uso do domínio
(`criarPauta`, `registrarApoio`, `adicionarCoOwner`, `registrarVoluntario`...). O risco apontado na
task: o seed montar estados que o domínio nunca produziria, e o site e o e2e passarem em cima
deles.

## Por que não pelo domínio

| Obstáculo                  | Detalhe                                                                                                                                                                                                                       |
| -------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Ciclo de pacotes           | O seed mora em `@lumens/db`, e `@lumens/dominio` depende de `@lumens/db`. O seed não pode chamar o domínio sem tirá-lo do pacote, e os testes do `db` que usam o seed (`seed.test.ts`, `views-publicas.test.ts`) iriam junto. |
| Slugs fixos                | `criarPauta` gera o slug com o fim do id (`…-1a2b3c4d`). O e2e, o axe, a varredura de privacidade e os testes da API usam slugs escritos à mão, como `bebedouros-no-bloco-18`.                                                |
| Determinismo e reaplicação | O `seed.test.ts` exige os mesmos ids, contatos e datas em execuções independentes, e reaplicar sem aumentar contagens. `criarPauta` gera id novo a cada chamada e não é idempotente.                                          |
| Datas da história          | O seed conta uma história de fevereiro e março de 2026. Os casos de uso aceitam `agora`, mas nem todos, e as datas teriam de ser costuradas chamada a chamada.                                                                |

## Decisão

1. **O seed continua inserindo direto**, com ids, slugs e datas fixos, na transação que já existe.
2. **Um teste confere que o estado do seed é um estado que o domínio produziria:**
   `packages/dominio/src/seed-coerente.test.ts`. Ele mora no `dominio`, que pode importar o seed
   sem ciclo, roda no banco em memória (também localmente) e usa as regras do próprio domínio:
   - apoio só em pauta aprovada que aceita apoio, depois da aprovação (`SEM_APOIO`, RN12);
   - só estudante verificado, que não saiu, apoia, cuida ou responde (RN01);
   - co-owner apoiou a pauta, e cada pauta tem no máximo `LIMITE_DE_OWNERS` responsáveis (RN06);
   - a meta batida bate com os apoios (RN05);
   - a linha do tempo segue `podeTransicionar` até o status atual, e só o agendador chega a um
     resultado;
   - cada resultado é o que `apurarConferencia` daria com as respostas do seed (RN10);
   - a resposta à conferência é de quem apoiou, dentro da janela.
3. **Regra nova no domínio, invariante nova no teste.** É assim que o seed acompanha o domínio sem
   passar por ele.

## O que o teste achou, e foi corrigido no seed

- A pauta recusada tinha 4 apoios: apoio só existe em pauta aprovada. Agora tem 0.
- Apoios com data anterior à aprovação, em seis pautas. Agora chegam de 1 a 10 horas depois da
  aprovação, antes da meta batida.
- Os resultados eram gravados com origem `curadoria`. Agora vêm do `agendador`, e a meta batida e o
  "cobrando" vêm do `bot`, como no domínio.
- As promessas tinham `resultado` `sim`, `nao` e `em_parte`, um vocabulário que a apuração não usa.
  Agora são `conquistada`, `descumprida` e `entregue_em_parte`.
- As conferências tinham 2 respostas em 124 ou 300 apoiadores, o que a apuração daria como
  `sem_quorum`. Agora têm de 14 a 36 respostas, acima dos 10%, com a maioria que leva ao
  resultado de cada pauta.

Os ids, os slugs, os status e as datas das transições não mudaram: a API, o e2e e o site veem as
mesmas pautas, os mesmos totais públicos e a mesma linha do tempo.

## O que fica de fora

- **Eventos que o domínio grava e o seed não grava:** `pauta_aprovada`, `owner_entrou`,
  `meta_batida`, `promessa_registrada`, `conferencia_aberta` e `conferencia_apurada`. A linha do
  tempo do seed tem só a criação e as mudanças de status. Incluir esses eventos muda o que a API
  pública mostra (a contagem de `/atividade` e a linha do tempo de cada pauta), e os testes da API
  foram escritos sobre a de hoje. Se a equipe quiser a linha do tempo completa na demonstração, é
  uma task própria, e o teste ganha a invariante junto.
