import Link from 'next/link';
import type { Pauta, StatusPauta } from '../dados/tipos';
import { comandoApoiar } from '../whatsapp';
import { BarraApoios } from './BarraApoios';
import { BotaoWhatsApp } from './BotaoWhatsApp';
import estilos from './componentes.module.css';
import { StatusPill } from './StatusPill';

/**
 * Status que não recebem apoio. Espelha `SEM_APOIO` de `packages/dominio/src/apoio.ts`, que não é
 * exportado e puxa `@lumens/db` (servidor); manter as duas listas juntas. `em_curadoria` e
 * `recusada` nem chegam ao site, mas ficam aqui para a regra ser a mesma.
 */
const SEM_APOIO: ReadonlySet<StatusPauta> = new Set(['em_curadoria', 'recusada', 'conquistada']);

export function aceitaApoio(status: StatusPauta): boolean {
  return !SEM_APOIO.has(status);
}

export function CardPauta({ pauta }: { pauta: Pauta }) {
  const id = `pauta-${pauta.slug}`;
  return (
    <article className={estilos.card} aria-labelledby={id}>
      <span className={estilos.contexto}>
        {pauta.categoria} · {pauta.bloco_nome ?? 'Todo o campus'}
      </span>
      <h2 id={id} className={estilos.titulo}>
        <Link href={`/p/${pauta.slug}`}>{pauta.titulo}</Link>
      </h2>
      <StatusPill status={pauta.status} />
      <BarraApoios apoios={pauta.apoios} meta={pauta.meta} rotulo={`Apoios: ${pauta.titulo}`} />
      {/* Fora do link do título: <a> dentro de <a> é HTML inválido. */}
      {aceitaApoio(pauta.status) && (
        <div className={estilos.acoesCard}>
          <BotaoWhatsApp
            comando={comandoApoiar(pauta.slug)}
            texto="Apoiar"
            rotulo={`Apoiar a pauta ${pauta.titulo} pelo WhatsApp`}
          />
        </div>
      )}
    </article>
  );
}
