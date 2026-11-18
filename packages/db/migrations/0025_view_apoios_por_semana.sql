-- Apoios por semana para o dashboard do site (SCRUM-362).
--
-- Uma linha por semana (segunda-feira, em UTC) e bloco, só com semanas em que houve apoio: o
-- preenchimento das semanas vazias com zero é feito na API. Só números agregados: nada de
-- estudante, HMAC ou id interno. Conta os apoios que existem hoje (quem sai do Lumens perde o
-- apoio) e só de pautas públicas, a mesma allowlist de status das outras views.
CREATE VIEW "v_apoio_semana" WITH (security_barrier = true) AS
SELECT
	(date_trunc('week', a.criado_em AT TIME ZONE 'UTC'))::date AS semana,
	b.slug AS bloco_slug,
	count(*)::int AS apoios
FROM "apoio" a
JOIN "pauta" p ON p.id = a.pauta_id
LEFT JOIN "bloco" b ON b.id = p.bloco_id
WHERE p.status IN ('juntando_apoios', 'meta_batida', 'cobrando', 'prometido', 'entregue_em_parte', 'descumprida', 'conquistada')
GROUP BY 1, 2;
--> statement-breakpoint
GRANT SELECT ON "v_apoio_semana" TO "lumens_site";
