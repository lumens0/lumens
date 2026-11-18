# SCRUM-292 · Dados de demonstração na homologação

Dívida · 2026-11-18
**Situação:** decidida em 18/11/2026 (autorizada por Sthefany Lima para o time decidir). Nada foi
mudado no banco da homologação: as ações abaixo são da pessoa que opera a VM.

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

## Decisões

1. **Banco limpo na demo, sem o seed.** O seed continua só para desenvolvimento e testes. Na
   homologação: backup, `pnpm db:reset`, `pnpm db:migrate` e `pnpm db:blocos-ufal`. As pautas da
   demo nascem pelo bot ou pelo painel. Isso resolve o evento append-only sem tentar apagar evento
   (SCRUM-78) e leva junto os dados de teste manual ("[TESTE] …", relatos e apoios de teste).
2. **Blocos reais por script, não por migração.** `packages/db/seed/blocos-ufal.ts` traz os 31
   blocos do levantamento, com `ON CONFLICT (slug) DO NOTHING`. Não virou migração porque a
   `base_estudantes` é estimativa não conferida e uma migração a fixaria em produção, além de
   colidir com o slug `bloco-18` do seed nos testes. Antes de abrir para o público, a PROGRAD ou o
   edital confere os valores; corrija com `UPDATE bloco` enquanto não houver pauta no bloco.
3. **Agendador:** não ignora o seed. Como o seed não vai mais para a homologação, o caso some.
4. **CSAU entra como bloco próprio; Residência Universitária fica fora** (deve ficar fora do campus,
   a confirmar).

## O que continua pendente

- Ligar os blocos reais aos prédios do mapa (`BLOCOS_DO_PREDIO`, site, SCRUM-284, outra frente).
- Conferir as bases de estudantes e a localização da Residência.
- A recriação do banco da VM: não foi feita por esta entrega.
