# Imagem do painel de curadoria para a homologação. Construída a partir da raiz do repositório
# (`context: .` no docker-compose.prod.yml): o pnpm precisa do workspace inteiro para resolver
# os `workspace:*` de @lumens/db e @lumens/dominio.
#
# O painel roda na mesma VM do banco porque o Postgres da homologação não tem porta publicada:
# fora da rede do compose ninguém o alcança, nem a Vercel.

FROM node:24-slim

# Fora do HOME do root (SCRUM-303): o pnpm baixado no build fica legível para o usuário `node`.
ENV COREPACK_HOME=/opt/corepack
RUN corepack enable

WORKDIR /app

COPY . .
RUN pnpm install --frozen-lockfile

# O build não precisa de banco nem de segredo: o Auth.js e o pool só são montados no primeiro
# pedido (`apps/painel/src/auth.ts`). As variáveis chegam em tempo de execução pelo compose.
ENV NEXT_TELEMETRY_DISABLED=1
# O `next start` escreve no .next/cache: é a única pasta que o usuário `node` precisa gravar.
RUN pnpm --filter @lumens/painel build && chown -R node:node apps/painel/.next

ENV NODE_ENV=production

# A mesma porta do script `start`. O Caddy é quem fala com a internet.
EXPOSE 3002

# Sem root (SCRUM-303): o painel é exposto à internet.
USER node

CMD ["pnpm", "--filter", "@lumens/painel", "start"]
