# Plano: SCRUM-275 — Canal de WhatsApp pela Evolution API

> Aprovação: pendente.

## Abordagem

A conversa já não depende do canal (`Resposta` em `resposta.ts`), e a Meta entra e sai por três
pontos: o webhook, o `ReplySender`/`ModeloSender` e o download da mídia. O canal novo troca só
esses pontos. Ele converte o que chega para o formato da Meta e usa o mesmo `enfileirar`. Assim
dedup, cifra, ordem por conversa e retry não ganham uma segunda versão.

As peças novas fora da pasta da Evolution, sem nada específico dela:

| Peça                                 | Onde                                                    |
| ------------------------------------ | ------------------------------------------------------- |
| Menu numerado e tradução para o `id` | `apps/backend/src/bot/canais/menu-em-texto.ts`          |
| Ritmo e filtro da fila               | `maximo` e `somenteQuemEscreveuDesde` em `reservarLote` |
| Provedor do WhatsApp                 | `CANAL_WHATSAPP` em `config/env.ts` e `main.ts`         |

**Em cima do Telegram (PR #132).** O Telegram entrou primeiro e definiu as peças compartilhadas;
este canal as usa em vez de criar outras:

- **um canal por implantação** (`CANAL_BOT=whatsapp|telegram`, decisão do time no PR #132). A
  Evolution é um provedor do WhatsApp (`CANAL_WHATSAPP=meta|evolution`), e o `canalDoEnv` devolve
  `whatsapp-evolution`. Com ela, as `META_*` deixam de ser exigidas e o webhook da Meta não sobe;
- os avisos implementam o `AvisoSender` sobre o `AvisoRenderizado` (`envio/aviso.ts`), e os erros
  estendem o `ErroDeEnvio` de `envio/sender.ts`. Só o texto do aviso é próprio (`textoDoAviso`),
  porque o Telegram manda os botões como teclado inline;
- a fila separa os estudantes por canal (`reservarLote` com `canal`); a Evolution passa
  `whatsapp`, e o teto por lote e o filtro de 24h entram ao lado.

O código da Evolution fica em `apps/backend/src/bot/canais/evolution/` (`cliente`, `webhook`,
`respostas`, `avisos`, `midia`, `index`). Nos arquivos compartilhados entraram só acréscimos:
`export` em três itens de `webhook/process.ts`, o `menusEmTexto` no `WorkerDeps`, o `evolution`
no `AppDeps`, o provedor no `canalDoEnv` e o ramo dela no `main.ts`.

## Fontes e decisões

- **Último menu sem migration.** Ele fica em `conversa.dados.menuEmTexto`: expira com a conversa
  (24h), some no `sair` e na limpeza diária.
- **"Escreveu nas últimas 24h" com migration (`0015_ultima_mensagem_do_estudante`).** A coluna
  `estudante.ultima_mensagem_em` é gravada pelo worker em toda mensagem, entendida ou não, na
  mesma transação. A primeira versão usava `conversa.atualizado_em`, e a revisão do Codex mostrou
  o furo: áudio, figurinha e foto fora de hora não passam pela conversa e não a atualizam, e a
  conversa expira. A coluna é nula para quem nunca escreveu desde a migração (o ambiente funciona
  com o canal ligado ou desligado) e o `sair` a apaga.
- **Menu cifrado.** Os títulos podem ser de pauta ainda em curadoria (`minhas-pautas`).
- **Último menu = última resposta interativa do turno.** Texto depois do menu não o apaga. A
  exceção é o `MENU_TEXT` que o router acrescenta quando o fluxo volta ao menu ("Vou ajudar"):
  neste canal ele sai, porque seriam duas numerações seguidas. As opções desses botões
  (`ajudar <id>`, `menu`) são comandos globais e funcionam a partir do menu.
- **Mídia sem banco na Evolution.** O job leva a mensagem inteira (chave e `imageMessage`) como
  `image.id`, cifrada como todo o conteúdo. A Evolution baixa por ela
  (`getBase64FromMediaMessage` aceita a mensagem no lugar de buscar no banco), e o banco dela não
  guarda mensagens.
- **Erros.** 400 com `exists: false` é número sem WhatsApp (permanente); qualquer resposta com
  "Connection Closed" ou parecida é instância desconectada (para o lote, mesmo vindo como 400). A
  mensagem do erro nunca leva o corpo da resposta, que traz o número.
- **Segredo antes do corpo.** O `onRequest` da rota recusa sem o segredo antes do parser de JSON.
  Os dois lados viram SHA-256 antes do `timingSafeEqual`, então o tamanho também não vaza.
- **Caddy fecha a rota.** O webhook chega pela rede interna (`http://backend:3000`); a internet
  recebe 404 em `/webhook/evolution*`.
- **Log da Evolution desligado.** A v2.3.7 faz `console.log` de toda mensagem recebida.
- **Ritmo no sender, cota na fila.** A fila decide quem e quantos (`maximo`, filtro de 24h,
  limite de pessoas); o sender decide quando (intervalo desde o último envio).

## Passos

1. Spike local da Evolution (feito sem chip) e leitura do código da v2.3.7.
2. Peças compartilhadas, com testes.
3. Canal da Evolution: cliente, webhook, respostas, avisos, mídia.
4. Simulador e fixtures.
5. Infra, runbook e docs.
6. Spike com o chip pareado; ajustes no formato, se houver.
7. `pnpm check` e build; rebase na `origin/main` antes do PR.

## Riscos

- **O spike mostrar mensagem sem número.** Mitigação: o bot ignora e loga; a decisão volta para a
  equipe com as saídas (LID como chave, consulta do número).
- **Formato real diferente do lido no código.** Mitigação: construtores do simulador num lugar só,
  `safeParse` que ignora em vez de quebrar, e teste de ponta a ponta para refazer rápido.
- **Banimento.** Mitigação: regras de ritmo, chip reserva, runbook de troca.
