# Lumens

[![CI](https://github.com/lumens0/lumens/actions/workflows/ci.yml/badge.svg)](https://github.com/lumens0/lumens/actions/workflows/ci.yml)

Sistema de pautas estudantis da UFAL: **da reclamação à pauta**. São dois canais sobre um banco só:
um **bot de WhatsApp**, onde o estudante relata, apoia e cobra, e um **site público**, onde qualquer
pessoa acompanha as pautas, as conquistas e a atividade.

Projeto da disciplina Projeto e Desenvolvimento de Sistemas (PDS) · IC · UFAL.

## Stack

- **Back-end:** Node.js + TypeScript (bot, agendador e API num serviço só)
- **Banco:** PostgreSQL
- **Site e painel:** dois apps Next.js separados
- **Hospedagem:** site na Vercel; back-end, painel e banco numa VM da Azure, atrás do Caddy
  (por que não a AWS: [homologação](docs/operacao/homologacao.md))
- **Monorepo:** pnpm workspaces · **Testes:** Vitest e Playwright · **Qualidade:** ESLint + Prettier

## Estrutura

As dependências apontam para dentro: os apps usam `@lumens/dominio`, que usa `@lumens/db`. Nenhum
pacote importa um app, e só o domínio grava nas tabelas de negócio.

```
lumens/
├── apps/                       o que roda (cada um com o seu package.json)
│   ├── backend/                Fastify: bot, agendador e API num serviço só
│   │   ├── scripts/              comandos de manutenção (curador, simulador, rotação de chave)
│   │   └── src/
│   │       ├── bot/              webhook da Meta, conversas e envio      (partes 2 e 3)
│   │       ├── agendador/        rotinas por data                        (parte 3)
│   │       ├── api/              API de leitura pública do site          (parte 1)
│   │       ├── fotos/ email/     adaptadores de mídia e de e-mail
│   │       ├── cripto/           cifra, HMAC e rotação de chave
│   │       ├── config/           leitura e validação do ambiente
│   │       └── infra/            logger, filas (pg-boss)
│   ├── site/                   Next.js: site público                     (parte 4)
│   └── painel/                 Next.js: painel de curadoria              (parte 5)
├── packages/                   bibliotecas internas, sem servidor próprio
│   ├── dominio/                regras de negócio, por contexto           (parte 1)
│   │   └── src/                  pauta/ caminhos/ conferencia/ avisos/ estudante/ compartilhado/
│   ├── db/                     esquema Drizzle, migrações, views, seed   (parte 1)
│   └── contratos/              tipos zod da API de leitura pública       (parte 1)
├── docs/                       documentação (índice em docs/README.md)
├── scripts/                    backup, restauração e deploy da VM (+ unidades systemd)
├── docker/init/                SQL que cria o banco de teste no Postgres local
├── docker-compose.yml          Postgres local
├── docker-compose.prod.yml     homologação: Postgres, back-end, painel e Caddy
├── Dockerfile · Caddyfile      imagem do back-end e proxy HTTPS da VM
└── .github/workflows/          CI, deploy e avisos de revisão
```

`scripts/`, o `docker-compose.prod.yml` e o `Caddyfile` ficam na raiz de propósito: a VM e o
systemd chamam esses caminhos direto (`/opt/lumens/scripts/...`).

## Documentação

O índice completo está em [docs/README.md](docs/README.md). Os mais usados:

| Página                                                       | Para quê                                                                 |
| ------------------------------------------------------------ | ------------------------------------------------------------------------ |
| [Como rodar local](docs/desenvolvimento/rodar-local.md)      | do clone ao servidor respondendo, e o que fazer se travar                |
| [Como criar uma migração](docs/desenvolvimento/migracoes.md) | mudar o banco sem quebrar o de ninguém                                   |
| [Como usar o domínio](packages/dominio/README.md)            | as regras de negócio: o que existe e como criar uma nova                 |
| [API de leitura pública](docs/arquitetura/api.md)            | rotas, campos e exemplos que o site consome                              |
| [Contrato do banco](docs/arquitetura/banco.md)               | diagrama ER, campos, status e decisões da primeira versão                |
| [`@lumens/db`](packages/db/README.md)                        | papéis, views públicas e seed em detalhe                                 |
| [Decisões do projeto](docs/decisoes/README.md)               | o que já foi decidido, e por quê                                         |
| [Homologação](docs/operacao/homologacao.md)                  | a VM, os secrets e o deploy                                              |
| [Backup do banco](docs/operacao/backup.md)                   | backup diário, teste de restauração e o que fazer num incidente          |
| [Chaves de criptografia](docs/operacao/chaves.md)            | para que serve cada chave, como gerar, rotacionar e o que fazer se vazar |
| [Simulador do bot](apps/backend/SIMULADOR.md)                | testar o webhook sem celular nem conta Meta                              |

**Regra da equipe:** nenhum módulo grava direto numa tabela de negócio. Todos chamam funções de
`@lumens/dominio`, que validam a regra, gravam e registram o evento na linha do tempo, tudo na mesma
transação.

## Endereços da homologação

São dois lugares: o **site** fica na Vercel; o **back-end** (API e webhook) e o **painel** ficam na
VM da Azure, atrás do Caddy, que emite o HTTPS. Na VM, os dois nomes vêm do mesmo `DOMINIO` do
`.env.producao` (hoje `lumens-ufal.duckdns.org`): o back-end responde no nome puro e o painel em
`painel.` na frente.

| Endereço                                                                                | O que é                                     | Onde roda             |
| --------------------------------------------------------------------------------------- | ------------------------------------------- | --------------------- |
| [lumens-ufal.vercel.app](https://lumens-ufal.vercel.app)                                | site público, para quem acompanha as pautas | Vercel                |
| [painel.lumens-ufal.duckdns.org](https://painel.lumens-ufal.duckdns.org)                | painel de curadoria (login por e-mail)      | VM, serviço `painel`  |
| [lumens-ufal.duckdns.org/saude](https://lumens-ufal.duckdns.org/saude)                  | saúde do back-end e do banco                | VM, serviço `backend` |
| [lumens-ufal.duckdns.org/resumo](https://lumens-ufal.duckdns.org/resumo) e demais rotas | API de leitura que o site consome           | VM, serviço `backend` |
| `https://lumens-ufal.duckdns.org/webhook`                                               | webhook da Meta (WhatsApp)                  | VM, serviço `backend` |

O que esperar de cada um:

- **`https://lumens-ufal.duckdns.org/` responde 404, e isso é normal.** O nome puro é só a API: o
  back-end não tem página na raiz. Para ver se está de pé, abra `/saude`; as rotas de leitura
  (`/resumo`, `/blocos`, `/pautas`, `/pautas/:slug`, `/conquistas`, `/atividade`) estão em
  [docs/arquitetura/api.md](docs/arquitetura/api.md).
- **`/webhook` aberto no navegador responde 403.** Ele só aceita o handshake da Meta com o
  `META_VERIFY_TOKEN` e mensagens assinadas com o `META_APP_SECRET`.
- **O painel manda para `/login`** enquanto não há sessão. Só entra quem está na tabela `curador`
  (veja [Painel de curadoria](#painel-de-curadoria)).
- **`lumens-hazel.vercel.app`** é o nome antigo do site. Ainda responde, mas não use em links.

Fora do ar? A VM fica desligada quando ninguém está usando, para economizar o crédito da Azure: os
endereços da VM param de responder e o site perde os dados. Para religar, veja
[docs/operacao/homologacao.md](docs/operacao/homologacao.md).

## Como rodar

Passo a passo completo, com os problemas comuns: [docs/desenvolvimento/rodar-local.md](docs/desenvolvimento/rodar-local.md).
O resumo:

Pré-requisitos: **Node.js 24 LTS** (veja `.nvmrc`), **pnpm 10** e **Docker Desktop**.

```bash
# habilita o pnpm na versão fixada no package.json (vem com o Node)
corepack enable

pnpm install
pnpm check        # typecheck + lint + formatação + testes
```

> **Windows:** o `corepack enable` escreve em `C:\Program Files\nodejs` e falha com `EPERM`
> num terminal comum. Rode-o uma vez num **PowerShell como Administrador**; depois disso
> o `pnpm` funciona normalmente no terminal de sempre.

Comandos úteis:

| Comando          | O que faz                               |
| ---------------- | --------------------------------------- |
| `pnpm typecheck` | Checa os tipos de todos os pacotes      |
| `pnpm lint`      | ESLint em todo o repositório            |
| `pnpm lint:fix`  | Corrige o que o ESLint consegue sozinho |
| `pnpm format`    | Formata tudo com Prettier               |
| `pnpm test`      | Roda os testes de todos os pacotes      |
| `pnpm check`     | Tudo acima, na ordem (rode antes do PR) |

Para rodar um comando em um pacote só: `pnpm --filter @lumens/dominio test`.

O CI executa tipos, lint, formatação, migração em base vazia e testes, incluindo integração
com PostgreSQL.

### Cotas de CI e deploy

O plano gratuito da Vercel aceita 100 deploys por dia por conta, e os minutos do GitHub Actions
aparecem no uso da organização. Para não gastar à toa:

- **PR em rascunho não roda `check` nem `e2e`.** Eles rodam quando a PR é marcada como pronta.
  Abra como rascunho enquanto ainda vai empurrar vários commits.
- **Editar título ou descrição da PR não roda o CI.** Só o workflow `jira`, que confere a chave
  `[SCRUM-n]` no título e leva segundos.
- **A produção do site é publicada só pelo CI** (job `deploy-site`, depois do `check` na `main`).
  O `apps/site/vercel.json` desliga o deploy automático da `main` pela integração Git da Vercel,
  que publicava duas vezes por merge, e antes dos testes. Os previews das PRs continuam.
- **O painel não usa a Vercel**: roda na VM de homologação, publicado pelo `deploy-backend`.
- Junte correções num push só quando puder: cada push numa PR com o site ou `packages/`
  alterado gasta um deploy de preview.

## Banco local

Pré-requisito: **Docker Desktop** aberto e rodando.

```bash
cp .env.example .env
cp .env.database.example .env.database   # ambos só na primeira vez
pnpm db:up
```

| Comando         | O que faz                                                         |
| --------------- | ----------------------------------------------------------------- |
| `pnpm db:up`    | Sobe o PostgreSQL e provisiona o login restrito da aplicação      |
| `pnpm db:down`  | Derruba o container, preservando os dados                         |
| `pnpm db:reset` | Apaga o volume, sobe do zero e reprovisiona o login               |
| `pnpm db:seed`  | Insere ou completa os dados fictícios de desenvolvimento          |
| `pnpm db:fresh` | Apaga o volume, migra o banco e aplica o seed em um único comando |

Conferir que o banco respondeu:

```bash
docker compose --env-file .env.database exec postgres psql -U lumens -d lumens -c 'select 1'
```

São dois bancos no mesmo container: `lumens`, para desenvolvimento, e `lumens_test`, para os
testes de integração — criado pelos scripts de `docker/init/`, que rodam uma única vez, na
criação do volume. Se editar algum deles, use `pnpm db:reset`.

### Esquema e migrações

Como criar uma migração, revisar o SQL gerado e mexer no que as views usam:
[docs/desenvolvimento/migracoes.md](docs/desenvolvimento/migracoes.md).

```bash
pnpm db:migrate   # aplica as migrações da aplicação e do pg-boss pela URL administrativa
pnpm db:generate  # após alterar o schema Drizzle, gera SQL para revisão/versionamento
pnpm db:seed      # aplica a massa fictícia pela URL restrita da aplicação
```

Para reconstruir o ambiente completo com dados para o site e a curadoria, use `pnpm db:fresh`.
Esse comando é destrutivo: ele remove o volume configurado antes de migrar e popular o banco.

O [contrato do banco](docs/arquitetura/banco.md) contém o diagrama ER, campos, status e decisões
da primeira versão. O esquema e os tipos de leitura/inserção são exportados por `@lumens/db`.
As migrações SQL e os metadados do Drizzle ficam em `packages/db/migrations/`.

`pnpm check` agora exige o Postgres local. A suíte usa `DATABASE_URL_TESTE` do `.env.database` ou
do ambiente (nome terminado em `_test`) e o administrador `SUPERUSER` do cluster descartável de
desenvolvimento/CI: além das bases temporárias, os testes criam e removem papéis com atributos
elevados para provar que o provisionamento os endurece. `CREATEDB` sozinho não basta. O usuário do
Docker local já permite isso; nunca aponte essa suíte para produção. O seed também é exclusivo de
desenvolvimento e usa apenas contatos fictícios.
A tabela `evento` é append-only; correções e o reset local estão documentados no
[README de `@lumens/db`](packages/db/README.md).

A versão do PostgreSQL é fixada no `docker-compose.yml` e precisa acompanhar a do
`docker-compose.prod.yml` da homologação: mude as duas juntas.

### Variáveis de ambiente

As variáveis de runtime ficam em `.env.example`; administração, migração e testes ficam em
`.env.database.example`. Copie-os para `.env` e `.env.database`, respectivamente. Os arquivos reais
são ignorados pelo git e nunca devem ser commitados. O backend carrega somente `.env`, portanto não
recebe a URL do owner/migrador; em produção os segredos vivem no cofre da hospedagem e no CI.

Ao atualizar um volume existente, não é preciso apagá-lo:

1. Crie `.env.database` a partir do exemplo e mova para ele toda configuração administrativa:
   `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB`, `POSTGRES_PORT`,
   `POSTGRES_APP_PASSWORD`, `POSTGRES_SITE_PASSWORD`, `DATABASE_URL_MIGRACAO` e
   `DATABASE_URL_TESTE`.
2. Remova essas chaves administrativas do `.env`; o backend carrega esse arquivo.
3. No `.env`, aponte `DATABASE_URL` para o login `lumens_app`, com a senha de
   `POSTGRES_APP_PASSWORD`, e `DATABASE_URL_LEITURA` para o login só de leitura `lumens_site`,
   com a senha de `POSTGRES_SITE_PASSWORD`.
4. Rode `pnpm db:up` para provisionar os logins e `pnpm db:migrate` para aplicar as views e os
   privilégios.

Antes de iniciar o backend, confirme que o `.env` não contém mais usuário ou URL de owner/migrador.

`CHAVE_CIFRA` e `CHAVE_HMAC` são **duas chaves diferentes**: uma cifra telefone e e-mail, a
outra gera o HMAC que permite buscar por telefone sem decifrar a base inteira. Gere cada uma
com:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

Para conferir se o seu `.env` está completo:

```bash
pnpm --filter @lumens/backend env:check
```

Ele lista de uma vez todas as variáveis que faltam, ou confirma que o ambiente está válido.

## Site

```bash
pnpm --filter @lumens/site dev     # http://localhost:3000
pnpm --filter @lumens/site build   # build de produção
```

`LUMENS_SITE_URL` é opcional e só é lida no servidor. Ela define a origem pública do site, com o
esquema (`https://`) e sem barra final, e é a base das URLs absolutas do `og:image` da prévia de
link (`/p/{slug}/og.png`, SCRUM-55). Sem ela, ou com um valor inválido, o site usa `https://$VERCEL_URL`
(o deploy atual na Vercel) e, fora da Vercel, a produção `https://lumens-ufal.vercel.app`.

Homologação: [lumens-ufal.vercel.app](https://lumens-ufal.vercel.app). O endereço antigo
`lumens-hazel.vercel.app` continua respondendo, mas é o nome que a Vercel gerou sozinha quando
`lumens.vercel.app` já estava tomado — use o novo em links, cartões e mensagens (SCRUM-242).

O site é publicado na Vercel pelo GitHub Actions: depois que o `check` passa na `main`, o job
`deploy-site` publica o projeto `lumens` pela Vercel CLI. Isso mantém o deploy automático no plano
Hobby mesmo com o repositório na organização `lumens0`. O status e os logs do deploy ficam no GitHub Actions e na Vercel.

O repositório precisa dos secrets `VERCEL_TOKEN`, `VERCEL_ORG_ID` e `VERCEL_SITE_PROJECT_ID`.
Na Vercel, o diretório raiz do projeto continua sendo `apps/site`.

O **back-end** e o **painel** vão para uma máquina virtual, por `docker compose`, no job
`deploy-backend`:
migração primeiro, em comando separado, e só então a nova versão sobe — migração que falha
deixa a anterior servindo. Como montar a máquina, qual nuvem e por quê, e quais secrets são
exigidos está em [docs/operacao/homologacao.md](docs/operacao/homologacao.md). O site continua na Vercel.

## Painel de curadoria

O painel é um app separado do site público. Só entra quem está na tabela `curador` com
`ativo = true`, por um link mandado ao e-mail (Auth.js, SCRUM-164): sem senha, o link vale 15
minutos e uma vez só, e a sessão dura 7 dias. Quem não é curador vê a mesma tela de "confira seu
e-mail", mas não recebe nada.

```bash
pnpm --filter @lumens/painel dev     # http://localhost:3002 (lê o .env da raiz)
pnpm --filter @lumens/painel build   # build de produção
```

O painel usa `DATABASE_URL`, `CHAVE_HMAC`, `AUTH_SECRET` e as variáveis `EMAIL_*` (SMTP) do
`.env`. Para mostrar a foto do relato e o PDF da resposta à curadoria, lê também `AWS_REGION`,
`S3_BUCKET_FOTOS` e `S3_ENDPOINT`, as mesmas do bot. Na homologação, elas vêm do `.env.producao`
da VM.

**Adicionar um curador** (ou reativar quem saiu):

```bash
pnpm --filter @lumens/backend curador fulana@ufal.br "Fulana de Tal"
```

O e-mail é guardado cifrado e com HMAC, como o telefone dos estudantes; use as mesmas
`CHAVE_CIFRA` e `CHAVE_HMAC` do ambiente onde o painel roda. Para tirar o acesso, ponha
`ativo = false` na linha dela.

Sem sessão, toda página manda para `/login` e toda rota de API em `/curadoria/*` responde 401.

Homologação: `https://painel.<DOMINIO>`, na mesma VM do banco. O painel não fica na Vercel
porque o Postgres da homologação não tem porta publicada: fora da rede do `docker compose`,
ninguém o alcança. Para cadastrar curador lá, rode o script dentro da VM, pelo contêiner do
back-end (que já tem o `.env.producao`):

```bash
cd /opt/lumens && docker compose -f docker-compose.prod.yml --env-file .env.producao run --rm -T backend pnpm --filter @lumens/backend curador fulana@ufal.br "Fulana de Tal"
```

## Bot (parte 2)

```bash
pnpm db:up && pnpm db:migrate   # banco com as tabelas do bot
pnpm dev                        # servidor em :3001 (PORT do .env)
pnpm sim texto 'buraco no bloco 12'
```

O `pnpm dev` valida o ambiente e sobe o Fastify com o webhook da Meta (`GET`/`POST /webhook`)
e a fila. O schema `pgboss` é instalado por `pnpm db:migrate` com a URL administrativa; o backend
usa somente o login restrito. O simulador assina com o
`META_APP_SECRET` do `.env`, então dá para testar o webhook (assinatura, dedup e fila) sem celular
nem conta Meta: veja [apps/backend/SIMULADOR.md](apps/backend/SIMULADOR.md).

O job de cada mensagem não leva telefone nem wamid em claro (o wamid da Meta codifica o
telefone): vão como HMAC da `CHAVE_HMAC`, para achar a conversa, e cifrados com a `CHAVE_CIFRA`,
para o worker responder.

Um worker consome a fila `incoming-message` e anda a conversa. O novo estado, as respostas (na
fila `outgoing-replies`) e a conclusão do job entram na mesma transação: se o processo cair no
meio, a mensagem é reentregue em até 1 minuto e aplicada uma vez só. Enquanto o envio pela Meta
não existe, as respostas aparecem no log do `pnpm dev` como `respostas do bot`, com o texto no
campo `texto`. Só o `pnpm dev` (flag `--dev`) mostra o texto; o `start` de produção registra
apenas quantas respostas saíram, porque uma resposta pode repetir o que a pessoa escreveu.

Em produção não há `.env` nem devDependencies: o ambiente vem da hospedagem e o servidor sobe
com `pnpm --filter @lumens/backend start` (migrações: `pnpm db:migrate`).

Os **avisos** (mensagens modelo da fila `disparo`) já saem pela Cloud API da Meta
(`src/bot/envio/`); o webhook foi validado no painel da Meta em 2026-11-10
([evidências](docs/meta/webhook-validacao.md)). A verificação por e-mail (2.4) e o apoio com foto
(2.7) estão completos no bot.

Pendências da parte 2:

- **Respostas da conversa pela API da Meta:** o `registerReplyWorker` ainda usa o `logSender`
  (`src/bot/worker.ts`). Falta um sender que decifra o telefone e chama a Cloud API. Uma resposta
  é texto, lista ou botões (`src/bot/conversation/resposta.ts`), que viram
  `interactive.type = "list"` (uma seção só) e `interactive.type = "button"` (os caminhos da 3.3).
- **E-mail do código numa segunda conta:** o envio foi testado numa conta real da UFAL
  (SCRUM-139) e sai pelo SMTP do Google da conta `@ic.ufal.br`, não pela Brevo
  (`docs/sdd/SCRUM-99-verificacao-email/TESTS.md`).
- **Bucket das fotos:** o código baixa a foto da Meta, tira os metadados e grava no
  `S3_BUCKET_FOTOS`, mas a homologação ainda não tem bucket, então a foto é recusada com aviso e o
  "pular" continua funcionando ([SCRUM-251](docs/decisoes/SCRUM-251-fotos-sem-storage.md)).

## API de leitura pública

O mesmo servidor do `pnpm dev` (`:3001`) serve a API REST só de leitura do site: `GET /resumo`,
`/blocos`, `/pautas`, `/pautas/:slug`, `/conquistas` e `/atividade`, sem login, pelo login
`lumens_site` (`DATABASE_URL_LEITURA`). As origens aceitas no CORS vêm de `CORS_ORIGENS`. Rotas,
campos e exemplos: [docs/arquitetura/api.md](docs/arquitetura/api.md). Os tipos das respostas ficam em `@lumens/contratos`.

## Como contribuir

- **Nunca** faça commit direto na `main`: toda mudança entra por pull request revisado.
- **Branches:** `tipo/SCRUM-<n>-descricao-curta`
  - ex.: `feat/SCRUM-77-esquema-inicial`, `fix/SCRUM-82-meta-batida-duplicada`
- **Pull requests:** o título inclui `[SCRUM-<n>]`, com a mesma chave usada na branch.
- **Commits:** [Conventional Commits](https://www.conventionalcommits.org/pt-br/) com a chave do Jira
  - ex.: `feat(dominio): calcula meta da pauta [SCRUM-82]`
  - tipos: `feat`, `fix`, `test`, `refactor`, `docs`, `chore`, `ci`
- Antes de abrir o PR, rode `pnpm check`.
- No VS Code, instale as extensões recomendadas (o editor sugere ao abrir a pasta).
