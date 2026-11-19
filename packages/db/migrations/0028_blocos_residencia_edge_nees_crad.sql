-- Blocos que entraram no catálogo (`packages/db/seed/blocos-ufal.ts`) depois que os bancos da
-- homologação e da produção já tinham sido semeados: a Residência Universitária (RUA) e os três
-- lugares que o mapa do site desenha e o OpenStreetMap não tem (EDGE Academy, NEES e CRAD). Sem
-- esta migração eles só apareceriam depois de alguém rodar `pnpm db:blocos-ufal` à mão: o bot e o
-- site mostram os blocos que estão no banco.
--
-- Só roda onde o catálogo real já foi cadastrado (existe o bloco `ic`). Banco de desenvolvimento,
-- com os blocos fictícios do seed, e banco novo e vazio ficam como estão: eles recebem o catálogo
-- (com estes quatro) quando o `db:blocos-ufal` rodar. Cadastra pelo slug e não mexe em bloco que já
-- existe (rodar de novo, ou depois do `db:blocos-ufal`, não duplica nem muda nada). As bases são
-- estimativas, como as demais do catálogo.
INSERT INTO "bloco" ("slug", "nome", "base_estudantes")
SELECT novos.slug, novos.nome, novos.base_estudantes
FROM (VALUES
	('residencia-universitaria', 'Residência Universitária', 300),
	('edge-academy', 'EDGE Academy', 300),
	('nees', 'NEES (RIEH)', 150),
	('crad', 'CRAD', 200)
) AS novos (slug, nome, base_estudantes)
WHERE EXISTS (SELECT 1 FROM "bloco" WHERE "slug" = 'ic')
ON CONFLICT ("slug") DO NOTHING;
