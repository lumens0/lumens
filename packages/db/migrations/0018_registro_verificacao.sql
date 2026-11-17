CREATE TABLE "registro_verificacao" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"telefone_hmac" text NOT NULL,
	"email_hmac" text NOT NULL,
	"tipo" text NOT NULL,
	"em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "registro_verificacao_tipo" CHECK ("registro_verificacao"."tipo" IN ('envio', 'erro'))
);
--> statement-breakpoint
CREATE INDEX "registro_verificacao_email_idx" ON "registro_verificacao" USING btree ("email_hmac","em");--> statement-breakpoint
CREATE INDEX "registro_verificacao_telefone_idx" ON "registro_verificacao" USING btree ("telefone_hmac","em");--> statement-breakpoint
CREATE INDEX "registro_verificacao_em_idx" ON "registro_verificacao" USING btree ("em");