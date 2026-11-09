import Link from 'next/link';
import { aceitaApoio, contextoDaPauta } from '../dados/pautas-publicas';
import type { Pauta } from '../dados/tipos';
import { comandoApoiar } from '../whatsapp';
import { BarraApoios } from './BarraApoios';
import { BotaoWhatsApp } from './BotaoWhatsApp';
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
