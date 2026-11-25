-- SCRUM-399: blocos ligados entre si aceitam os cursos uns dos outros. O IC, o CEPETEC e o IM (o antigo
-- Bloco 12) são prédios interligados, e os alunos de um circulam pelos outros. Esta migração soma
-- aos vínculos da 0033 os cursos que faltam: Matemática no IC e no CEPETEC, e os cursos do IC no IM.
-- A lista está em `packages/db/src/cursos-dos-blocos.ts` (BLOCOS_COLIGADOS), e um teste confere as
-- duas. Cadastra pelo slug e não duplica: banco de desenvolvimento (outros slugs) não muda, e rodar
-- de novo não muda nada.
INSERT INTO "bloco_curso" ("bloco_id", "curso")
SELECT b."id", v."curso"
FROM (VALUES
	('ic', 'Matemática'),
	('cepetec', 'Matemática'),
	('im', 'Ciência da Computação'),
	('im', 'Engenharia de Computação'),
	('im', 'Inteligência Artificial')
) AS v("slug", "curso")
JOIN "bloco" b ON b."slug" = v."slug"
ON CONFLICT DO NOTHING;
