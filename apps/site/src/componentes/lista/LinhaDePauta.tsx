'use client';

import { rotuloDaCategoria } from '@lumens/contratos';
import Link from 'next/link';
import { useState, type CSSProperties } from 'react';
import type { Pauta } from '../../dados/tipos';
import { formatarNumero, percentual } from '../BarraApoios';
import { BotaoApoiar, mostraApoiar } from '../BotaoWhatsApp';
import { STATUS } from '../StatusPill';
import estilos from './lista.module.css';

/**
 * Uma pauta da lista, como no protótipo: o cabeçalho é um botão que abre a linha. Fechada, mostra a
 * janela da etapa, o título, os apoios, as etiquetas ("Urgente" e a etapa), a categoria e o bloco, e
 * o fio até a meta. Aberta, mostra a descrição, "Apoiar pelo WhatsApp" e "Ver a pauta". A pauta
 * urgente ganha a faixa de destaque.
 */
export function LinhaDePauta({ pauta }: { pauta: Pauta }) {
  const [aberta, setAberta] = useState(false);
  const etapa = STATUS[pauta.status];
  const categoria = rotuloDaCategoria(pauta.categoria);
  const id = `linha-${pauta.slug}`;
  const apoios = `${formatarNumero(pauta.apoios)} ${pauta.apoios === 1 ? 'apoio' : 'apoios'}`;
  return (
    <li
      className={[
        estilos.linha,
        pauta.urgente ? estilos.urgente : '',
        aberta ? estilos.aberta : '',
      ].join(' ')}
      style={{ '--cor': etapa.ponto } as CSSProperties}
    >
      <button
        type="button"
        className={estilos.cabL}
        aria-expanded={aberta}
        aria-controls={id}
        onClick={() => {
          setAberta((agora) => !agora);
        }}
      >
        <i
          className={[
            estilos.janela,
            pauta.status === 'descumprida' ? estilos.descumprida : '',
          ].join(' ')}
          aria-hidden="true"
        />
        <span className={estilos.titulo}>{pauta.titulo}</span>
        <span className={estilos.apoios}>
          <span aria-hidden="true">{formatarNumero(pauta.apoios)}</span>
          <span className={estilos.somenteLeitor}>{apoios}</span>
        </span>
        <span className={estilos.meta}>
          <span className={estilos.tags}>
            {pauta.urgente && <span className={estilos.seloUrgente}>Urgente</span>}
            <b className={estilos.etapa}>{etapa.rotulo}</b>
          </span>
          <span className={estilos.onde}>
            {categoria !== undefined && (
              <>
                <span>{categoria}</span>
                <i aria-hidden="true" />
              </>
            )}
            <span>{pauta.bloco_nome ?? 'Todo o campus'}</span>
          </span>
        </span>
        <span
          className={estilos.fio}
          style={{ '--p': `${String(percentual(pauta.apoios, pauta.meta))}%` } as CSSProperties}
          aria-hidden="true"
        >
          <i />
        </span>
        <span className={estilos.somenteLeitor}>
          {formatarNumero(pauta.apoios)} de {formatarNumero(pauta.meta)} apoios
        </span>
      </button>
      <div className={estilos.mais} id={id} inert={!aberta}>
        <div>
          <div className={estilos.maisDentro}>
            <p>
              {pauta.descricao} Meta: {formatarNumero(pauta.meta)} apoios.
            </p>
            <div className={estilos.acoes}>
              {mostraApoiar(pauta.status) && (
                <BotaoApoiar
                  slug={pauta.slug}
                  titulo={pauta.titulo}
                  texto="Apoiar pelo WhatsApp"
                  semIcone
                />
              )}
              <Link href={`/p/${pauta.slug}`} className={estilos.ver}>
                Ver a pauta
              </Link>
            </div>
          </div>
        </div>
      </div>
    </li>
  );
}
