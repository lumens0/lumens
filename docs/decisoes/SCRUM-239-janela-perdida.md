# SCRUM-239 · O que fazer quando o agendador perde a janela

Parte 3 · 2026-11-09 · @JGSEIXAS
**Situação:** implementada na PR do agendador (SCRUM-203), aguardando revisão.

## A pergunta

O worker dos gatilhos de data (SCRUM-237) roda a cada dez minutos. Deploy, queda do servidor ou
banco fora do ar podem fazê-lo perder uma ou várias rodadas. O que acontece com a conferência que
devia abrir, o lembrete que devia sair e o owner que devia ser avisado nesse intervalo?

## A regra geral

**Cada gatilho pergunta ao banco o que está vencido e ainda não foi feito, nunca "o que vence agora".**

Uma rodada perdida não perde nada: a seguinte acha o que ficou para trás e faz. Rodar duas vezes
também não faz nada duas vezes, por três travas:

- a promessa é lida com `FOR UPDATE`, então duas rodadas simultâneas fazem fila;
- "já aberta" é a existência do evento `conferencia_aberta`, e "já apurada" é `promessa.resultado`
  preenchido;
- a fila de envio não aceita o mesmo aviso para a mesma pessoa duas vezes (índice único da
  SCRUM-202).

Não existe "recuperação" separada para rodar depois de uma queda: a rodada normal já é a
recuperação.

## O que muda quando o atraso é grande

Fazer depois o que ficou para trás nem sempre basta. Para cada gatilho, o que acontece com atraso:

| Gatilho                            | Com atraso                                                                                                                                                            | Por quê                                                                                                                           |
| ---------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| Abertura da conferência (3.7)      | Abre na volta. Com mais de 1 h de atraso, **o fecho anda junto**: a janela termina na meia-noite que completa sete dias da abertura de fato.                          | Quem apoiou precisa da semana inteira. Encurtar a janela empurraria a apuração para o "sem quórum" por culpa do servidor.         |
| Fecho da apuração (3.7)            | Apura na volta. Respostas que chegaram depois do fecho já foram recusadas por `registrarRespostaConferencia`, então o resultado é o mesmo que seria no horário.       | A apuração depende da contagem, não da hora em que roda.                                                                          |
| Reabertura sem quórum (3.7)        | Os sete dias extras contam do momento da reabertura, não do fecho original.                                                                                           | Mesmo motivo da abertura: o atraso não pode comer a segunda rodada.                                                               |
| Lembrete do prazo do Fala.BR (3.8) | Sai se o prazo ainda não venceu (inclusive no próprio dia). **Prazo vencido não rende lembrete.**                                                                     | Lembrete de prazo que passou só confunde. O vencimento aparece no site (3.4).                                                     |
| Aviso de owner inativo (3.8)       | Sai na volta, qualquer que seja o dia.                                                                                                                                | O aviso é o que dá ao owner a chance de continuar.                                                                                |
| Remoção do owner inativo (3.8)     | **Só sai quem foi avisado há pelo menos cinco dias**, mesmo passado o dia 30. Quem chegou ao dia 30 sem aviso é avisado agora e sai cinco dias depois, se não voltar. | Tirar o papel de alguém sem aviso porque o servidor estava fora do ar seria injusto. Os cinco dias são os mesmos do dia 25 ao 30. |
| Prazo 30+30 vencendo (3.4)         | Nada a fazer.                                                                                                                                                         | Por decisão, não há gatilho: o site calcula "vencido há N dias" a partir de `caminho.prazo`.                                      |

### "Avisado" quer dizer que saiu

O aviso de inatividade conta a partir de quando **saiu** da fila de envio (`disparo.enviado_em`),
não de quando entrou. A fila pode segurar um aviso por falta de cota (RNF06), e a regra dos cinco
dias tem que valer para o owner, não para o banco. Um aviso que a Meta recusou de vez
(`falhou_em`, por exemplo um número que não recebe mensagem) também conta: esperar mais não muda
nada, e o owner ficaria preso ao papel para sempre.

## O que fica de fora

- **Fila de envio parada.** Se o worker que manda as mensagens (SCRUM-208) ficar fora do ar, os
  avisos esperam na fila e saem na volta, na ordem de prioridade. Isso já é da fila, não do
  agendador.
- **Alerta de agendador parado.** Nada avisa a equipe se o worker ficar dias sem rodar. O
  healthcheck da homologação (SCRUM-93) é o lugar natural para isso.
