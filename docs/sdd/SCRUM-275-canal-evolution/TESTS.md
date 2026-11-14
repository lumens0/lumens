# Plano de testes — SCRUM-275: Canal de WhatsApp pela Evolution API

Linguagem/framework: TypeScript, Vitest, PGlite (`criarBancoEmMemoria`), `app.inject` do Fastify
Exemplos do repo usados como base: `bot/webhook/webhook.test.ts`, `bot/envio/sender.test.ts`,
`bot/worker.test.ts`, `packages/dominio/src/avisos/fila.test.ts`
Oráculo: o código da Evolution v2.3.7 (formato dos eventos e das respostas de erro), o
comportamento atual do canal da Meta (o mesmo job, o mesmo input para a conversa) e as regras da
decisão.

## Casos — webhook (`bot/canais/evolution/webhook.test.ts`)

- [segurança] **sem header, outro segredo, segredo sem `Bearer`** → 401 e nada na fila.
- [segurança] **JSON quebrado sem segredo** → 401: o corpo não chega ao parser.
- [principal] **texto 1:1** vira o job da Meta: `phoneHmac` = `hashPhone(número)`, id em HMAC,
  instância no `phoneNumberId`, telefone cifrado e ausente em claro no job.
- [LID] **`@lid` com o número em `remoteJidAlt`** → vale o número.
- [LID] **só `@lid`** → 200, nada na fila, log "sem número" sem o LID.
- [filtro] **grupo, `fromMe`, `status@broadcast`, reação, outro evento** → 200 e nada na fila.
- [dedup] **mesmo id duas vezes** → um job e uma linha em `mensagem_processada`.
- [conteúdo] **encaminhada** com `forwardingScore` 5 → `forwarded` e `frequently_forwarded`.
- [conteúdo] **imagem** → a referência é a mensagem inteira (chave, `mediaKey`, `directPath`), com
  a legenda.
- [conteúdo] **áudio** → entra como `audio` (a conversa responde que só entende texto).
- [status] **`messages.update` do bot** → status `delivered` pelo HMAC do id; de outra pessoa,
  nada.
- [formato] **payload fora do formato** → 200 sem nada na fila.
- [regressão] **o webhook da Meta continua respondendo** ao lado.

## Casos — de ponta a ponta (`bot/canais/evolution/fluxo.test.ts`)

- [principal] webhook → fila → conversa → envio pela Evolution (só o HTTP é falso): o aviso de
  privacidade e o menu numerado saem para o número de quem escreveu, e "2" chega à conversa como o
  `id` da segunda opção.

## Casos — menu em texto (`bot/canais/menu-em-texto.test.ts`, `bot/worker.test.ts`)

- [render] lista com descrição e botões viram linhas numeradas com a dica.
- [turno] vale o último menu do turno; turno só de texto não deixa menu.
- [escolha] `2`, `3`, `1.`, `2)`, título sem acento ou em caixa alta escolhem; `0`, `4`, `12`,
  título parcial, vazio e `menu` não.
- [escolha] título cortado em "…" casa sem as reticências.
- [menu principal] o `MENU_TEXT` depois de botões sai; sem menu antes, fica.
- [worker] **"2" chega como o `id`, igual ao toque no botão** (comparado com um `list_reply`).
- [worker] título digitado escolhe; depois de uma resposta sem menu, "2" é "2".
- [regressão] **canal da Meta:** "2" é "2" e nada é guardado na conversa.
- [privacidade] o menu guardado não tem título nem `id` em claro.

## Casos — envio (`bot/canais/evolution/sender.test.ts`, `midia.test.ts`)

- [cliente] rota da instância com a `apikey`.
- [erros] número sem WhatsApp e 400 permanentes; desconectada (mesmo em 400), 401 e 502 param o
  lote; rede para o lote. A mensagem do erro nunca tem o número.
- [respostas] ordem, telefone decifrado, `delay` e `linkPreview: false`; lista numerada.
- [respostas] falha sobe para o retry; "digitando" entre 1 e 4 s.
- [avisos] texto do aviso (`textoDoAviso`): corpo do catálogo, respostas rápidas digitáveis
  ("Responda _Sim_, _Em parte_ ou _Não_."), rodapé, nenhum `{{n}}` sobra; o botão de link vira o
  endereço da pauta.
- [avisos] o id da mensagem volta como `id`, com `entregue: false` (a entrega vem pelo
  `messages.update`); sem espera no primeiro.
- [avisos] **intervalo sorteado desde o aviso anterior** (relógio falso): espera só o que falta.
- [avisos] a abertura varia e o corpo é o mesmo; resposta sem id para o lote; telefone ilegível
  sai da fila sem chamar a Evolution.
- [mídia] pede pela mensagem inteira; `fileLength` acima do limite recusa sem baixar (inclusive
  `Long`); bytes acima do limite recusam; erro da Evolution, resposta sem base64 e referência
  ilegível viram "indisponível".

## Casos — fila e worker de avisos

- [fila] `somenteQuemEscreveuDesde`: só quem escreveu dentro da janela é reservado; os outros ficam
  pendentes, sem reserva nem falha, e saem quando escrevem.
- [fila] `maximo`: o lote corta na ordem e o resto sai no lote seguinte.
- [worker] erro permanente de outro canal grava `evolution:numero_inexistente`.
- [worker] teto por lote e filtro chegam à reserva.

## Casos — última mensagem do estudante (`estudante/ultima-mensagem.test.ts`, `bot/worker.test.ts`)

- [domínio] grava o instante; mensagem atrasada na fila não volta o relógio; quem não tem
  cadastro não grava nada.
- [regressão] **texto, áudio e foto fora de hora** contam como mensagem recebida no worker. O
  áudio não passa pela conversa; antes, quem só mandava áudio ficava sem os avisos (revisão do
  Codex no PR #133).
- [privacidade] o `sair` apaga o `ultima_mensagem_em` (`estudante/sair.test.ts`).

## Casos — ambiente (`config/env.test.ts`)

- [padrão] sem `CANAL_WHATSAPP` é `meta`, sem exigir nada da Evolution.
- [negativo] `evolution` sem segredo, ou com segredo curto; URL sem chave; intervalo invertido;
  canal desconhecido.
- [padrão] `evolution` só com o segredo vale, com os padrões de ritmo.

## Casos — simulador (`bot/sim/sim.test.ts`)

- [fixtures] `evolution-*.json` batem com os construtores.

## Lacunas conhecidas

- **Nada aqui fala com a Evolution de verdade.** O formato foi tirado do código da v2.3.7; o spike
  com o chip é que prova. Os testes falhariam sem a implementação, mas passariam com uma
  implementação que lê um formato que a Evolution não manda.
- O ritmo dos avisos é testado com relógio falso; o comportamento do WhatsApp diante dele, não.
- A configuração do compose, do Caddy e do deploy foi conferida com `docker compose config` e
  `caddy adapt`, não numa VM.
