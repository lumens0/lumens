# Spec: SCRUM-275 — Canal de WhatsApp pela Evolution API

> Ticket: SCRUM-275 — Canal de WhatsApp pela Evolution API para a demonstração
> Contexto: a Cloud API da Meta não envia para o Brasil com nenhum número que o Lumens consegue ter
> ([decisão](../../decisoes/SCRUM-275-canal-evolution.md)). A demonstração em aula
> (~2026-11-25) usa um chip comum conectado à Evolution API, escolhido por variável de ambiente.

## Comportamento principal

- Um canal por implantação (`CANAL_BOT`, decisão do PR #132). Com `CANAL_BOT=whatsapp`,
  `CANAL_WHATSAPP` escolhe o provedor: `meta` (padrão) ou `evolution`. Com `evolution`, as
  `META_*` deixam de ser exigidas e o webhook da Meta não sobe; `EVOLUTION_WEBHOOK_SEGREDO` é
  obrigatória, e `EVOLUTION_URL` e `EVOLUTION_API_KEY` vão juntas. Fora do `pnpm dev`,
  `evolution` sem URL não sobe. Com `CANAL_BOT=telegram`, o `CANAL_WHATSAPP` não pesa.
- **Entrada.** `POST /webhook/evolution` exige `Authorization: Bearer <EVOLUTION_WEBHOOK_SEGREDO>`,
  comparado em tempo constante e antes de ler o corpo (401 sem ele). `messages.upsert` vira o
  mesmo `IncomingMessageJob` da Meta:

  | Evolution                                         | Meta (`type`)                                            |
  | ------------------------------------------------- | -------------------------------------------------------- |
  | `conversation`, `extendedTextMessage.text`        | `text`                                                   |
  | `contextInfo.isForwarded` (`forwardingScore > 4`) | `context.forwarded` (`frequently_forwarded`)             |
  | `imageMessage` (legenda)                          | `image`, com a mensagem inteira no `id`                  |
  | `documentMessage`, `documentWithCaptionMessage`   | `document`                                               |
  | áudio, vídeo, figurinha, local, contato           | o tipo, sem conteúdo (bot responde que só entende texto) |
  | reação, mensagens de protocolo                    | ignoradas                                                |

  O número de quem escreveu vem de `remoteJid`, `remoteJidAlt` ou `senderPn`, o primeiro que
  terminar em `@s.whatsapp.net`. A instância vai no `phoneNumberId`. O dedup usa o id da mensagem,
  na mesma transação do enqueue (500 em falha: a Evolution reenvia).

- **Ignorado, com 200:** grupos (`@g.us`), status (`status@broadcast`), canais, `fromMe`, conversa
  só com `@lid` (conta em `semNumero` e loga sem o LID) e eventos que não são de mensagem.
- **Status.** `messages.update` de mensagem do bot (`fromMe`) com `DELIVERY_ACK`, `READ`/`PLAYED`
  ou `ERROR` vira `delivered`, `read` ou `failed` na fila de status, pelo HMAC do id.
- **Respostas.** Cada `Resposta` sai como texto, na ordem, com `delay` ("digitando…", de 1 a 4 s) e
  `linkPreview: false`. Lista e botões viram:

  ```text
  <corpo>

  *1.* Título — descrição
  *2.* Título

  Responda com o número da opção.
  ```

- **Último menu.** Depois de cada mensagem, o worker guarda na conversa (cifrado, em
  `conversa.dados.menuEmTexto`) as opções da última resposta interativa do turno, ou apaga se não
  houve nenhuma. Na mensagem seguinte, "2", "2.", "2)" ou o título (sem caixa nem acento) viram o
  `id` da opção antes de a conversa ver o texto. Número fora do menu e texto que não casa passam
  como vieram. Foto e documento não são traduzidos.
- **Menu principal depois de menu numerado.** Neste canal, o `MENU_TEXT` que o router acrescenta
  depois de botões ou lista sai das respostas (seriam duas numerações seguidas).
- **Avisos.** O worker de disparos é o mesmo. Com `evolution`:
  - só reserva quem tem `conversa` atualizada nas últimas 24h; os outros ficam pendentes;
  - limite de `EVOLUTION_LIMITE_PESSOAS` pessoas por 24h (padrão 30) e
    `EVOLUTION_AVISOS_POR_LOTE` por lote (padrão 2, um lote por minuto);
  - a mensagem modelo vira texto (corpo com as variáveis, link "Ver a pauta: <site>/p/<slug>",
    "Responda _Sim_, _Em parte_ ou _Não_." e o rodapé), com abertura sorteada;
  - intervalo sorteado entre `EVOLUTION_INTERVALO_MIN_S` e `EVOLUTION_INTERVALO_MAX_S` desde o
    aviso anterior (padrão 20 a 45 s), e "digitando…" antes;
  - erros: número sem WhatsApp e pedido recusado (400/422) tiram o disparo da fila com
    `evolution:<código>`; instância desconectada, chave errada, 404, 5xx e rede param o lote.
- **Mídia.** A foto e o PDF baixam por `getBase64FromMediaMessage` com a mensagem inteira. O
  `fileLength` é conferido antes e os bytes depois; tipo, EXIF e storage continuam no
  `ServicoDeFotos` e no `ServicoDeRespostas`.

## Critérios de aceitação

- [ ] Spike registrado: mensagens 1:1 chegam com o número real (ou a decisão alternativa está
      documentada).
- [ ] Mensagem de texto real chega e gera resposta no WhatsApp (depende do chip).
- [x] Imagem e encaminhada seguem o mesmo fluxo da Meta; a foto passa pelos limites e pela remoção
      de EXIF (`ServicoDeFotos` sem mudança).
- [x] O webhook recusa sem o segredo e ignora grupos, status e `fromMe`.
- [x] A mesma mensagem duas vezes gera uma resposta só.
- [x] O menu numerado resolve para o mesmo `id` do botão.
- [x] Aviso só sai para quem escreveu nas últimas 24h, no ritmo configurado.
- [x] Erro permanente tira o aviso com o motivo; erro de instância para o lote.
- [x] `CANAL_WHATSAPP=meta` mantém o comportamento atual (testes da Meta sem mudança).
- [x] Troca de chip não perde dados do estudante: o estudante é achado pelo telefone dele, e o
      número do bot não é guardado em lugar nenhum além da sessão da Evolution.
- [x] Evolution na VM sem porta pública, versão fixada, sessão em volume, sem guardar mensagens nem
      contatos.
- [x] `pnpm sim` funciona no formato da Evolution.

## Contextuais

- **Atores:** estudantes no WhatsApp; a equipe, que pareia e troca o chip.
- **Casos de borda:** LID com e sem número; número com dispositivo (`…:12@s.whatsapp.net`);
  `fileLength` como texto ou `Long`; menu com título cortado em "…"; conversa apagada no turno
  (`sair`), que não deve ganhar menu de volta; VM desligada.
- **Fora de escopo:** apagar o código da Meta; Telegram; grupos; botões nativos da Baileys.
