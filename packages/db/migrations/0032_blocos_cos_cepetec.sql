-- Dois blocos que o mapa já desenhava como prédio, mas que não estavam no catálogo
-- (`packages/db/seed/blocos-ufal.ts`): o CEPETEC (Centro de Pesquisa Tecnológica do Instituto de
-- Computação, atrás do IC) e o COS (Comunicação Social, ao lado do IC). Sem bloco no banco o prédio
-- fica sem nome nas listas e sem marcador, e não dá para criar pauta nele.
--
-- Só roda onde o catálogo real já foi cadastrado (existe o bloco `ic`), pelo mesmo motivo da 0028.
-- Cadastra pelo slug e não mexe em bloco que já existe. As bases são estimativas da equipe.
INSERT INTO "bloco" ("slug", "nome", "base_estudantes")
SELECT novos.slug, novos.nome, novos.base_estudantes
FROM (VALUES
	('cepetec', 'CEPETEC - Centro de Pesquisa Tecnológica do IC', 100),
	('cos', 'COS - Comunicação Social', 400)
) AS novos (slug, nome, base_estudantes)
WHERE EXISTS (SELECT 1 FROM "bloco" WHERE "slug" = 'ic')
ON CONFLICT ("slug") DO NOTHING;
