# SCRUM-292 · Dados de demonstração na homologação

Dívida · 2026-11-18
**Situação:** decisão proposta, pendente de confirmação da Sthefany. Nada foi mudado no banco da
homologação: as ações abaixo são da pessoa que opera a VM.

## O que ficou claro

- Os blocos "(fictício)" e as pautas de fevereiro vêm do seed (`packages/db/seed/data.ts`); nenhuma
  migração cadastra blocos, então um banco limpo não tem bloco algum.
- O catálogo real (31 unidades, no levantamento do ticket) traz `base_estudantes` **estimada de
  memória**. A meta de cada pauta congela na criação (decisão 3 do SCRUM-80), então subir esses
  números como se fossem certos fixa metas erradas. A equipe é de estudantes e não tem acesso à
  PROGRAD: a decisão (18/11/2026) é **assumir as estimativas** como base da meta, dizer isso
  abertamente e corrigir se aparecer um número oficial (edital SiSU, relatório da UFAL).
- Limpar o seed na VM esbarra no evento append-only (SCRUM-78, migração 0002): não se apaga evento.
  As saídas possíveis são recriar o banco da homologação (backup antes) ou manter o seed marcado
  como demonstração.

## Decisões

1. **Banco limpo na demo, sem o seed.** O seed continua só para desenvolvimento e testes. As pautas
   da demo nascem pelo bot ou pelo painel. Isso resolve o evento append-only sem tentar apagar
   evento (SCRUM-78) e leva junto os dados de teste manual ("[TESTE] …", relatos e apoios de teste).
   Procedimento na VM (**apaga todos os dados do banco: pautas, apoios, estudantes, curadores e as
   filas**; só com confirmação):

   ```bash
   cd /opt/lumens
   # 1. backup antes (veja docs/operacao/backup.md); confira que o arquivo existe e tem tamanho
   # 2. parar quem usa o banco e remover só o volume do Postgres do Lumens
   docker compose -f docker-compose.prod.yml --env-file .env.producao stop backend painel
   docker compose -f docker-compose.prod.yml --env-file .env.producao rm -sf postgres
   docker volume ls | grep lumens-pgdata   # confira o nome; NÃO é o da Evolution (evolution-pgdata)
   docker volume rm <nome-do-volume-lumens-pgdata>
   # 3. banco novo, migrações e logins restritos
   docker compose -f docker-compose.prod.yml --env-file .env.producao up -d --wait postgres
   docker compose -f docker-compose.prod.yml --env-file .env.producao run --rm migracao
   # 4. blocos reais (sem o seed)
   docker compose -f docker-compose.prod.yml --env-file .env.producao run --rm migracao pnpm db:blocos-ufal
   # 5. subir de novo e criar o primeiro administrador do painel (apps/backend/scripts/curador.ts)
   ./scripts/deploy-homologacao.sh origin/main
   ```

   O `pnpm db:reset` do repositório não serve aqui: ele é o `docker compose down -v` do compose
   local de desenvolvimento. Apagar o banco também apaga os curadores: crie de novo o primeiro
   administrador e confira o login do painel antes da demo.

2. **Blocos reais por script, não por migração.** `packages/db/seed/blocos-ufal.ts` traz os 31
   blocos do levantamento, com `ON CONFLICT (slug) DO NOTHING`. Não virou migração porque a
   `base_estudantes` é estimativa não conferida e uma migração a fixaria em produção, além de
   colidir com o slug `bloco-18` do seed nos testes. Os valores são estimativas assumidas (a equipe
   não tem acesso à PROGRAD); se surgir número oficial, corrija com `UPDATE bloco` enquanto não
   houver pauta no bloco.
3. **Agendador:** não ignora o seed. Como o seed não vai mais para a homologação, o caso some.
4. **CSAU entra como bloco próprio; Residência Universitária fica fora** (deve ficar fora do campus,
   a confirmar).

## Executado em 18/11/2026

Autorizado pela Sthefany. Backup do dia gerado antes (`/var/backups/lumens/diario`), banco do Lumens
recriado, migrações aplicadas, os 31 blocos reais cadastrados e a tabela `curador` restaurada (7
linhas, para o painel não ficar sem login). Resultado: 31 blocos, 0 "(fictício)", 0 pautas. A Evolution
e o chip não foram tocados. A migração 0024 (limite de link do painel) entra no próximo deploy.

## Estado depois da apresentação (18/11/2026)

Conferido na VM: backend, painel, Postgres, Caddy e Evolution saudáveis; 31 blocos reais, nenhum
"(fictício)". O banco já recebeu dados novos depois do reset (1 pauta, 2 estudantes), então nada mais
foi apagado. A VM ainda roda a main anterior ao PR 209: o deploy foi pulado porque o check da main
estava vermelho (roteiros de integração, SCRUM-340), o que o PR 211 corrigiu.

## O que continua pendente

- Deploy da main na homologação (aplica a migração 0024), com o check da main verde.
- Base de demonstração coerente para a conquista completa (SCRUM-352,
  `docs/operacao/demonstracao-conquista.md`).
- Localização da Residência. As bases de estudantes seguem como estimativa assumida, sem conferência
  com a PROGRAD (a equipe não tem acesso).

Os blocos reais já estão ligados aos prédios do mapa (`BLOCOS_DO_PREDIO`, SCRUM-284).
