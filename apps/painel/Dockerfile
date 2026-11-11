# Imagem do painel de curadoria para a homologação. Construída a partir da raiz do repositório
# (`context: .` no docker-compose.prod.yml): o pnpm precisa do workspace inteiro para resolver
# os `workspace:*` de @lumens/db e @lumens/dominio.
#
# O painel roda na mesma VM do banco porque o Postgres da homologação não tem porta publicada:
# fora da rede do compose ninguém o alcança, nem a Vercel.

FROM node:24-slim

RUN corepack enable

WORKDIR /app

COPY . .
RUN pnpm install --frozen-lockfile

# O build não precisa de banco nem de segredo: o Auth.js e o pool só são montados no primeiro
# pedido (`apps/painel/src/auth.ts`). As variáveis chegam em tempo de execução pelo compose.
ENV NEXT_TELEMETRY_DISABLED=1
RUN pnpm --filter @lumens/painel build

ENV NODE_ENV=production

# A mesma porta do script `start`. O Caddy é quem fala com a internet.
EXPOSE 3002

CMD ["pnpm", "--filter", "@lumens/painel", "start"]
