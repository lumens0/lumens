CREATE TABLE "foto_a_remover" (
	"chave" text PRIMARY KEY NOT NULL,
	"enfileirada_em" timestamp with time zone DEFAULT now() NOT NULL,
	"tentativas" integer DEFAULT 0 NOT NULL
);
