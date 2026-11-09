# SCRUM-195 — [3.3] Owner escolhe os caminhos

|              |                                                                   |
| ------------ | ----------------------------------------------------------------- |
| **Ticket**   | [SCRUM-195](https://ic-team-pds.atlassian.net/browse/SCRUM-195)   |
| **Subtasks** | SCRUM-210 (botões), SCRUM-211 (estado), SCRUM-212 (independência) |
| **Dev**      | @eumarcosmendonca                                                 |
| **Branch**   | `feature/SCRUM-195-escolher-caminhos`                             |
| **Ref**      | RF-B12, RN07 · história 3.3 · depende da 2.3 (SCRUM-98)           |

## Documentos

| Arquivo                | O que contém                                              |
| ---------------------- | --------------------------------------------------------- |
| [`SPEC.md`](SPEC.md)   | Comportamento, critérios de aceitação e o que ficou fora. |
| [`PLAN.md`](PLAN.md)   | Domínio, passos do bot, mensagem com botões, riscos.      |
| [`TESTS.md`](TESTS.md) | O que os testes exercitam e as lacunas conhecidas.        |

## Decisões que vale a revisão olhar

- **Abrir caminho não muda o status da pauta.** Quem leva a pauta a `cobrando` é o protocolo
  (`registrarProtocolo`, RN08). Abrir o Fala.BR só diz que o owner vai registrar a manifestação.
- **Duplicado barrado no bot, não no domínio.** `abrirCaminho` continua aceitando dois caminhos do
  mesmo tipo (manifestações a órgãos diferentes, como nos testes de `caminhos.test.ts`). O bot só
  oferece o botão de um tipo enquanto não há caminho daquele tipo, e um toque repetido responde
  "já está aberto".
- **Caminho só em pauta aprovada e não conquistada.** `abrirCaminho` passou a recusar
  (`pauta_fechada`) pauta em curadoria, recusada ou conquistada (`STATUS_COM_CAMINHOS`). Antes
  aceitava qualquer status.
- **Entrada pelo menu.** "4 Minhas pautas" lista as pautas de que a pessoa é owner ou co-owner
  ativo. Não há aviso proativo quando a pauta é aprovada: isso depende do envio pela Cloud API.
- **Representante fora do bot.** O tipo existe no banco, mas a história fala de Fala.BR e
  comunidade; o botão do representante entra quando houver história para ele.

## Pendências

- **Envio dos botões pela Cloud API:** a mensagem com botões (`interactive.type = "button"`) só
  aparece no log do `pnpm dev` até o sender da Meta existir.
- **Registrar o protocolo pelo bot:** o texto de confirmação pede para guardar o número; a pergunta
  do protocolo é de outra história.
