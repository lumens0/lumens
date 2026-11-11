# Chaves de criptografia

SCRUM-90 · T17. O Lumens usa três segredos para proteger telefone, e-mail e a sessão do painel.
Este documento diz para que serve cada um, onde ele vive, como rotacionar e o que fazer se vazar.

| Variável      | Para que serve                                                         | Quem lê                                  |
| ------------- | ---------------------------------------------------------------------- | ---------------------------------------- |
| `CHAVE_CIFRA` | AES-256-GCM: cifra o que precisa voltar a ser lido                     | back-end (bot, envio, script de curador) |
| `CHAVE_HMAC`  | HMAC-SHA256: identifica sem revelar (busca e unicidade); não tem volta | back-end e painel                        |
| `AUTH_SECRET` | Assina a sessão do Auth.js no painel de curadoria                      | só o painel                              |

Regras das três: **32 bytes em base64**, **valores diferentes entre si** (e diferentes entre
local e homologação), **nunca em log, commit, print ou chat**. O back-end não sobe se faltar
`CHAVE_CIFRA` ou `CHAVE_HMAC`, se não forem base64 de 32 bytes ou se forem iguais
(`apps/backend/src/config/env.ts`).

## O que cada chave protege

**`CHAVE_CIFRA`** (`apps/backend/src/cripto.ts`, saída em base64: IV de 12 bytes, tag de 16, texto
cifrado). Colunas `*_cifrado`:

- `estudante.telefone_cifrado` e `estudante.email_cifrado`
- `curador.email_cifrado`

Também cifra o que passa pelo bot: o conteúdo, o telefone e o wamid dos jobs da fila de entrada,
as respostas na fila de saída e o e-mail que o estudante digita durante a verificação (guardado na
conversa). Isso é transitório; só as colunas acima ficam no banco por tempo indeterminado.

**`CHAVE_HMAC`** (`hmacHex` no back-end e `hmacDoEmail` no painel, mesmo cálculo). Colunas
`*_hmac`:

- `estudante.telefone_hmac` e `estudante.email_hmac` (únicas)
- `curador.email_hmac` (única; é como o painel acha o curador no login)
- `telefone_hmac` de `conversa` e `codigo_verificacao`
- `mensagem_processada.wamid_hmac` (dedupe de mensagens) e `disparo.wamid_hmac`
- `verificacao_login.identificador` (o e-mail do link de acesso do painel, em HMAC)

**`AUTH_SECRET`**: não grava nada no banco; só assina o cookie de sessão.

## Gerar

```bash
openssl rand -base64 32
```

Rode uma vez por chave. Não reaproveite saída de uma para outra.

## Onde ficam

- **Local:** `.env` na raiz (modelo em `.env.example`). Nunca versionado.
- **GitHub Actions:** o `ci.yml` **não usa** as três chaves; ele monta um ambiente de teste sem
  elas. Os secrets do repositório são só de deploy (`HOMOLOG_*`, `VERCEL_*`).
- **Homologação:** `.env.producao` na VM, em `/opt/lumens`, com `chmod 600`
  ([homologação](homologacao.md)). O `scripts/deploy-homologacao.sh` recusa publicar sem
  `AUTH_SECRET`. O painel roda na mesma VM e lê o mesmo arquivo.
- **Painel na Vercel:** o `.env.example` manda cadastrar as mesmas variáveis no projeto do painel
  (`CHAVE_HMAC` e `AUTH_SECRET`, mais banco e e-mail). Se esse projeto existe de fato é decisão da
  equipe; a homologação usa o painel da VM.

O repositório não mostra quem tem acesso a cada um desses lugares nem onde fica uma cópia de
reserva das chaves. Definir isso (quem guarda, onde fica o cofre) é decisão da equipe. Perder a
`CHAVE_CIFRA` sem cópia significa perder para sempre telefones e e-mails cifrados.

## Rotacionar a `CHAVE_CIFRA`

O script `apps/backend/scripts/rotacionar-cifra.ts` (função em `src/cripto/rotacao.ts`) decifra
tudo com a chave antiga e recifra com a nova, **em uma transação só**.

O que ele recifra: `curador.email_cifrado`, `estudante.telefone_cifrado` e
`estudante.email_cifrado` (quando não nulo). Pula as lápides `saiu:`, de quem saiu do bot.

O que ele **não** recifra: o que está na fila do pg-boss e o e-mail guardado numa conversa em
andamento. Isso é transitório e, depois da troca, não decifra mais; esses jobs falham e a conversa
precisa recomeçar. Por isso o passo 1 abaixo.

Variáveis: `DATABASE_URL`, `CHAVE_CIFRA_ANTIGA` e `CHAVE_CIFRA_NOVA` (ou `--antiga=` e `--nova=`,
mas argumento fica no histórico do shell; prefira as variáveis). Recusa chaves que não sejam
base64 de 32 bytes ou que sejam iguais.

**É atômico, mas não idempotente.** Se qualquer linha não decifrar com a chave antiga, tudo volta
atrás e nada muda. Rodar de novo com as mesmas chaves depois de um sucesso falha pelo mesmo
motivo (os dados já estão na chave nova) e não altera nada.

Passo a passo (no ambiente de homologação, a partir de `/opt/lumens`). Todo `docker compose` daqui
leva `-f docker-compose.prod.yml --env-file .env.producao`, como o `scripts/deploy-homologacao.sh`:
sem o `--env-file`, o Compose não acha o `DOMINIO` e para antes de fazer qualquer coisa.

1. **Pare o bot e confira que a fila está vazia.** Parar o back-end não esvazia a fila: os jobs do
   pg-boss continuam no banco, cifrados com a chave antiga, e depois da troca não decifram mais.
   Escolha um horário sem movimento e pare o back-end
   (`docker compose -f docker-compose.prod.yml --env-file .env.producao stop backend`). Com ele parado, a Meta não consegue
   entregar o webhook e reenvia as mensagens novas depois, então nada se perde. Abra o banco
   (`docker compose -f docker-compose.prod.yml --env-file .env.producao exec postgres psql -U <usuário> -d <banco>`) e
   rode:

   ```sql
   select name, count(*) from pgboss.job
   where state in ('created', 'retry', 'active') and name not like '%-dead' group by name;
   ```

   Se vier alguma linha, suba o back-end de novo (`... start backend`), espere uns minutos para ele
   processar e repita este passo. Só siga com a consulta vazia.

   As filas de mortas (`incoming-message-dead` e `outgoing-replies-dead`) ficam de fora: nenhum
   consumidor as lê, então subir o back-end não as esvazia. Elas guardam mensagens que o bot já
   descartou, só para investigar, e saem sozinhas em até 14 dias
   ([retenção nas filas](decisoes/SCRUM-174-aviso-de-privacidade.md)). Depois da troca não
   decifram mais. Confira quantas há:

   ```sql
   select name, count(*) from pgboss.job where name like '%-dead' group by name;
   ```

   Se alguém precisa investigar alguma, faça agora, com a chave antiga. Senão, apague antes de
   seguir, para não ficar no banco o que ninguém consegue ler:

   ```sql
   delete from pgboss.job where name in ('incoming-message-dead', 'outgoing-replies-dead');
   ```

2. **Faça backup do banco** na hora, sem esperar o agendado:
   `sudo systemctl start lumens-backup.service` (veja [Backup do banco](backup.md)). Esse backup
   só decifra com a chave **antiga**: guarde-a junto até não precisar mais dele.
3. **Gere a chave nova** com `openssl rand -base64 32`, diferente da `CHAVE_HMAC` e da
   `AUTH_SECRET`.
4. **Rode o script** com a antiga e a nova. Seguindo o padrão do script de curador
   (`docker compose -f docker-compose.prod.yml --env-file .env.producao run --rm -T backend pnpm --filter @lumens/backend ...`), passe as duas
   com `-e CHAVE_CIFRA_ANTIGA=... -e CHAVE_CIFRA_NOVA=...`. Localmente:

   ```bash
   CHAVE_CIFRA_ANTIGA=<antiga> CHAVE_CIFRA_NOVA=<nova> pnpm --filter @lumens/backend rotacionar-cifra
   ```

   Esperado: `Rotação de chaves concluída com sucesso: N curador(es) e M estudante(s) recifrado(s).`

5. **Troque `CHAVE_CIFRA`** no `.env.producao` pelo valor novo **só depois** do passo 4 dar certo
   (e, em qualquer outro ambiente que aponte para o mesmo banco, no mesmo momento).
6. **Recrie o back-end** com
   `docker compose -f docker-compose.prod.yml --env-file .env.producao up -d --force-recreate backend`
   e confira `curl -s https://<DOMINIO>/saude`. `start` ou `restart` não servem: o contêiner
   continua com o `env_file` de quando foi criado, ou seja, com a chave antiga.
7. Se o passo 4 falhou, nada mudou: a chave do `.env.producao` continua valendo; corrija a causa
   e repita. Se o passo 4 deu certo e o back-end subiu com a chave antiga, ele não decifra
   telefone nem e-mail; corrija a variável para a **nova**. Só o backup do passo 2 devolve o banco
   ao estado anterior.

O teste da rotação, em banco de teste, está em `apps/backend/src/cripto/rotacao.test.ts`.

## Trocar a `CHAVE_HMAC`

É diferente da cifra: um HMAC não volta ao valor original, então não existe "decifrar e recifrar".
Trocar a chave deixa **todo** `*_hmac` gravado inválido, e o sistema deixa de achar o estudante e o
curador pelo valor novo.

- **Telefone e e-mail** (`estudante`, `curador`): dá para recalcular, decifrando o `*_cifrado` com a
  `CHAVE_CIFRA` e gerando o HMAC com a chave nova. **Não existe script para isso hoje.** Sem ele,
  não troque a `CHAVE_HMAC` em ambiente com dados reais. Quem fizer esse script deve cobrir também
  `conversa`, `codigo_verificacao` e `disparo.wamid_hmac` (ou aceitar perder esses registros).
- **`mensagem_processada`:** só perde a deduplicação das mensagens já vistas (e ela é limpa
  periodicamente).
- **`verificacao_login`:** os links de acesso ao painel em aberto deixam de valer; o curador pede
  outro.
- **`AUTH_SECRET`:** trocar derruba as sessões abertas do painel; todo mundo entra de novo. Não
  exige migração de dados.

## Se uma chave vazar

1. **Trate como vazada a chave inteira**, mesmo sem prova de uso. Vazou em log, commit, print ou
   chat? Remova de onde estiver, mas considere que já foi copiada.
2. **`AUTH_SECRET`:** gere outra, troque no `.env.producao` (e na Vercel, se existir) e recrie o
   painel: `docker compose -f docker-compose.prod.yml --env-file .env.producao up -d --force-recreate painel`.
   `restart` não basta, o contêiner continuaria com o segredo vazado e as sessões antigas valendo.
   Barato, resolve na hora.
3. **`CHAVE_CIFRA`:** quem tem a chave **e** acesso ao banco lê telefones e e-mails. Faça a
   rotação acima com uma chave nova. Se o banco também vazou, a rotação não desfaz o vazamento
   dos dados antigos; avise a equipe e avalie a obrigação de comunicar os titulares.
4. **`CHAVE_HMAC`:** sozinha, não decifra nada, mas permite confirmar se um telefone ou e-mail
   conhecido está na base. Trocar exige o script que ainda não existe (seção anterior); decida na
   equipe se a exposição justifica criá-lo.
5. Confira se a chave local não é igual à da homologação (a regra existe justamente para um
   vazamento local não valer na VM).
6. Registre o ocorrido e quem foi avisado.

## Em seguida

- [Homologação](homologacao.md) — onde fica o `.env.producao`
- [Como rodar local](rodar-local.md) — o `.env` do desenvolvimento
