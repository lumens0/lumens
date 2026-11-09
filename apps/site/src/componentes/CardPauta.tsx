import Link from 'next/link';
import { contextoDaPauta } from '../dados/pautas-publicas';
import type { Pauta } from '../dados/tipos';
import { BarraApoios } from './BarraApoios';
import { BotaoApoiar, mostraApoiar } from './BotaoWhatsApp';
import estilos from './componentes.module.css';
import { StatusPill } from './StatusPill';

export function CardPauta({ pauta }: { pauta: Pauta }) {
  const id = `pauta-${pauta.slug}`;
  return (
    <article className={estilos.card} aria-labelledby={id}>
      <span className={estilos.contexto}>{contextoDaPauta(pauta.categoria, pauta.bloco_nome)}</span>
      <h2 id={id} className={estilos.titulo}>
        <Link href={`/p/${pauta.slug}`}>{pauta.titulo}</Link>
      </h2>
      <StatusPill status={pauta.status} />
      <BarraApoios apoios={pauta.apoios} meta={pauta.meta} rotulo={`Apoios: ${pauta.titulo}`} />
      {/* Fora do link do título: <a> dentro de <a> é HTML inválido. */}
      {mostraApoiar(pauta.status) && (
        <div className={estilos.acoesCard}>
          <BotaoApoiar slug={pauta.slug} titulo={pauta.titulo} />
        </div>
      )}
    </article>
  );
}
