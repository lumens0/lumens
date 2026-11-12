# SCRUM-267 · Telegram como canal reserva do bot

História · 2026-11-12 · @guilhermek32
**Situação:** decidido; implementação na branch `feat/telegram-bot`, aguardando revisão. O canal
principal da demonstração é o WhatsApp não oficial (Evolution API), em história própria; o Telegram
é a reserva. O código da Meta fica onde está.

## A pergunta

A API oficial do WhatsApp está travada na Meta:

- o número de teste não envia para o Brasil (erro `130497`);
- o portfólio bate no limite de contas (`#2494067`);
- o portfólio novo foi recusado por política (casos de suporte `29308305175448516` e
  `1133000896185606`).

A demonstração para a turma é por volta de 25/11/2026. Por onde o bot conversa até lá, e o que
fica de reserva se esse caminho também cair?

## Opções avaliadas

| Opção                                    | Alcance                                                                               | Custo e aprovação                                                            | Risco                                                                                        |
| ---------------------------------------- | ------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| **WhatsApp oficial (Cloud API)**         | 99% dos smartphones no Brasil                                                         | Travado na Meta (acima)                                                      | Não sai a tempo da demonstração.                                                             |
| **WhatsApp não oficial (Evolution API)** | O mesmo do WhatsApp                                                                   | Sem aprovação                                                                | O modo Baileys viola os termos do WhatsApp, e o número pode ser banido.                      |
| **Telegram (Bot API oficial)**           | Cerca de 57% dos smartphones no Brasil, e caindo (Mobile Time/Opinion Box, fev. 2025) | Grátis, sem aprovação, sem modelo, sem janela de 24h, sem custo por mensagem | A pessoa precisa abrir a conversa: o bot não escreve primeiro para quem nunca falou com ele. |

O risco do Evolution foi aceito pela equipe para a demonstração. Ele está aqui só como contexto: a
decisão sobre o Evolution é da história dele.

## Decisão

**O Telegram entra como canal reserva, ao lado dos outros canais, sem apagar o código da Meta.**
A conversa é a mesma; muda só a entrada e a saída.

### Identidade: o telefone, nos dois canais

- **A identidade é o telefone.** O Telegram não manda o telefone em cada mensagem: a pessoa o
  compartilha uma vez, pelo botão de compartilhar o próprio contato (`request_contact`), que o bot
  oferece a todo chat que ainda não tem telefone. O número passa pelo mesmo `hashPhone` do
  WhatsApp, então **a mesma pessoa é o mesmo estudante nos dois canais**.
- **Cartão de outra pessoa é recusado.** Se `contact.user_id` for diferente de `from.id` (ou não
  vier), o contato não é da pessoa que está falando, e o bot não o aceita: pede de novo.
- **Nada vai para a conversa antes do contato.** O texto que chegou antes (o `/start` de um link
  do site, por exemplo) fica guardado, cifrado, e roda depois que o contato é aceito.
- **O chat id do Telegram é guardado para o envio**, nunca em claro: tabela `chat_telegram`, com
  HMAC de `tg:<chat_id>` para a busca, o chat id cifrado para mandar a mensagem e o telefone em HMAC
  e cifrado. Um telefone tem um chat só. A rotação da chave de cifra cobre a tabela.
- **Chat que nunca mandou o contato** é apagado pela limpeza diária depois de um dia parado.

### Avisos

- O aviso vai pelo Telegram para o estudante que tem chat ligado ao telefone; quem não tem recebe
  pelo WhatsApp.
- **Não gasta o limite da Meta** (250 pessoas por 24h, SCRUM-191): ele é só do WhatsApp. O canal
  de cada disparo é gravado na reserva (`disparo.canal`), e a conta das 24h usa o canal gravado,
  não o chat de hoje: ela continua certa quando a pessoa liga ou perde o chat dentro das 24h.
- **403 (bot bloqueado) é falha permanente**: o aviso sai da fila em vez de voltar no retry, e o
  chat é apagado. Os próximos avisos da pessoa voltam ao WhatsApp; se ela falar com o bot de novo
  pelo Telegram, compartilha o contato outra vez.
- **`sendMessage` aceito vale como enviado e entregue.** O Telegram não manda recibo de entrega.

### Mensagens

- As respostas vão como texto puro, com teclado inline no lugar dos botões e das listas do
  WhatsApp.
- O `*negrito*` das respostas (escrito para o WhatsApp) vira `entities`. **Nunca `parse_mode`**:
  nada do texto é interpretado pelo Telegram.

### Entrada e configuração

- **Webhook** (`POST /telegram/webhook`) autenticado pelo header
  `X-Telegram-Bot-Api-Secret-Token`, conferido contra o `TELEGRAM_WEBHOOK_SECRET`.
- **Long polling** (`TELEGRAM_MODO=polling`) para a máquina do dev, sem túnel nem URL pública.
- **O canal só liga com `TELEGRAM_BOT_TOKEN` definido.** Sem ele, nada do Telegram roda, e o
  WhatsApp funciona como antes.

## O que esta decisão muda

- O adendo de 2026-11-12 da [SCRUM-192](SCRUM-192-canal-avisos.md) falava em um cadastro por canal
  (`estudante.canal`). Vale esta decisão: um estudante por telefone, e o aviso sai pelo Telegram
  para quem tem chat ligado ao telefone.

## Lacunas conhecidas

- **Nono dígito.** O wa_id que a Meta entrega para algumas contas brasileiras antigas vem sem o
  nono dígito (55 + DDD + 8 dígitos), enquanto o Telegram manda o número inteiro. Para essa pessoa
  os dois canais dão hashes diferentes: ela vira dois estudantes, e o e-mail da UFAL dela é
  recusado no segundo canal, porque já está no cadastro do outro telefone. Nenhuma heurística foi
  acrescentada: pôr ou tirar o 9 de um lado só não resolve com segurança (comentário de
  `normalizarTelefone` em `apps/backend/src/bot/telegram/contato.ts`). O que fazer: a confirmar.
- **Nada foi exercitado contra a Bot API real.** Os testes usam um `fetch` falso e o simulador
  fala com o back-end local.
- **"Apoiar" ainda não é tratado pelo bot**, em nenhum dos dois canais. O link do site manda o
  comando, mas a conversa ainda não o executa.
- **Os botões de resposta rápida dos avisos** (os da conferência) não têm quem os trate em nenhum
  dos dois canais. No Telegram, o toque é respondido com um aviso curto e não entra na conversa.
- **Slug com mais de 57 caracteres não cabe no `start`.** O payload de `t.me/<bot>?start=` aceita
  até 64 caracteres, e `apoiar_` ocupa 7. O que fazer com esses slugs: a confirmar.
- **Ordem das histórias.** A história pede que este canal entre depois do canal do Evolution e
  reuse as peças comuns (escolha do canal, envio das respostas, simulador). Esta branch foi feita
  antes, então os pontos de encontro `apps/backend/src/bot/worker.ts`, `apps/backend/src/main.ts`
  e `apps/backend/src/config/env.ts` vão precisar ser conciliados quando o Evolution entrar.

## Quando reabrir

As lacunas acima são o que já se sabe que vai voltar à mesa. Fora elas, um gatilho de reabertura
(por exemplo, a Meta liberar a API oficial ou o Evolution ser banido antes da demonstração) não foi
combinado pela equipe: a confirmar.

## Fontes

- História SCRUM-267 no Jira.
- [Telegram Bot API](https://core.telegram.org/bots/api): `setWebhook` (`secret_token`), `getUpdates`,
  `sendMessage`, `getFile`, `KeyboardButton.request_contact`.
- [Deep linking](https://core.telegram.org/api/links#bot-links): o `start` aceita até 64
  caracteres de `A-Z a-z 0-9 _ -`.
- Panorama Mobile Time/Opinion Box, fevereiro de 2025: uso de apps de mensagem no Brasil.
