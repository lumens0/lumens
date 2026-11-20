import { rotuloDaCategoria } from '@lumens/contratos';
import Link from 'next/link';
import type { CSSProperties } from 'react';
import type { Pauta } from '../../dados/tipos';
import { BarraApoios, formatarNumero } from '../BarraApoios';
import { BotaoApoiar, mostraApoiar } from '../BotaoWhatsApp';
import { STATUS } from '../StatusPill';
import estilos from './lista.module.css';

/**
 * Uma pauta da lista, em três camadas: (1) a janela da etapa, o título e os apoios; (2) as etiquetas,
 * "! URGENTE" e a etapa; (3) a categoria e o bloco, e a barra de apoios até a meta. A pauta urgente
 * ganha a faixa de destaque (`urgente`, classe própria: nada herdado do selo do card).
 */
export function LinhaDePauta({ pauta }: { pauta: Pauta }) {
  const etapa = STATUS[pauta.status];
  const categoria = rotuloDaCategoria(pauta.categoria);
  const id = `linha-${pauta.slug}`;
  return (
    <li
      className={[estilos.linha, pauta.urgente ? estilos.urgente : ''].join(' ')}
      style={{ '--cor': etapa.ponto } as CSSProperties}
    >
      <article aria-labelledby={id}>
        <div className={estilos.camada1}>
          <i className={estilos.janela} aria-hidden="true" />
          <h2 id={id} className={estilos.titulo}>
            <Link href={`/p/${pauta.slug}`}>{pauta.titulo}</Link>
          </h2>
          <span className={estilos.apoios}>
            {formatarNumero(pauta.apoios)}
            <small> {pauta.apoios === 1 ? 'apoio' : 'apoios'}</small>
          </span>
        </div>
        <div className={estilos.camada2}>
          {pauta.urgente && <span className={estilos.seloUrgente}>! Urgente</span>}
          <span className={estilos.etapa}>{etapa.rotulo}</span>
        </div>
        <p className={estilos.camada3}>
          {categoria !== undefined && (
            <>
              <span>{categoria}</span>
              <span className={estilos.tracinho} aria-hidden="true" />
            </>
          )}
          <strong>{pauta.bloco_nome ?? 'Todo o campus'}</strong>
        </p>
        <div className={estilos.progresso}>
          <BarraApoios
            apoios={pauta.apoios}
            meta={pauta.meta}
            rotulo={`Apoios: ${pauta.titulo}`}
            cor={etapa.ponto}
            semLegenda
          />
        </div>
        {/* Fora do link do título: <a> dentro de <a> é HTML inválido. */}
        {mostraApoiar(pauta.status) && (
          <div className={estilos.acoes}>
            <BotaoApoiar slug={pauta.slug} titulo={pauta.titulo} />
          </div>
        )}
      </article>
    </li>
  );
}
