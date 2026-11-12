CREATE TYPE "public"."canal" AS ENUM('whatsapp', 'telegram');--> statement-breakpoint
CREATE TABLE "chat_telegram" (
	"chat_hmac" text PRIMARY KEY NOT NULL,
	"chat_cifrado" text NOT NULL,
	"telefone_hmac" text,
	"telefone_cifrado" text,
	"comando_pendente_cifrado" text,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "chat_telegram_telefone_hmac_unique" UNIQUE("telefone_hmac"),
	CONSTRAINT "chat_telegram_telefone_completo" CHECK (("chat_telegram"."telefone_hmac" IS NULL) = ("chat_telegram"."telefone_cifrado" IS NULL))
);
--> statement-breakpoint
ALTER TABLE "disparo" ADD COLUMN "canal" "canal";