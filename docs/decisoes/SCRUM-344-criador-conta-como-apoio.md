# SCRUM-344 · Quem cria a pauta conta como apoio

Bug · Parte 2 · 2026-11-16 · @JGSEIXAS
**Situação:** decidida. Aprovada por Sthefany Lima em 16/11/2026, para as pautas novas.

## O problema

Criar a pauta não registrava apoio, e o bot nunca oferece apoiar a própria pauta. O total de apoios,
o texto do Fala.BR, o aviso da promessa e a conferência contam só a tabela `apoio`. Na verificação de
15/11:

- a pauta recém-aprovada aparecia no site com 0 apoios;
- o owner que protocolava cedo (a RN05 permite) colava na ouvidoria "apresentada coletivamente por
  0 estudantes";
- quem criou e cuida da pauta não recebia a resposta oficial nem o "Foi feito?", e não votava na
  conferência da própria pauta.

## Decisão

1. **Na aprovação, quem cuida da pauta ganha o primeiro apoio**, pelo `registrarApoio`, na mesma
   transação da aprovação. Nesse momento só quem criou é owner: virar co-owner exige ter apoiado, e
   apoio só existe depois da aprovação. Com isso, **todo owner tem apoio**, e o aviso da promessa e a
   conferência chegam a ele pelo caminho que já existe, sem regra à parte.
2. **Na aprovação, e não na criação:** pauta recusada não fica com apoio, e o apoio não conta
   enquanto a pauta não aparece no site (RN12).
3. **Quem saiu do Lumens enquanto a pauta esperava a curadoria** não vira apoio. O `registrarApoio`
   recusa, e a aprovação segue.
4. **O texto do Fala.BR só fala em apoio coletivo a partir de 2 apoios.** Com 0 ou 1, o parágrafo
   "Apoio" sai e o pedido vale sozinho. Nunca aparece "0 estudantes" nem "1 estudantes".

## O que fica de fora

- **Pautas aprovadas antes desta mudança** continuam sem o apoio de quem criou, e isso foi decidido: o
  backfill não entra nesta PR e vira task própria. Ele deve ser feito por script que chame
  `registrarApoio` (para respeitar a meta e os avisos), e não por migração SQL, com conferência do
  total antes de rodar. Até lá, pautas antigas e novas têm regras diferentes de quórum e de aviso da
  promessa, e os números públicos de pautas que já estão no site não mudam.
