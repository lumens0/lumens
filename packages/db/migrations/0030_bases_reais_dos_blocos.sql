-- Bases de estudantes dos blocos, pelos alunos ativos por curso do relatório oficial da UFAL (NTI,
-- SIE Web, 10/06/2020, período 2020.1): a soma dos cursos de graduação presencial de cada unidade.
-- A tabela curso a curso, a fonte e o que ficou de fora estão em docs/operacao/bases-dos-blocos.md.
--
-- Corrige só quem ainda tem a estimativa antiga do catálogo (a coluna `velho`): base que alguém
-- ajustou à mão não é tocada, e banco de desenvolvimento (outros slugs) não muda. A meta de uma pauta
-- congela na criação, então pauta já criada não muda; só as novas usam a base nova.
UPDATE "bloco" AS b
SET "base_estudantes" = c.novo
FROM (VALUES
	('ic', 550, 585),
	('im', 500, 457),
	('if', 350, 228),
	('iqb', 600, 698),
	('icbs', 350, 635),
	('famed', 500, 537),
	('fanut', 250, 300),
	('eenf', 300, 285),
	('foufal', 250, 282),
	('icf', 250, 276),
	('ctec', 1000, 1019),
	('fau', 550, 736),
	('fda', 800, 823),
	('feac', 1500, 1859),
	('fale', 1000, 883),
	('fsso', 450, 583),
	('ics', 300, 376),
	('ichca', 1600, 2046),
	('icat', 200, 178),
	('igdema', 600, 635),
	('ip', 400, 390),
	('cedu', 700, 1139),
	('iefe', 400, 638)
) AS c (slug, velho, novo)
WHERE b."slug" = c.slug AND b."base_estudantes" = c.velho;
