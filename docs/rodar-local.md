# Como rodar o Lumens local

SCRUM-94 · T21. Do clone ao servidor respondendo, com os comandos na ordem. Se algum passo
travar, [Problemas comuns](#problemas-comuns) no fim da página cobre o que já aconteceu com a
equipe.

## Pré-requisitos

| O quê              | Versão             | Como conferir                                 |
| ------------------ | ------------------ | --------------------------------------------- |
| **Node.js**        | 24 (veja `.nvmrc`) | `node -v`                                     |
| **pnpm**           | 10                 | `pnpm -v`                                     |
| **Docker Desktop** | qualquer recente   | `docker ps` (precisa responder, não dar erro) |

O pnpm vem com o Node: `corepack enable` habilita a versão fixada no `package.json`. No Windows,
esse comando escreve em `C:\Program Files\nodejs` e precisa de um **PowerShell como
Administrador**, uma vez só.

## Passo a passo

```bash
corepack enable
```

```bash
pnpm install
```

```bash
cp .env.example .env && cp .env.database.example .env.database
```

Os dois exemplos já vêm com os valores de desenvolvimento local, então o banco sobe sem editar
nada. Para o back-end subir, só faltam as duas chaves de criptografia no `.env` — são **chaves
diferentes**, e o back-end recusa valores iguais:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

Rode duas vezes e cole um valor em `CHAVE_CIFRA` e o outro em `CHAVE_HMAC`.

```bash
pnpm db:up
```

Sobe o PostgreSQL 17 em `127.0.0.1:5432` e cria os logins restritos `lumens_app` (aplicação) e
`lumens_site` (só leitura, para o site). Só retorna quando o banco responde.

```bash
pnpm db:fresh
```

Apaga o volume, aplica as migrações e insere o seed: seis blocos, 300 estudantes fictícios e uma
pauta em cada status. É o que o site e o painel precisam para ter o que mostrar. Em um banco que
você já usa e quer preservar, use `pnpm db:migrate && pnpm db:seed`.

```bash
pnpm dev
```

Back-end em `http://localhost:3001`: o webhook da Meta e a
[API de leitura pública](api.md). Conferir que está de pé:

```bash
curl http://localhost:3001/pautas?limit=2
```

Duas pautas em JSON significam processo **e** banco respondendo. Erro de conexão aqui é quase
sempre o banco: confira o `pnpm db:up` e o `DATABASE_URL_LEITURA` do `.env`.

Site e painel são apps separados, cada um na sua porta:

```bash
pnpm --filter @lumens/site dev     # http://localhost:3000
```

```bash
pnpm --filter @lumens/painel dev   # http://localhost:3002
```

## Rodar os testes

```bash
pnpm check
```

Typecheck, ESLint, Prettier e todos os testes, na ordem — é o que o CI roda, e o que você roda
antes de abrir o PR. Com o Docker parado ele falha: parte da suíte usa Postgres de verdade (banco
temporário, criado e apagado pela própria suíte, nunca o de desenvolvimento).

```bash
pnpm test
```

```bash
pnpm --filter @lumens/dominio test
```

Um arquivo só:

```bash
pnpm --filter @lumens/backend exec vitest run src/api/privacidade.test.ts
```

A maioria dos testes não precisa de Docker: eles sobem um Postgres em memória (PGlite) com as
**mesmas** migrações do banco real.

## Problemas comuns

### `docker ps` dá erro ou `pnpm db:up` fica parado

O Docker Desktop não está aberto. Abra, espere o ícone ficar verde e rode de novo.

### A porta 5432 já está ocupada

Outro PostgreSQL na máquina. Troque a porta no `.env.database`:

```bash
POSTGRES_PORT=5433
```

E repita a porta em `DATABASE_URL_MIGRACAO` e `DATABASE_URL_TESTE` (no `.env.database`) e em
`DATABASE_URL` e `DATABASE_URL_LEITURA` (no `.env`). Depois, `pnpm db:down && pnpm db:up`.

### `CONFIG_SENHA_AUSENTE` no `pnpm db:up`

Falta uma senha no `.env.database` — normalmente `POSTGRES_SITE_PASSWORD`, em um arquivo criado
antes de o login do site existir. Compare as chaves do seu arquivo com as do exemplo:

```bash
diff <(grep -o '^[A-Z_]*' .env.database.example) <(grep -o '^[A-Z_]*' .env.database)
```

Acrescente o que faltar e rode `pnpm db:reset`: o provisionamento parou no meio, então os logins
não foram todos criados.

### `role "lumens_site" does not exist` (código `42704`) nos testes

Mesma causa do item acima: o `db:provision` não chegou ao fim. `pnpm db:reset` resolve.

### `pnpm dev` reclama de variável de ambiente

```bash
pnpm --filter @lumens/backend env:check
```

Lista de uma vez tudo o que falta no `.env`, em vez de parar na primeira.

### `corepack enable` falha com `EPERM` no Windows

Rode uma vez num PowerShell como Administrador. Depois o `pnpm` funciona no terminal de sempre.

### O seed não aparece no site

`pnpm db:seed` é reaplicável e não apaga nada, mas só insere o que falta. Se o banco ficou num
estado estranho, `pnpm db:fresh` recria do zero — **destrutivo**, apaga o volume local.

## Em seguida

- [Como criar uma migração](migracoes.md)
- [Como usar o domínio](../packages/dominio/README.md)
- [API de leitura pública](api.md)
- [Contrato do banco](database/schema.md) e [`@lumens/db`](../packages/db/README.md)
- [Decisões do projeto](decisoes.md)
