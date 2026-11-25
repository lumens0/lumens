-- SCRUM-401: o site mostra, no painel de cada bloco, quais cursos podem apoiar e abrir pauta nele
-- (SCRUM-399), para a regra ser conhecida antes de tentar. A coluna nova entra no fim da view, como
-- o CREATE OR REPLACE exige, e `lumens_site` continua lendo só a view (bloco_curso não é concedida a
-- ele). Bloco sem cursos devolve lista vazia: é aberto a qualquer estudante verificado.
CREATE OR REPLACE VIEW "v_bloco" WITH (security_barrier = true) AS
SELECT
	b.slug,
	b.nome,
	b.base_estudantes,
	ARRAY(
		SELECT bc."curso" FROM "bloco_curso" bc WHERE bc."bloco_id" = b."id" ORDER BY bc."curso"
	) AS cursos
FROM "bloco" b;
