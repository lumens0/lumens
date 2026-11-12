# SCRUM-267 · Teste local do canal do Telegram

Roteiro para rodar o bot do Telegram na sua máquina, do zero, antes de subir a branch
`feat/SCRUM-267-telegram`. Nada aqui foi executado contra a Bot API real ainda: os testes
automatizados usam uma API falsa. Este roteiro é a primeira conferência de verdade.

Marque cada passo. Se algum falhar, pare e anote o que apareceu no terminal do back-end.

## 0. Pré-requisitos

- [ ] Docker Desktop aberto (o Postgres sobe por ele).
- [ ] Node e pnpm instalados; `pnpm install` na raiz.
- [ ] Telegram no celular, com a sua conta.
- [ ] `.env` e `.env.database` na raiz (copie dos `.example` se ainda não existirem), com
      `CHAVE_CIFRA` e `CHAVE_HMAC` preenchidas.
- [ ] Não precisa de SMTP: no `pnpm dev` o e-mail não é enviado, e o código de verificação aparece
      no log do back-end. As `EMAIL_*` só não podem ficar vazias (os valores de exemplo do
      `.env.example` servem).

## 1. Criar o bot no BotFather

- [ ] No Telegram, abra `@BotFather` e mande `/newbot`.
- [ ] Escolha um nome e um usuário terminado em `bot` (ex.: `LumensDevSeuNomeBot`). Use um bot só
      seu, de desenvolvimento: dois back-ends em `polling` com o mesmo token brigam pelas mensagens
      (erro 409).
- [ ] Guarde o token. Ele é um segredo: não cole em chat, issue nem commit.

## 2. Configurar o `.env`

Na raiz, no `.env`:

```sh
CANAL_BOT=telegram
TELEGRAM_BOT_TOKEN=<token do BotFather>
TELEGRAM_MODO=polling
TELEGRAM_WEBHOOK_SECRET=
```

- [ ] Com `CANAL_BOT=telegram`, as `META_*` são ignoradas: só o Telegram sobe.
- [ ] Confira a configuração sem subir nada:

```sh
pnpm --filter @lumens/backend env:check
```

## 3. Banco

Se você já rodou uma versão anterior desta branch, o banco local tem a migration `0014`, que saiu.

- [ ] Nesse caso, recrie o banco local (**apaga todos os dados locais**):

```sh
pnpm db:fresh
```

- [ ] Senão, basta `pnpm db:up` e `pnpm db:migrate`.

## 4. Conferência automática

- [ ] Rode tudo antes de testar à mão:

```sh
pnpm typecheck
```

```sh
pnpm test
```

```sh
NODE_OPTIONS=--max-old-space-size=8192 pnpm exec eslint . --ignore-pattern ".claude/**"
```

O `pnpm lint` puro estoura a memória porque entra em `.claude/worktrees/`; por isso o comando
acima. Não deixe o computador dormir durante o `pnpm test`: os testes do back-end falham por tempo.

## 5. Subir o back-end e conversar

- [ ] Suba:

```sh
pnpm dev
```

- [ ] No log não deve aparecer erro de `getUpdates`. Um 401 é token errado; um 409 é outro processo
      usando o mesmo token.

No Telegram, com a sua conta, abra o bot e siga o roteiro:

| #   | Você faz                                         | O bot deve                                                                            |
| --- | ------------------------------------------------ | ------------------------------------------------------------------------------------- |
| 1   | Toca em **Iniciar** (`/start`)                   | Mostrar o aviso de privacidade e o menu, sem pedir o telefone                         |
| 4   | Segue a verificação com um e-mail da UFAL        | Pedir o código; copie-o do log do `pnpm dev` (linha "código de verificação") e digite |
| 5   | Cria uma pauta até o fim (categoria, texto, etc) | Mostrar botões inline em cada escolha e registrar a pauta                             |
| 6   | Manda uma foto quando o fluxo pedir              | Aceitar a foto (baixa pelo `getFile`)                                                 |
| 7   | Toca num botão antigo, de uma mensagem anterior  | Responder sem travar a conversa (o "relógio" do botão some)                           |
| 8   | Manda `menu` e depois `cancelar` no meio de algo | Voltar ao menu / cancelar                                                             |
| 9   | Manda `sair` e confirma                          | Apagar o cadastro; a próxima mensagem começa do zero                                  |

- [ ] Negrito: os trechos com `*asteriscos*` devem aparecer em negrito, sem os asteriscos.
- [ ] Mensagem longa (lista de pautas grande) chega inteira, dividida se passar de 4096 caracteres.

## 6. Troca de canal: o mesmo estudante pelo e-mail

Sem o WhatsApp funcionando, confira pelo simulador:

- [ ] Com `CANAL_BOT` vazio (WhatsApp; as `META_*` com qualquer valor de teste), verifique um e-mail
      da UFAL pelo simulador no formato da Meta e apoie uma pauta.
- [ ] Troque para `CANAL_BOT=telegram`, suba de novo e verifique **o mesmo e-mail** pelo Telegram.
- [ ] Deve continuar o mesmo estudante: no banco, o `estudante` tem o mesmo `id`, com o
      `telefone_hmac` novo, e o apoio continua lá. Apoiar a mesma pauta de novo não conta.

## 8. Simulador no formato do Telegram

O simulador faz `POST` em `/telegram/webhook`, que só existe em `TELEGRAM_MODO=webhook`.

- [ ] Pare o back-end, troque no `.env`:

```sh
TELEGRAM_MODO=webhook
TELEGRAM_WEBHOOK_SECRET=<gere com: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))">
```

- [ ] Suba de novo (`pnpm dev`) e rode:

```sh
pnpm sim start --canal telegram
```

```sh
pnpm sim texto 'oi' --canal telegram --secret segredo-errado
```

- [ ] O primeiro é aceito. O último deve ser recusado pelo webhook (401): é o critério do segredo.
- [ ] As respostas do bot para o chat fictício `900000001` falham no envio; é esperado. Para vê-las
      no seu celular, passe `--chat <seu chat id>`.
- [ ] Mais comandos em [`apps/backend/SIMULADOR.md`](../../../apps/backend/SIMULADOR.md).
- [ ] Volte o `.env` para `TELEGRAM_MODO=polling` ao terminar.

## 9. Avisos (pode ficar para depois da demo)

- [ ] Depois de se verificar pelo Telegram (passo 5), provoque um aviso. O mais simples: crie uma pauta
      e recuse-a pela curadoria; a pessoa autora recebe o aviso de recusa.
- [ ] O aviso sai pelo worker da fila, que roda por agendamento: pode levar alguns minutos.
- [ ] Deve chegar no Telegram como texto, com o botão "Ver a pauta". O link aponta para o site de
      produção, não para o `localhost`.
- [ ] Bloqueie o bot no Telegram e provoque outro aviso: o disparo deve falhar de vez (403), sem
      novas tentativas.

## 10. Site (fora do ticket, opcional)

- [ ] Em `apps/site/.env.local`:

```sh
NEXT_PUBLIC_CANAL_BOT=telegram
NEXT_PUBLIC_TELEGRAM_BOT=<usuário do bot, sem @>
```

- [ ] `pnpm --filter @lumens/site dev` e abra `http://localhost:3000`.
- [ ] Os botões "Apoiar", "Relatar um problema" e "Vou ajudar" abrem `https://t.me/<bot>?start=...`.
- [ ] Limitação conhecida: o bot ainda não trata `apoiar <slug>` em nenhum canal; o link abre a
      conversa, mas cai no menu.

## 11. Antes de subir para o GitHub

- [ ] Passos 4, 5, 6 e 8 passaram.
- [ ] `git status`: o `.env` não está na lista. Não inclua `.claude/`, `.mcp.json`, `docs/logo/` nem
      `docs/redesign/`.
- [ ] O token do bot não aparece em nenhum arquivo versionado:

```sh
git grep -n "bot[0-9]\{8,\}:" -- . ':!pnpm-lock.yaml'
```

- [ ] O ticket pede que este canal entre depois do canal da Evolution. Antes do merge, combine com o
      time: se a Evolution já estiver na `main`, faça o rebase e resolva `main.ts` e `config/env.ts`
      (`CANAL_BOT`).
- [ ] Decida se os links do site (passo 10) vão neste PR ou em outro: estão fora do escopo do ticket.
- [ ] Marque no [`SPEC.md`](./SPEC.md) os critérios que este roteiro confirmou.

## Depois: webhook em homologação

Em produção o modo é `webhook`. O back-end **não** chama o `setWebhook`; quem registra é você, uma
vez, com a URL pública e o mesmo segredo do `.env.producao`:

```sh
curl "https://api.telegram.org/bot<TOKEN>/setWebhook" -d "url=https://<host>/telegram/webhook" -d "secret_token=<TELEGRAM_WEBHOOK_SECRET>" -d 'allowed_updates=["message","callback_query"]'
```

Use um bot de produção separado do bot de desenvolvimento: o modo `polling` chama `deleteWebhook`
ao subir e derrubaria o webhook de produção se o token fosse o mesmo.
