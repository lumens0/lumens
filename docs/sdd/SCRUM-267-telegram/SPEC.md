# Spec: SCRUM-267 — Canal do Telegram como reserva do bot

> Ticket: SCRUM-267 — Canal do Telegram como reserva do bot
> Contexto: a API oficial do WhatsApp está travada na Meta (número de teste sem envio para o
> Brasil, limite de contas do portfólio, portfólio novo recusado). A demonstração para a turma
> (por volta de 25/11/2026) vai pelo WhatsApp não oficial (Evolution API); o Telegram fica de
> reserva, com a mesma conversa. Decisão: [SCRUM-267](../../decisoes/SCRUM-267-canal-telegram.md).

## Comportamento principal

- **Mesma conversa, outra porta.** O update do Telegram vira o mesmo job da fila que o webhook da
  Meta gera; a conversa não sabe de onde a mensagem veio. Botão tocado (`callback_query`) chega
  como o texto do id, e `/start <payload>` chega como o comando que o link do site manda no
  WhatsApp (`nova` → `nova pauta`, `apoiar_<slug>` → `apoiar <slug>`, `ajudar_<slug>` →
  `ajudar <slug>`; `/start` sozinho ou com payload desconhecido → `menu`).
- **Um canal por implantação.** `CANAL_BOT` escolhe `whatsapp` (padrão) ou `telegram`; só o canal
  escolhido sobe. Nunca os dois ao mesmo tempo.
- **Identidade pelo chat.** No Telegram a pessoa é o chat: a chave é o HMAC de `tg:<chat_id>`, e o
  chat id cifrado é o endereço dela. O telefone não é pedido.
- **Mescla pelo e-mail.** Quem se verificou num canal e, depois da troca, acerta o código do mesmo
  e-mail da UFAL no outro continua sendo o mesmo estudante: apoios, pautas e verificação ficam.
  Duas identidades que já têm cadastro com o mesmo e-mail continuam recusadas (`email_em_uso`).
- **Saída.** As respostas viram `sendMessage` em texto puro: botões e listas viram teclado inline
  (um botão por linha, `callback_data` = id do botão), o `*negrito*` vira `entities`, e nunca há
  `parse_mode`. Texto acima de 4096 caracteres é dividido, com o teclado na última parte.
- **Avisos.** Saem pelo canal ativo, com o texto do catálogo de modelos. No Telegram, sem o limite
  de 250 pessoas/24h da Meta; `sendMessage` aceito vale como enviado e entregue; 403 (bot
  bloqueado) é falha permanente.
- **Mídia.** Foto (a maior resolução) e documento chegam pelo `file_id` e são baixados com o
  `getFile`, até o limite de 20 MB da Bot API.
- **Configuração.** O canal liga com `CANAL_BOT=telegram`, que exige o `TELEGRAM_BOT_TOKEN`. Em `TELEGRAM_MODO=webhook` (padrão) a
  rota `POST /telegram/webhook` confere o `X-Telegram-Bot-Api-Secret-Token`; em
  `TELEGRAM_MODO=polling` o back-end busca os updates com `getUpdates` e a rota não existe.

## Critérios de aceitação

Da história, como escritos no Jira. Marcado só o que tem teste apontável; todos os testes usam
uma Bot API falsa (nada foi exercitado contra o Telegram de verdade).

- [ ] Conversa completa pelo Telegram, com listas e botões como teclado inline nativo.
      _As peças têm teste — botões e listas em teclado inline (`bot/telegram/sender.test.ts`),
      toque no botão como texto (`bot/telegram/update.test.ts`), resposta pelo canal do job
      (`bot/worker.test.ts`) — mas nenhum teste percorre uma conversa inteira pelo Telegram._
- [~] ~~Contato compartilhado de outra pessoa (contact.user_id diferente de from.id) é recusado.~~
  _Substituído pela decisão do time (revisão do PR): o Telegram não pede contato; a identidade
  é o chat (`apps/backend/src/bot/telegram/update.test.ts`, "a chave é o HMAC de
  tg:<chat_id>")._
- [~] ~~Com o mesmo telefone, a pessoa é o mesmo estudante no WhatsApp e no Telegram (mesmo
  hashPhone).~~ _Substituído: a mesma pessoa é o mesmo estudante pelo e-mail da UFAL —
  `packages/dominio/src/estudante/verificacao.test.ts` ("o cadastro passa para ela, com o
  apoio") e `apps/backend/src/bot/conversation/verificacao.test.ts` ("o cadastro passa para
  esta (troca de canal)")._
- [x] Webhook sem o X-Telegram-Bot-Api-Secret-Token correto é recusado.
      — `apps/backend/src/bot/telegram/routes.test.ts` ("sem segredo ou com segredo errado → 401 e
      nada na fila").
- [x] Aviso chega a quem falou com o bot; quem bloqueou o bot (erro 403) sai da fila como falha
      permanente. — `apps/backend/src/bot/telegram/avisos.test.ts` (aceito vale como entregue; 403
      é falha permanente) e `apps/backend/src/bot/envio/worker.test.ts` ("com CANAL_BOT=telegram":
      "manda para o chat id"; "403 tira só aquele disparo da fila, de vez").
- [~] ~~O canal liga só quando TELEGRAM_BOT_TOKEN está definido e convive com o WhatsApp.~~
  _Substituído: o canal liga com `CANAL_BOT=telegram` e não convive com o WhatsApp —
  `apps/backend/src/config/env.test.ts` ("canal do bot (CANAL_BOT)")._
- [ ] Testes falham sem a implementação; pnpm sim aceita o formato do Telegram.
      _A segunda metade tem teste (`apps/backend/src/bot/sim/telegram.test.ts`: construtores e
      fixtures passam no `updateSchema` real). A primeira não foi verificada: ninguém rodou os
      testes contra o código sem a implementação._
- [ ] Registro de decisão em docs/decisoes/ e SDD em docs/sdd/.
      _Os documentos existem ([decisão](../../decisoes/SCRUM-267-canal-telegram.md) e este SDD),
      mas não é critério com teste; a aprovação está pendente no [README](README.md#aprovação)._

**Corte para a demonstração** (da história): a migração do chat id, os avisos e as fotos podem
ficar para depois; a demonstração só precisa da conversa.

## Contextuais

- **Atores:** estudante no app do Telegram, em chat privado com o bot; o dev, pelo simulador.
- **Casos de borda:** update de grupo, canal ou de outro bot (ignorado); botão de aviso sem
  tratamento (respondido com um aviso curto, não entra na conversa); `update_id` repetido (dedup);
  arquivo acima de 20 MB; 429 com `retry_after`; texto com emoji no limite de corte; `callback_data`
  acima de 64 bytes; slug acima de 57 caracteres no `start`; troca de canal no meio de um fluxo (a
  conversa recomeça; o cadastro fica); a mesma pessoa em duas contas do Telegram (duas identidades:
  a segunda recebe `email_em_uso` se a primeira já tem cadastro com o e-mail).
- **Fora de escopo:** o canal do Evolution e a decisão sobre ele; tratar "Apoiar" e as respostas
  rápidas da conferência (lacunas em todos os canais); qualquer mudança no comportamento do WhatsApp
  oficial.

## Padrões aplicáveis

- Nenhum catálogo `.agent/patterns/`. Segue o webhook da Meta (`apps/backend/src/bot/webhook/`):
  dedup e enfileiramento antes do 200, numa transação curta; nada em claro no banco nem no log.
