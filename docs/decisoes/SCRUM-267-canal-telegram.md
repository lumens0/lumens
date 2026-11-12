# SCRUM-267 · Telegram como canal reserva do bot

História · 2026-11-12 · @guilhermek32
**Situação:** decidido; implementação na branch `feat/SCRUM-267-telegram`, aguardando revisão. O canal
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

**O Telegram entra como canal reserva, sem apagar o código da Meta. O bot tem um canal só por
implantação**, escolhido por `CANAL_BOT` (`whatsapp`, o padrão, ou `telegram`). Não há WhatsApp e
Telegram ligados ao mesmo tempo. A conversa é a mesma; muda só a entrada e a saída.

Revisão de 2026-11-12: a primeira versão desta decisão deixava os canais convivendo e usava o
telefone compartilhado (`request_contact`) como identidade. O time decidiu pelo canal único e pela
mescla pelo e-mail, abaixo. Com isso saíram o pedido de contato, a tabela `chat_telegram`, a coluna
`disparo.canal` e o problema do nono dígito.

### Identidade: o chat no Telegram, o e-mail entre canais

- **No Telegram, a identidade é o chat.** O `phoneHmac` do job (e o `telefone_hmac` do estudante)
  é o HMAC de `tg:<chat_id>`; o prefixo impede que coincida com o HMAC de um telefone. O chat id
  cifrado vai em `telefone_cifrado`: é o endereço do estudante no canal ativo, e é de lá que os
  avisos tiram o destino. O telefone não é pedido: não tem função no Telegram (minimização, LGPD).
- **Quem prova a identidade é o e-mail da UFAL.** A pessoa que se verificou num canal e, depois da
  troca de canal, acerta o código do mesmo e-mail no outro continua sendo o mesmo estudante: o
  cadastro troca de chave (`vincularEmail`). Apoios, pautas, curso e `verificado_em` ficam; não há
  voto duplicado nem o mesmo e-mail verificado duas vezes.
- **Duas identidades com cadastro e o mesmo e-mail** continuam recusadas (`email_em_uso`): juntar
  dois cadastros pediria uma regra para os apoios dos dois.

### Avisos

- O aviso sai pelo canal ativo, para o `telefone_cifrado` do estudante. A fila (`reservarLote`) é
  a mesma da `main`.
- **O limite é configuração do canal.** No WhatsApp, o da Meta (`META_LIMITE_PESSOAS`, 250 pessoas
  por 24h, SCRUM-191). No Telegram não há cota: o ritmo fica com o `telegramAvisoSender` (30/s no
  total, 1/s por chat, `retry_after` no 429).
- **403 (bot bloqueado) é falha permanente**: o aviso sai da fila em vez de voltar no retry.
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
- **O canal só liga com `CANAL_BOT=telegram`**, e aí o `TELEGRAM_BOT_TOKEN` é obrigatório. Sem
  ele (o padrão), nada do Telegram roda, e o WhatsApp funciona como na `main`.

## O que esta decisão muda

- O adendo de 2026-11-12 da [SCRUM-192](SCRUM-192-canal-avisos.md) falava em um cadastro por canal
  (`estudante.canal`). Vale esta decisão: um canal por implantação, e o cadastro passa de um canal
  para o outro pelo e-mail.

## Lacunas conhecidas

- **Nada foi exercitado contra a Bot API real.** Os testes usam um `fetch` falso e o simulador
  fala com o back-end local.
- **"Apoiar" ainda não é tratado pelo bot**, em nenhum canal. O link do site manda o
  comando, mas a conversa ainda não o executa.
- **Os botões de resposta rápida dos avisos** (os da conferência) não têm quem os trate em nenhum
  canal. No Telegram, o toque é respondido com um aviso curto e não entra na conversa.
- **Slug com mais de 57 caracteres não cabe no `start`.** O payload de `t.me/<bot>?start=` aceita
  até 64 caracteres, e `apoiar_` ocupa 7. O que fazer com esses slugs: a confirmar.
- **Ordem das histórias.** A história pede que este canal entre depois do canal do Evolution. Esta
  branch foi feita antes; os pontos de encontro são `apps/backend/src/main.ts` e
  `apps/backend/src/config/env.ts` (`CANAL_BOT`, `canalDoEnv`), e o Evolution acrescenta o valor
  dele ao mesmo `CANAL_BOT`.

## Quando reabrir

As lacunas acima são o que já se sabe que vai voltar à mesa. Fora elas, um gatilho de reabertura
(por exemplo, a Meta liberar a API oficial ou o Evolution ser banido antes da demonstração) não foi
combinado pela equipe: a confirmar.

## Fontes

- História SCRUM-267 no Jira.
- [Telegram Bot API](https://core.telegram.org/bots/api): `setWebhook` (`secret_token`), `getUpdates`,
  `sendMessage`, `getFile`.
- [Deep linking](https://core.telegram.org/api/links#bot-links): o `start` aceita até 64
  caracteres de `A-Z a-z 0-9 _ -`.
- Panorama Mobile Time/Opinion Box, fevereiro de 2025: uso de apps de mensagem no Brasil.
