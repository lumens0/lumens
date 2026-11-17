CREATE TYPE "public"."acao_curador" AS ENUM('adicionou', 'desativou', 'reativou');--> statement-breakpoint
CREATE TYPE "public"."papel_curador" AS ENUM('curador', 'administrador');--> statement-breakpoint
CREATE TABLE "curador_auditoria" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"acao" "acao_curador" NOT NULL,
	"autor_id" uuid NOT NULL,
	"alvo_id" uuid NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "curador" ADD COLUMN "papel" "papel_curador" DEFAULT 'curador' NOT NULL;--> statement-breakpoint
ALTER TABLE "curador" ADD COLUMN "criado_em" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "curador_auditoria" ADD CONSTRAINT "curador_auditoria_autor_id_curador_id_fk" FOREIGN KEY ("autor_id") REFERENCES "public"."curador"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "curador_auditoria" ADD CONSTRAINT "curador_auditoria_alvo_id_curador_id_fk" FOREIGN KEY ("alvo_id") REFERENCES "public"."curador"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
-- Quem já entrava no painel antes dos papéis era quem o script cadastrou: passa a administrador.
UPDATE "curador" SET "papel" = 'administrador';--> statement-breakpoint
-- A aplicação só liga e desliga curador (`ativo`) e recifra o e-mail na rotação da CHAVE_CIFRA
-- (`email_cifrado`): não troca nome nem papel, e não apaga.
REVOKE UPDATE, DELETE, TRUNCATE ON TABLE "curador" FROM "lumens_app";--> statement-breakpoint
GRANT UPDATE ("ativo", "email_cifrado") ON TABLE "curador" TO "lumens_app";--> statement-breakpoint
-- A auditoria é só inserção, como o `evento`.
REVOKE UPDATE, DELETE, TRUNCATE ON TABLE "curador_auditoria" FROM "lumens_app";--> statement-breakpoint
REVOKE UPDATE, DELETE, TRUNCATE ON TABLE "curador_auditoria" FROM PUBLIC;
