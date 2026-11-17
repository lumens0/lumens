ALTER TYPE "public"."tipo_disparo" ADD VALUE 'remarcacao';--> statement-breakpoint
ALTER TABLE "caminho" ADD COLUMN "protocolo_em" date;--> statement-breakpoint
ALTER TABLE "caminho" ADD COLUMN "prorrogado" boolean DEFAULT false NOT NULL;--> statement-breakpoint
-- Caminhos que já tinham protocolo: o prazo gravado é o inicial (o bot nunca registrou prorrogação e
-- não havia como registrar depois), então o dia do protocolo é o prazo menos 30 dias.
UPDATE "caminho" SET "protocolo_em" = "prazo" - 30 WHERE "protocolo" IS NOT NULL AND "prazo" IS NOT NULL;
