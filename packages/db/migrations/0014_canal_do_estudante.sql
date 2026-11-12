CREATE TYPE "public"."canal" AS ENUM('whatsapp', 'telegram');--> statement-breakpoint
ALTER TABLE "estudante" ADD COLUMN "canal" "canal" DEFAULT 'whatsapp' NOT NULL;