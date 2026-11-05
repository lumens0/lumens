CREATE EXTENSION IF NOT EXISTS "unaccent" WITH SCHEMA "public";
--> statement-breakpoint
CREATE EXTENSION IF NOT EXISTS "pg_trgm" WITH SCHEMA "public";
--> statement-breakpoint
CREATE TEXT SEARCH CONFIGURATION "public"."portugues_sem_acento" (COPY = "pg_catalog"."portuguese");
--> statement-breakpoint
ALTER TEXT SEARCH CONFIGURATION "public"."portugues_sem_acento"
	ALTER MAPPING FOR "hword", "hword_part", "word"
	WITH "public"."unaccent", "pg_catalog"."portuguese_stem";
--> statement-breakpoint
CREATE FUNCTION "public"."normalizar_busca"(texto text) RETURNS text
LANGUAGE sql
IMMUTABLE
STRICT
PARALLEL SAFE
AS $$
	SELECT replace(lower("public"."unaccent"('"public"."unaccent"'::regdictionary, texto)), '-', '')
$$;
--> statement-breakpoint
ALTER TABLE "pauta" DROP COLUMN "busca";
--> statement-breakpoint
ALTER TABLE "pauta" ADD COLUMN "busca" tsvector GENERATED ALWAYS AS (setweight(to_tsvector('public.portugues_sem_acento'::regconfig, "titulo"), 'A') || setweight(to_tsvector('public.portugues_sem_acento'::regconfig, "descricao"), 'B')) STORED NOT NULL;
--> statement-breakpoint
CREATE INDEX "pauta_busca_idx" ON "pauta" USING gin ("busca");
