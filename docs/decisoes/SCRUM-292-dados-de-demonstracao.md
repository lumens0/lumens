# SCRUM-292 · Dados de demonstração na homologação

Dívida · 2026-11-18
**Situação:** em aberto. Este arquivo registra o que depende de decisão da equipe antes da demo
(por volta de 25/11). Nada foi mudado no banco da homologação.

## O que ficou claro

- Os blocos "(fictício)" e as pautas de fevereiro vêm do seed (`packages/db/seed/data.ts`); nenhuma
  migração cadastra blocos, então um banco limpo não tem bloco algum.
- O catálogo real (31 unidades, no levantamento do ticket) traz `base_estudantes` **estimada de
  memória**. A meta de cada pauta congela na criação (decisão 3 do SCRUM-80), então subir esses
  números como se fossem certos fixa metas erradas. Precisam ser conferidas com a PROGRAD ou o
  edital SiSU antes de ir para produção.
- Limpar o seed na VM esbarra no evento append-only (SCRUM-78, migração 0002): não se apaga evento.
  As saídas possíveis são recriar o banco da homologação (backup antes) ou manter o seed marcado
  como demonstração.

## O que precisa ser decidido (por Sthefany Lima)

1. **Seed ou banco limpo na demo?** Recomendação: recriar o banco da homologação (já que é só
   homologação) e subir o catálogo real, sem pautas de exemplo, mais as pautas que a equipe criar
   pelo bot. Alternativa: manter o seed, mas com blocos e pautas marcados como demonstração no nome
   de forma honesta (não "fictício").
2. **Bases de estudantes:** quem confere os 31 valores, e se a migração do catálogo entra já com os
   valores estimados ou só depois da conferência.
3. **O agendador deve ignorar owners do seed?** Em 15/11 ele removeu os owners de demonstração por
   inatividade (14 saídas em /atividade; a repetição na tela foi tratada na SCRUM-355) e as pautas
   ficaram sem responsável.
4. Dados de teste manual a apagar antes da demo: pautas "[TESTE] …", 3 relatos de teste, o apoio a
   mais em "Bebedouros" e o co-owner de teste.

## Próximo passo depois da decisão

Migração `00NN_blocos_ufal.sql` com UUIDs fixos e `ON CONFLICT (slug) DO NOTHING`; seed passando a
usar os mesmos ids; `BLOCOS_DO_PREDIO` do mapa (site, outra frente) com os slugs reais; testes que
citam "Bloco 18 (fictício)" atualizados.
