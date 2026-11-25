-- SCRUM-399: cursos que têm aula em outro bloco aceitam apoio nele. Quem cursa Ciência da Computação,
-- Engenharia de Computação ou Inteligência Artificial tem aula no IM (o antigo Bloco 12, ligado ao IC),
-- então o IM aceita os cursos do IC. A regra é direcional: o IC não passa a aceitar Matemática. A lista
-- está em `packages/db/src/cursos-dos-blocos.ts` (AULAS_EM_OUTROS_BLOCOS), e um teste confere as duas.
-- Cadastra pelo slug e não duplica: banco de desenvolvimento (outros slugs) não muda, e rodar de novo
-- não muda nada.
INSERT INTO "bloco_curso" ("bloco_id", "curso")
SELECT b."id", v."curso"
FROM (VALUES
	('im', 'Ciência da Computação'),
	('im', 'Engenharia de Computação'),
	('im', 'Inteligência Artificial')
) AS v("slug", "curso")
JOIN "bloco" b ON b."slug" = v."slug"
ON CONFLICT DO NOTHING;
