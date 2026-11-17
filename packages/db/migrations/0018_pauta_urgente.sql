ALTER TABLE "pauta" ADD COLUMN "urgente" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "pauta" ADD COLUMN "urgente_desde" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "pauta" ADD COLUMN "urgente_por" uuid;--> statement-breakpoint
ALTER TABLE "pauta" ADD COLUMN "urgente_motivo" text;--> statement-breakpoint
ALTER TABLE "pauta" ADD CONSTRAINT "pauta_urgente_por_curador_id_fk" FOREIGN KEY ("urgente_por") REFERENCES "public"."curador"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pauta" ADD CONSTRAINT "pauta_urgencia_consistente" CHECK (("pauta"."urgente" AND "pauta"."urgente_desde" IS NOT NULL AND "pauta"."urgente_por" IS NOT NULL)
        OR (NOT "pauta"."urgente" AND "pauta"."urgente_desde" IS NULL AND "pauta"."urgente_por" IS NULL));--> statement-breakpoint
CREATE OR REPLACE VIEW "v_pauta_publica" WITH (security_barrier = true) AS
SELECT
	p.slug,
	p.titulo,
	p.descricao,
	p.categoria,
	p.status,
	p.meta,
	apoios.total AS apoios,
	b.slug AS bloco_slug,
	b.nome AS bloco_nome,
	responsaveis.cursos AS cursos_responsaveis,
	p.criada_em,
	p.aprovada_em,
	p.meta_batida_em,
	-- Texto pronto para o card; `conquistada` não tem próxima etapa e fica nulo.
	CASE p.status
		WHEN 'juntando_apoios' THEN CASE
			WHEN p.meta - apoios.total > 1 THEN format('Faltam %s apoios', p.meta - apoios.total)
			WHEN p.meta - apoios.total = 1 THEN 'Falta 1 apoio'
			ELSE 'Meta alcançada'
		END
		WHEN 'meta_batida' THEN 'Aguardando o encaminhamento'
		WHEN 'cobrando' THEN coalesce(
			'Prazo do Fala.BR em ' || to_char(falabr.prazo, 'DD/MM'),
			'Aguardando resposta'
		)
		WHEN 'prometido' THEN coalesce(
			'Entrega prometida para ' || to_char(promessa.data_entrega, 'DD/MM'),
			'Aguardando a entrega'
		)
		WHEN 'entregue_em_parte' THEN 'Cobrar o restante'
		WHEN 'descumprida' THEN 'Retomar a cobrança'
	END AS proxima_etapa,
	p.urgente AS urgente
FROM "pauta" p
LEFT JOIN "bloco" b ON b.id = p.bloco_id
CROSS JOIN LATERAL (
	SELECT count(*)::int AS total FROM "apoio" a WHERE a.pauta_id = p.id
) apoios
-- Cursos distintos dos responsáveis com mandato ativo; nunca quem são.
CROSS JOIN LATERAL (
	SELECT coalesce(
		array_agg(DISTINCT e.curso ORDER BY e.curso) FILTER (WHERE e.curso IS NOT NULL),
		'{}'
	) AS cursos
	FROM "papel_pauta" pp
	JOIN "estudante" e ON e.id = pp.estudante_id
	WHERE pp.pauta_id = p.id AND pp.ate IS NULL
) responsaveis
-- Prazo do caminho Fala.BR aberto mais recentemente; se ele ainda não tem prazo, o texto cai em
-- 'Aguardando resposta' em vez de mostrar o prazo de um Fala.BR anterior.
LEFT JOIN LATERAL (
	SELECT c.prazo
	FROM "caminho" c
	WHERE c.pauta_id = p.id AND c.tipo = 'falabr'
	ORDER BY c.aberto_em DESC
	LIMIT 1
) falabr ON true
-- Promessa ativa: o índice promessa_ativa_por_pauta_unique garante no máximo uma.
LEFT JOIN LATERAL (
	SELECT pr.data_entrega
	FROM "promessa" pr
	WHERE pr.pauta_id = p.id AND pr.resultado IS NULL
) promessa ON true
WHERE p.status IN ('juntando_apoios', 'meta_batida', 'cobrando', 'prometido', 'entregue_em_parte', 'descumprida', 'conquistada');
