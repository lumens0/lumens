CREATE TABLE "conquista_curadoria" (
	"pauta_id" uuid PRIMARY KEY NOT NULL,
	"o_que_foi_feito" text,
	"foto_chave" text,
	"atualizado_por" uuid NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "conquista_curadoria_texto_de_1_a_160" CHECK ("conquista_curadoria"."o_que_foi_feito" IS NULL OR char_length(btrim("conquista_curadoria"."o_que_foi_feito")) BETWEEN 1 AND 160),
	CONSTRAINT "conquista_curadoria_chave_da_foto" CHECK ("conquista_curadoria"."foto_chave" IS NULL OR "conquista_curadoria"."foto_chave" ~ '^fotos/[0-9]{4}/[0-9]{2}/[A-Za-z0-9_-]+[.][a-z0-9]{1,5}$'),
	CONSTRAINT "conquista_curadoria_com_texto_ou_foto" CHECK ("conquista_curadoria"."o_que_foi_feito" IS NOT NULL OR "conquista_curadoria"."foto_chave" IS NOT NULL)
);
--> statement-breakpoint
ALTER TABLE "conquista_curadoria" ADD CONSTRAINT "conquista_curadoria_pauta_id_pauta_id_fk" FOREIGN KEY ("pauta_id") REFERENCES "public"."pauta"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conquista_curadoria" ADD CONSTRAINT "conquista_curadoria_atualizado_por_curador_id_fk" FOREIGN KEY ("atualizado_por") REFERENCES "public"."curador"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
-- O texto e a foto entram no fim das colunas: o CREATE OR REPLACE só aceita acrescentar depois das
-- existentes, e assim o GRANT ao `lumens_site` se mantém. Só pauta `conquistada` está na view, e o
-- autor (`atualizado_por`) e o instante não saem dela.
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
	p.criada_em,
	cc.o_que_foi_feito,
	cc.foto_chave
FROM "pauta" p
LEFT JOIN "bloco" b ON b.id = p.bloco_id
LEFT JOIN "conquista_curadoria" cc ON cc.pauta_id = p.id
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
--> statement-breakpoint
-- A rota pública de foto passa a servir também a foto da conquista, mas só enquanto a pauta está
-- conquistada. Mesma coluna (`chave`), então o GRANT continua valendo.
CREATE OR REPLACE VIEW "v_foto_publica" WITH (security_barrier = true) AS
SELECT f.chave
FROM "relato_foto" f
JOIN "relato" r ON r.id = f.relato_id
JOIN "pauta" p ON p.id = r.pauta_id
WHERE f.moderacao = 'aprovado' AND r.moderacao = 'aprovado' AND p.status IN ('juntando_apoios', 'meta_batida', 'cobrando', 'prometido', 'entregue_em_parte', 'descumprida', 'conquistada')
UNION ALL
SELECT cc.foto_chave AS chave
FROM "conquista_curadoria" cc
JOIN "pauta" p ON p.id = cc.pauta_id
WHERE cc.foto_chave IS NOT NULL AND p.status = 'conquistada';
