# SCRUM-192 · Canal dos avisos que só informam

Spike · Parte 3 · 2026-11-02 · @JGSEIXAS
**Situação:** decidido. Na v1, **todos os avisos vão pelo WhatsApp**; nenhum vai por e-mail.
Formalizado neste documento em 2026-11-10. Em 2026-11-12, o Telegram entrou como canal reserva
(veja o [adendo](#adendo--2026-11-12--telegram-como-canal-reserva)).

## A pergunta

O que só informa (sem pedir resposta) vai por e-mail? A ideia era poupar o limite de 250 da Meta
para o que precisa de ação. A decisão muda as histórias 3.2 e 3.6, que pela SCRUM-202 e pela
SCRUM-193 são os avisos de **meta batida** e de **resposta oficial**.

| Aviso                    | Para quem  | Pede ação?                      |
| ------------------------ | ---------- | ------------------------------- |
| Meta batida              | apoiadores | Não                             |
| Resposta oficial         | apoiadores | Não                             |
| Conferência "Foi feito?" | apoiadores | Sim: responder sim/em parte/não |
| Lembrete de prazo        | owner      | Sim, ao owner                   |
| Owner inativo            | owner      | Sim, ao owner                   |
| Pauta recusada           | owner      | Não                             |

## Decisão

**Não. Na v1 todos os avisos vão pelo WhatsApp.** Os avisos coletivos que só informam saem depois
da conferência na fila (SCRUM-202) e podem atrasar quando o limite aperta. O site mostra a novidade
na hora pela linha do tempo, então ninguém fica sem a informação, só sem a notificação.

## Por quê

1. **E-mail não alcança todo mundo.** No esquema, `estudante.email_hmac` é opcional: só tem e-mail
   quem escolheu "Verificar e-mail" no menu do bot (história 2.4). Quem não verificou precisaria
   cair no WhatsApp de qualquer forma, e o mesmo aviso passaria a ter dois caminhos, dois textos e
   dois registros de entrega.
2. **O limite aperta menos do que parecia.** Ele conta pessoas diferentes numa janela móvel de 24h,
   não mensagens (detalhes na SCRUM-191). Os avisos de uma mesma pauta saem com semanas de
   distância, então não se somam nas mesmas 24h. O pico real é o disparo de uma pauta grande (até
   300 pessoas), que a fila divide em duas janelas de 250.
3. **O SMTP que existe não foi feito para aviso coletivo.** O backend já tem `EMAIL_*` para o
   código de verificação, que é uma mensagem para quem acabou de pedir. Aviso coletivo é outra
   coisa: até 300 destinatários de uma vez, limite de envio do provedor, tratamento de devolução e
   link de descadastro em cada mensagem. Nada disso está planejado no sprint.
4. **Estudante lê WhatsApp, não e-mail institucional.** O bot pede o e-mail institucional
   (`@*.ufal.br`), que pouca gente abre no dia a dia.

A proposta original trazia mais um motivo: os avisos que só informam seriam o volume que levaria o
bot de 250 para 2.000. Ele deixou de valer com a decisão da SCRUM-191, de operar no limite de
portfólio não verificado sem perseguir esse volume. Os quatro motivos acima bastam.

## Como o código reflete a decisão

Conferido na `main` em 2026-11-10:

- **Um canal só.** A fila (`packages/dominio/src/avisos/fila.ts`, tabela `disparo`) guarda o nome da
  mensagem modelo e os parâmetros; não existe coluna de canal nem envio de aviso por e-mail. O
  `EMAIL_*` do backend continua servindo só ao código de verificação e ao login do painel.
- **A ordem de saída** é a de `PRIORIDADE` em `packages/dominio/src/avisos/envio.ts`:

  | Ordem | Tipo               | Avisos                           | Por que nesta posição                                                              |
  | ----: | ------------------ | -------------------------------- | ---------------------------------------------------------------------------------- |
  |     1 | `conferencia`      | Conferência "Foi feito?"         | A única com janela fechada: atrasar o envio encurta os sete dias de quem responde. |
  |     2 | `resposta_oficial` | Resposta oficial                 | Só informa.                                                                        |
  |     3 | `meta_batida`      | Meta batida                      | Só informa, e não tem prazo nenhum.                                                |
  |     4 | `recusa`           | Pauta recusada                   | Vai para uma pessoa só.                                                            |
  |     5 | `lembrete`         | Lembrete de prazo, owner inativo | Vão para uma pessoa só, e esperar uma janela não muda o resultado de nada.         |

  O teste `os avisos que só informam esperam a conferência` em `envio.test.ts` prende a regra
  desta decisão: com o limite curto, a conferência sai e meta batida e resposta oficial ficam
  adiadas, mesmo tendo chegado antes.

Os avisos ao owner pedem ação e mesmo assim ficam no fim da ordem. Isso é escolha anterior a esta
spike, registrada em `envio.ts`, e não contraria a decisão: cada um ocupa uma vaga só, e o aviso de
owner inativo sai no dia 25 de um prazo de 30. O que esta decisão exige é que os avisos coletivos
que só informam não passem na frente da conferência.

## O risco que esta decisão aceita

Aviso que só informa é o tipo que as pessoas bloqueiam quando acham irrelevante, e bloqueio derruba a
**qualidade** do número, que a Meta usa para manter os modelos como utilitários. Mitigações, todas
já no escopo de outras tasks:

- **Texto utilitário de verdade** (SCRUM-193): o aviso fala da pauta que a pessoa apoiou, sem apelo,
  sem "compartilhe". Mensagem com cara de campanha vira marketing, custa mais e conta contra a
  qualidade.
- **Um aviso por evento por pessoa**: a fila já junta duplicatas (SCRUM-202).
- **Só para quem apoiou**: ninguém recebe aviso de pauta que não apoiou.

## Quando reabrir

Reabrir esta decisão se acontecer qualquer um destes:

- A qualidade do número cair para média ou baixa no WhatsApp Manager.
- Avisos que só informam ficarem mais de **três dias** na fila, de forma recorrente.
- A Meta reclassificar os modelos de meta batida ou resposta oficial como marketing.

## O que muda nas histórias

| História               | Mudança                                                                                                                        |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| 3.2 · meta batida      | Canal fica WhatsApp. Critério de aceite novo: o aviso pode sair depois, por prioridade; o site mostra o evento na hora.        |
| 3.6 · resposta oficial | Igual à 3.2.                                                                                                                   |
| SCRUM-193              | Os dois modelos precisam ser aprovados como **utilitários**. Se a Meta os classificar como marketing, esta decisão é reaberta. |
| SCRUM-202              | Nenhuma mudança: a fila continua com um canal só.                                                                              |

## Adendo · 2026-11-12 · Telegram como canal reserva

**O aviso sai pelo canal de cada estudante: WhatsApp ou Telegram.** Continua sem e-mail.

Por quê:

1. **A Meta segura o WhatsApp.** Os seis modelos estão em `PENDING` numa conta de teste, e a conta
   de produção ainda não libera número (`docs/meta/mensagens-modelo.md`). Sem modelo aprovado,
   nenhum aviso sai.
2. **Uma condição de reabertura desta decisão disparou.** Em 2026-11-10 a Meta reclassificou
   `lumens_owner_inativo` como `MARKETING`. Não é um dos dois modelos citados acima, mas é o aviso
   que autoriza a remoção do owner inativo (SCRUM-239): sem ele, ninguém sai do papel.
3. **O Telegram não tem esses bloqueios.** O bot escreve primeiro para quem já falou com ele, sem
   modelo aprovado, sem janela de 24h e sem o limite de 250 pessoas.

Como fica:

- **Um canal por cadastro.** `estudante.canal` diz por onde a pessoa fala com o bot, e o aviso sai
  por ali. Quem usa os dois tem um cadastro em cada.
- **Um texto só.** O Telegram manda o corpo do modelo do catálogo (`whatsapp/modelos.ts`) com as
  variáveis preenchidas, o rodapé e os mesmos botões.
- **A cota é só do WhatsApp.** Quem está no Telegram não gasta vaga nem espera por ela. A ordem de
  `PRIORIDADE` vale nos dois canais.
- **Registro de entrega.** O Telegram não informa entrega: o envio aceito vale como entregue, e quem
  bloqueou o bot sai da fila como falha. "Avisado" continua sendo enviado ou falha de vez.

O risco aceito acima (bloqueio derruba a qualidade do número) não vale para o Telegram. Quem
bloqueia o bot só deixa de receber.

## Fontes

- [Messaging limits](https://developers.facebook.com/documentation/business-messaging/whatsapp/messaging-limits)
- [Template categorization](https://developers.facebook.com/documentation/business-messaging/whatsapp/templates/template-categorization)
- Esquema: [`docs/arquitetura/banco.md`](../arquitetura/banco.md)
