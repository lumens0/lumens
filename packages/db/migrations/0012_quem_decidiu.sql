ALTER TABLE "pauta" ADD COLUMN "decidida_por" uuid;--> statement-breakpoint
ALTER TABLE "relato" ADD COLUMN "moderado_por" uuid;--> statement-breakpoint
ALTER TABLE "pauta" ADD CONSTRAINT "pauta_decidida_por_curador_id_fk" FOREIGN KEY ("decidida_por") REFERENCES "public"."curador"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "relato" ADD CONSTRAINT "relato_moderado_por_curador_id_fk" FOREIGN KEY ("moderado_por") REFERENCES "public"."curador"("id") ON DELETE restrict ON UPDATE no action;