-- O bloco `praca-de-alimentacao` saiu do catálogo (seed/blocos-ufal.ts), mas continua nos bancos
-- que já tinham sido semeados. Apaga o bloco só se nenhuma pauta o referencia: pauta com esse bloco
-- guarda a meta e o histórico dele, então nesse caso o bloco fica (e o `bloco_id` da pauta continua
-- válido). A FK `pauta.bloco_id` é RESTRICT, então o DELETE nunca poderia apagar além disso.
DELETE FROM "bloco" b
WHERE b.slug = 'praca-de-alimentacao'
	AND NOT EXISTS (SELECT 1 FROM "pauta" p WHERE p.bloco_id = b.id);
