-- SCRUM-56: a página /conquistas mostra quantos dias a pauta levou da criação à entrega. A view
-- expõe o fato (`criada_em`) e o site faz a conta. A coluna nova vai no fim: o CREATE OR REPLACE
-- só aceita acrescentar colunas depois das existentes, e assim o GRANT ao `lumens_site` se mantém.
CREATE OR REPLACE VIEW "v_conquista" WITH (security_barrier = true) AS
SELECT
	p.slug AS pauta_slug,
	p.titulo,
	b.nome AS bloco_nome,
	conquista.em AS conquistada_em,
	(SELECT count(*) FROM "apoio" a WHERE a.pauta_id = p.id)::int AS apoios,
	EXISTS (
		SELECT 1 FROM "proposta" pr WHERE pr.pauta_id = p.id AND pr.status = 'executada'
	) AS proposta_executada,
	p.criada_em
FROM "pauta" p
LEFT JOIN "bloco" b ON b.id = p.bloco_id
-- A pauta não guarda a data da conquista: ela sai do evento público da transição.
LEFT JOIN LATERAL (
	SELECT max(e.criado_em) AS em
	FROM "evento" e
	WHERE e.pauta_id = p.id
		AND e.publico
		AND e.tipo = 'status_alterado'
		AND e.dados ->> 'para' = 'conquistada'
) conquista ON true
WHERE p.status = 'conquistada';
