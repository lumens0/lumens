-- SCRUM-313: antes do CHECK, só o maxLength do formulário limitava resumo e fonte, e um POST montado
-- à mão gravava o texto inteiro. Uma linha assim faria esta migração falhar e travar o deploy, então
-- ela é cortada no teto, terminando em "…". O texto original continua no evento promessa_registrada.
UPDATE "promessa" SET "resumo" = left("resumo", 499) || '…' WHERE char_length("resumo") > 500;--> statement-breakpoint
UPDATE "promessa" SET "fonte" = left("fonte", 119) || '…' WHERE char_length("fonte") > 120;--> statement-breakpoint
ALTER TABLE "promessa" ADD CONSTRAINT "promessa_resumo_ate_500" CHECK (char_length("promessa"."resumo") <= 500);--> statement-breakpoint
ALTER TABLE "promessa" ADD CONSTRAINT "promessa_fonte_ate_120" CHECK (char_length("promessa"."fonte") <= 120);
