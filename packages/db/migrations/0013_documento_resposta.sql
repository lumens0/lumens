CREATE TABLE "documento_resposta" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"pauta_id" uuid NOT NULL,
	"caminho_id" uuid NOT NULL,
	"enviado_por" uuid NOT NULL,
	"arquivo_chave" text NOT NULL,
	"recebido_em" timestamp with time zone DEFAULT now() NOT NULL,
	"promessa_id" uuid,
	CONSTRAINT "documento_resposta_arquivo_chave_unique" UNIQUE("arquivo_chave")
);
--> statement-breakpoint
ALTER TABLE "documento_resposta" ADD CONSTRAINT "documento_resposta_pauta_id_pauta_id_fk" FOREIGN KEY ("pauta_id") REFERENCES "public"."pauta"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documento_resposta" ADD CONSTRAINT "documento_resposta_caminho_id_caminho_id_fk" FOREIGN KEY ("caminho_id") REFERENCES "public"."caminho"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documento_resposta" ADD CONSTRAINT "documento_resposta_enviado_por_estudante_id_fk" FOREIGN KEY ("enviado_por") REFERENCES "public"."estudante"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documento_resposta" ADD CONSTRAINT "documento_resposta_promessa_id_promessa_id_fk" FOREIGN KEY ("promessa_id") REFERENCES "public"."promessa"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "documento_resposta_pauta_id_idx" ON "documento_resposta" USING btree ("pauta_id");--> statement-breakpoint
CREATE INDEX "documento_resposta_caminho_id_idx" ON "documento_resposta" USING btree ("caminho_id");--> statement-breakpoint
CREATE INDEX "documento_resposta_enviado_por_idx" ON "documento_resposta" USING btree ("enviado_por");--> statement-breakpoint
CREATE INDEX "documento_resposta_promessa_id_idx" ON "documento_resposta" USING btree ("promessa_id");