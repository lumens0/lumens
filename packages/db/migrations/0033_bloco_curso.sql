CREATE TABLE "bloco_curso" (
	"bloco_id" uuid NOT NULL,
	"curso" text NOT NULL,
	CONSTRAINT "bloco_curso_bloco_id_curso_pk" PRIMARY KEY("bloco_id","curso")
);
--> statement-breakpoint
ALTER TABLE "bloco_curso" ADD CONSTRAINT "bloco_curso_bloco_id_bloco_id_fk" FOREIGN KEY ("bloco_id") REFERENCES "public"."bloco"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
-- SCRUM-399: os cursos de cada bloco de unidade, nos bancos que já têm o catálogo real. Bloco que não
-- está na lista (Biblioteca, RU, blocos de aula, Ginásio, Residência, EDGE, NEES, CRAD, CSAU) fica sem
-- linha e, portanto, aberto a qualquer estudante verificado. Cadastra pelo slug e não duplica: banco de
-- desenvolvimento (outros slugs) não ganha vínculo, e rodar de novo não muda nada. A mesma lista está
-- em `packages/db/src/cursos-dos-blocos.ts`; um teste confere as duas.
INSERT INTO "bloco_curso" ("bloco_id", "curso")
SELECT b."id", v."curso"
FROM (VALUES
	('ic', 'Ciência da Computação'),
	('ic', 'Engenharia de Computação'),
	('ic', 'Inteligência Artificial'),
	('im', 'Matemática'),
	('if', 'Física'),
	('iqb', 'Química'),
	('iqb', 'Química Tecnológica e Industrial'),
	('icbs', 'Ciências Biológicas'),
	('famed', 'Medicina'),
	('fanut', 'Nutrição'),
	('eenf', 'Enfermagem'),
	('foufal', 'Odontologia'),
	('icf', 'Farmácia'),
	('ctec', 'Engenharia Civil'),
	('ctec', 'Engenharia Química'),
	('ctec', 'Engenharia de Petróleo'),
	('ctec', 'Engenharia Ambiental e Sanitária'),
	('fau', 'Arquitetura e Urbanismo'),
	('fau', 'Design'),
	('fda', 'Direito'),
	('feac', 'Administração'),
	('feac', 'Ciências Contábeis'),
	('feac', 'Ciências Econômicas'),
	('fale', 'Letras - Espanhol'),
	('fale', 'Letras - Francês'),
	('fale', 'Letras - Inglês'),
	('fale', 'Letras - Libras'),
	('fale', 'Letras - Português'),
	('fsso', 'Serviço Social'),
	('ics', 'Ciências Sociais'),
	('ichca', 'História'),
	('ichca', 'Filosofia'),
	('ichca', 'Jornalismo'),
	('ichca', 'Relações Públicas'),
	('ichca', 'Biblioteconomia'),
	('ichca', 'Dança'),
	('ichca', 'Teatro'),
	('ichca', 'Música'),
	('icat', 'Meteorologia'),
	('igdema', 'Geografia'),
	('ip', 'Psicologia'),
	('cedu', 'Pedagogia'),
	('iefe', 'Educação Física'),
	('cepetec', 'Ciência da Computação'),
	('cepetec', 'Engenharia de Computação'),
	('cepetec', 'Inteligência Artificial'),
	('cos', 'Jornalismo'),
	('cos', 'Relações Públicas')

) AS v("slug", "curso")
JOIN "bloco" b ON b."slug" = v."slug"
ON CONFLICT DO NOTHING;
