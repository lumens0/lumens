ALTER TYPE "public"."tipo_disparo" ADD VALUE 'remarcacao';--> statement-breakpoint
ALTER TABLE "caminho" ADD COLUMN "protocolo_em" date;--> statement-breakpoint
ALTER TABLE "caminho" ADD COLUMN "prorrogado" boolean DEFAULT false NOT NULL;--> statement-breakpoint
-- Caminhos que já tinham protocolo: o prazo gravado é o inicial (o bot nunca registrou prorrogação e
-- não havia como registrar depois), então o dia do protocolo é o prazo menos 30 dias.
UPDATE "caminho" SET "protocolo_em" = "prazo" - 30 WHERE "protocolo" IS NOT NULL AND "prazo" IS NOT NULL;--> statement-breakpoint
-- `prorrogado` entra no fim da view pública de caminhos, porque `v_linha_do_tempo` remove `*_id` e o
-- site precisa saber qual caminho teve o prazo prorrogado.
CREATE OR REPLACE VIEW "v_caminho_publico" WITH (security_barrier = true) AS
SELECT
	p.slug AS pauta_slug,
	c.tipo::text AS tipo,
	c.status,
	c.protocolo,
	c.prazo,
	c.aberto_em,
	NULL::text AS descricao,
	NULL::int AS pessoas_necessarias,
	NULL::int AS voluntarios,
	NULL::timestamptz AS executada_em,
	c.prorrogado
FROM "caminho" c
JOIN "pauta" p ON p.id = c.pauta_id
WHERE p.status IN ('juntando_apoios', 'meta_batida', 'cobrando', 'prometido', 'entregue_em_parte', 'descumprida', 'conquistada')
UNION ALL
SELECT
	p.slug AS pauta_slug,
	'proposta' AS tipo,
	pr.status::text AS status,
	NULL AS protocolo,
	NULL AS prazo,
	NULL AS aberto_em,
	pr.descricao,
	pr.pessoas_necessarias,
	(SELECT count(*) FROM "voluntario" v WHERE v.proposta_id = pr.id)::int AS voluntarios,
	pr.executada_em,
	false AS prorrogado
FROM "proposta" pr
JOIN "pauta" p ON p.id = pr.pauta_id
WHERE p.status IN ('juntando_apoios', 'meta_batida', 'cobrando', 'prometido', 'entregue_em_parte', 'descumprida', 'conquistada');
