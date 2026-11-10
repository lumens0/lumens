# Imagem do back-end para a homologação da AWS (SCRUM-93).
#
# Uma imagem só serve aos dois comandos do deploy: `db:migrate` e o `start`. Separar em
# duas economizaria pouco e abriria a chance de migrar com uma versão e servir com outra.

FROM node:24-slim

# Sem instalar libvips pelo apt: o binário pré-compilado do sharp 0.35 já a traz embutida,
# e o pacote do Debian nem tem o mesmo nome nesta base. O build checa isso mais abaixo.

# corepack lê o campo packageManager do package.json e fixa o pnpm 10.34.7 — a mesma
# versão do CI. Sem ele, a imagem usaria o pnpm que vier na base.
RUN corepack enable

WORKDIR /app

# Sem --prod de propósito: o `start` e o `db:migrate` rodam por tsx, que é dependência de
# produção, mas o pnpm precisa do workspace inteiro para resolver os `workspace:*`.
# O .dockerignore mantém node_modules, segredos e testes fora.
COPY . .
RUN pnpm install --frozen-lockfile

# Falha no build, não na primeira foto enviada: o sharp só carrega a libvips quando é
# importado, então sem esta linha um binário incompatível passaria despercebido até
# alguém mandar uma imagem pelo bot em homologação.
# A partir de apps/backend: com pnpm workspace o sharp fica no node_modules do pacote
# que o declara, não na raiz.
RUN cd apps/backend \
  && node -e "const s=require('sharp');console.log('sharp ok, libvips',s.versions.vips)"

ENV NODE_ENV=production

# Mesma porta do PORT padrão do .env.example. O Caddy é quem fala com a internet.
EXPOSE 3000

CMD ["pnpm", "--filter", "@lumens/backend", "start"]
