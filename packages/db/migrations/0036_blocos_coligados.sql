-- SCRUM-399: cursos que têm aula em outro bloco aceitam apoio nele, e laboratórios do IC aceitam os
-- alunos do IC.
--
-- 1. Quem cursa Ciência da Computação, Engenharia de Computação ou Inteligência Artificial tem aula no
--    IM (o antigo Bloco 12, ligado ao IC), então o IM aceita os cursos do IC. A regra é direcional: o IC
--    não passa a aceitar Matemática.
-- 2. O EDGE Academy e o NEES (RIEH) são laboratórios fechados cuja base de alunos são os do IC, como o
--    CEPETEC (que a 0033 já cobre): aceitam os cursos do IC. Antes ficavam abertos a qualquer estudante.
--
-- A lista está em `packages/db/src/cursos-dos-blocos.ts` (AULAS_EM_OUTROS_BLOCOS e SUBBLOCOS), e um
-- teste confere as duas. Cadastra pelo slug e não duplica: banco de desenvolvimento (outros slugs) não
-- muda, e rodar de novo não muda nada.
INSERT INTO "bloco_curso" ("bloco_id", "curso")
SELECT b."id", v."curso"
FROM (VALUES
	('im', 'Ciência da Computação'),
	('im', 'Engenharia de Computação'),
	('im', 'Inteligência Artificial'),
	('edge-academy', 'Ciência da Computação'),
	('edge-academy', 'Engenharia de Computação'),
	('edge-academy', 'Inteligência Artificial'),
	('nees', 'Ciência da Computação'),
	('nees', 'Engenharia de Computação'),
	('nees', 'Inteligência Artificial')
) AS v("slug", "curso")
JOIN "bloco" b ON b."slug" = v."slug"
ON CONFLICT DO NOTHING;
