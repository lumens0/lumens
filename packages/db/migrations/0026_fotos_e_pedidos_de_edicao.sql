CREATE TYPE "public"."status_pedido_edicao" AS ENUM('pendente', 'aprovado', 'recusado');--> statement-breakpoint
ALTER TYPE "public"."tipo_disparo" ADD VALUE 'foto_recusada';--> statement-breakpoint
ALTER TYPE "public"."tipo_disparo" ADD VALUE 'edicao_decidida';--> statement-breakpoint
CREATE TABLE "pedido_edicao" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"pauta_id" uuid NOT NULL,
	"estudante_id" uuid NOT NULL,
	"campo" text NOT NULL,
	"antes" text NOT NULL,
	"depois" text NOT NULL,
	"status" "status_pedido_edicao" DEFAULT 'pendente' NOT NULL,
	"motivo_recusa" text,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"decidido_em" timestamp with time zone,
	"decidido_por" uuid,
	CONSTRAINT "pedido_edicao_campo" CHECK ("pedido_edicao"."campo" IN ('titulo', 'descricao')),
	CONSTRAINT "pedido_edicao_recusa_com_motivo" CHECK ("pedido_edicao"."status" <> 'recusado' OR char_length(btrim(coalesce("pedido_edicao"."motivo_recusa", ''))) > 0)
);
--> statement-breakpoint
CREATE TABLE "relato_foto" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"relato_id" uuid NOT NULL,
	"chave" text NOT NULL,
	"ordem" integer NOT NULL,
	"moderacao" "moderacao_relato" DEFAULT 'pendente' NOT NULL,
	"motivo_recusa" text,
	"moderado_em" timestamp with time zone,
	"moderado_por" uuid,
	"criada_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "relato_foto_chave_unique" UNIQUE("chave"),
	CONSTRAINT "relato_foto_ordem_de_1_a_3" CHECK ("relato_foto"."ordem" BETWEEN 1 AND 3),
	CONSTRAINT "relato_foto_recusa_com_motivo" CHECK ("relato_foto"."moderacao" <> 'recusado' OR char_length(btrim(coalesce("relato_foto"."motivo_recusa", ''))) > 0)
);
--> statement-breakpoint
ALTER TABLE "pedido_edicao" ADD CONSTRAINT "pedido_edicao_pauta_id_pauta_id_fk" FOREIGN KEY ("pauta_id") REFERENCES "public"."pauta"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pedido_edicao" ADD CONSTRAINT "pedido_edicao_estudante_id_estudante_id_fk" FOREIGN KEY ("estudante_id") REFERENCES "public"."estudante"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pedido_edicao" ADD CONSTRAINT "pedido_edicao_decidido_por_curador_id_fk" FOREIGN KEY ("decidido_por") REFERENCES "public"."curador"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "relato_foto" ADD CONSTRAINT "relato_foto_relato_id_relato_id_fk" FOREIGN KEY ("relato_id") REFERENCES "public"."relato"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "relato_foto" ADD CONSTRAINT "relato_foto_moderado_por_curador_id_fk" FOREIGN KEY ("moderado_por") REFERENCES "public"."curador"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "pedido_edicao_pauta_id_idx" ON "pedido_edicao" USING btree ("pauta_id");--> statement-breakpoint
CREATE INDEX "pedido_edicao_estudante_id_idx" ON "pedido_edicao" USING btree ("estudante_id");--> statement-breakpoint
CREATE UNIQUE INDEX "pedido_edicao_pendente_unico" ON "pedido_edicao" USING btree ("pauta_id","campo") WHERE "pedido_edicao"."status" = 'pendente';--> statement-breakpoint
CREATE UNIQUE INDEX "relato_foto_ordem_unique" ON "relato_foto" USING btree ("relato_id","ordem");--> statement-breakpoint
-- Dados existentes: a foto única de cada relato vira a foto 1 em `relato_foto`, com a moderação do
-- relato (foto de relato aprovado segue no ar; a pendente espera; a recusada continua recusada, com
-- um motivo genérico porque a recusa antiga não guardava motivo). Nada é apagado antes da cópia.
INSERT INTO "relato_foto" ("relato_id", "chave", "ordem", "moderacao", "motivo_recusa", "moderado_em", "moderado_por")
SELECT r.id, r.foto_chave, 1, r.moderacao,
	CASE WHEN r.moderacao = 'recusado' THEN 'Recusada junto com o relato.' END,
	r.moderado_em, r.moderado_por
FROM "relato" r
WHERE r.foto_chave IS NOT NULL;
--> statement-breakpoint
-- A view lia `relato.foto_chave`: sai antes da coluna e volta com `fotos`, só as aprovadas, em ordem.
DROP VIEW "v_relato_publico";
--> statement-breakpoint
ALTER TABLE "relato" DROP COLUMN "foto_chave";
--> statement-breakpoint
CREATE VIEW "v_relato_publico" WITH (security_barrier = true) AS
SELECT
	p.slug AS pauta_slug,
	r.texto,
	coalesce(
		(SELECT array_agg(f.chave ORDER BY f.ordem) FROM "relato_foto" f WHERE f.relato_id = r.id AND f.moderacao = 'aprovado'),
		'{}'::text[]
	) AS fotos,
	e.curso,
	r.moderado_em
FROM "relato" r
JOIN "pauta" p ON p.id = r.pauta_id
JOIN "estudante" e ON e.id = r.estudante_id
WHERE r.moderacao = 'aprovado' AND p.status IN ('juntando_apoios', 'meta_batida', 'cobrando', 'prometido', 'entregue_em_parte', 'descumprida', 'conquistada');
--> statement-breakpoint
GRANT SELECT ON "v_relato_publico" TO "lumens_site";