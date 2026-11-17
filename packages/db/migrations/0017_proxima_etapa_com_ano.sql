-- Próxima etapa com ano e com prazo vencido (SCRUM-306).
--
-- A 0006 mostrava o prazo do Fala.BR e a entrega prometida como 'DD/MM': um prazo que já passou
-- parecia o do ano seguinte. Agora a data sai sempre como 'DD/MM/YYYY' e, quando já passou, o
-- texto diz que venceu. Só os ramos `cobrando` e `prometido` mudam; colunas, joins e filtro são os
-- mesmos da 0006, e CREATE OR REPLACE mantém o owner e o GRANT para `lumens_site`.
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
		-- O dia do prazo ainda conta como em dia; "hoje" é o de Maceió, não o do TimeZone da sessão.
		WHEN 'cobrando' THEN CASE
			WHEN falabr.prazo IS NULL THEN 'Aguardando resposta'
			WHEN falabr.prazo >= (now() AT TIME ZONE 'America/Maceio')::date
				THEN 'Prazo do Fala.BR em ' || to_char(falabr.prazo, 'DD/MM/YYYY')
			ELSE 'Prazo do Fala.BR venceu em ' || to_char(falabr.prazo, 'DD/MM/YYYY')
		END
		WHEN 'prometido' THEN CASE
			WHEN promessa.data_entrega IS NULL THEN 'Aguardando a entrega'
			WHEN promessa.data_entrega >= (now() AT TIME ZONE 'America/Maceio')::date
				THEN 'Entrega prometida para ' || to_char(promessa.data_entrega, 'DD/MM/YYYY')
			ELSE 'Prazo da entrega venceu em ' || to_char(promessa.data_entrega, 'DD/MM/YYYY')
		END
		WHEN 'entregue_em_parte' THEN 'Cobrar o restante'
		WHEN 'descumprida' THEN 'Retomar a cobrança'
	END AS proxima_etapa
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
