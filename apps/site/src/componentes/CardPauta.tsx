import Link from 'next/link';
import { contextoDaPauta } from '../dados/pautas-publicas';
import type { Pauta } from '../dados/tipos';
import { BarraApoios } from './BarraApoios';
import { BotaoApoiar, mostraApoiar } from './BotaoWhatsApp';
import estilos from './componentes.module.css';
import { STATUS, StatusPill } from './StatusPill';

export function CardPauta({ pauta }: { pauta: Pauta }) {
  const id = `pauta-${pauta.slug}`;
  return (
    <article className={estilos.card} aria-labelledby={id}>
      <div className={estilos.topo}>
        <StatusPill status={pauta.status} />
        <span className={estilos.onde}>{contextoDaPauta(pauta.categoria, pauta.bloco_nome)}</span>
      </div>
      <h2 id={id} className={estilos.titulo}>
        <Link href={`/p/${pauta.slug}`}>{pauta.titulo}</Link>
      </h2>
      <BarraApoios
        apoios={pauta.apoios}
        meta={pauta.meta}
        rotulo={`Apoios: ${pauta.titulo}`}
        cor={STATUS[pauta.status].ponto}
      />
      {/* Fora do link do título: <a> dentro de <a> é HTML inválido. */}
      {mostraApoiar(pauta.status) && (
        <div className={estilos.acoesCard}>
          <BotaoApoiar slug={pauta.slug} titulo={pauta.titulo} />
        </div>
      )}
    </article>
  );
}
