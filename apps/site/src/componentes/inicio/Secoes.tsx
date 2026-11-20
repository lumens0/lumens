import Link from 'next/link';
import type { CSSProperties } from 'react';
import { urlDeFiltros } from '../../dados/filtros';
import { contextoDosNumeros, type NumerosDoInicio } from '../../dados/inicio';
import type { Pauta } from '../../dados/tipos';
import { formatarNumero } from '../BarraApoios';
import componentes from '../componentes.module.css';
import { Numero } from '../Numero';
import { STATUS } from '../StatusPill';
import estilos from './inicio.module.css';

/**
 * Os quatro números do Início, separados por filetes (sem cartões): pautas abertas, apoios, em
 * cobrança e conquistas, cada um com uma frase de contexto. O valor animado fica escondido do leitor
 * de tela (`Numero`); quem fala por ele é o resumo da região, escrito pelo chamador.
 */
export function NumerosDoCampus({ numeros }: { numeros: NumerosDoInicio }) {
  const [juntando, apoios, descumpridas, dias] = contextoDosNumeros(numeros);
  const itens = [
    { rotulo: 'Pautas abertas', valor: numeros.abertas, contexto: juntando, atraso: false },
    { rotulo: 'Apoios', valor: numeros.apoios, contexto: apoios, atraso: false },
    {
      rotulo: 'Em cobrança',
      valor: numeros.emCobranca,
      contexto: descumpridas,
      atraso: numeros.descumpridas > 0,
    },
    { rotulo: 'Conquistas', valor: numeros.conquistas, contexto: dias, atraso: false },
  ];
  return (
    <dl className={estilos.numeros}>
      {itens.map((item) => (
        <div key={item.rotulo} className={estilos.numero}>
          <dt>{item.rotulo}</dt>
          <dd className={estilos.numeroGrande}>
            <Numero valor={item.valor} />
          </dd>
          <dd className={[estilos.numeroContexto, item.atraso ? estilos.atraso : ''].join(' ')}>
            {item.contexto}
          </dd>
        </div>
      ))}
    </dl>
  );
}

/** "Perto de bater a meta": as pautas juntando apoios mais perto da meta, com a barra fina. */
export function PertoDaMetaSecao({ pautas }: { pautas: readonly Pauta[] }) {
  if (pautas.length === 0) return null;
  return (
    <section className={estilos.pertoDaMeta} aria-labelledby="perto-titulo">
      <h2 id="perto-titulo">Perto de bater a meta</h2>
      <ul>
        {pautas.map((pauta) => {
          const parte = Math.min(100, Math.round((pauta.apoios / pauta.meta) * 100));
          return (
            <li key={pauta.slug}>
              <Link
                href={`/p/${pauta.slug}`}
                style={{ '--cor': STATUS[pauta.status].ponto } as CSSProperties}
              >
                <i className={estilos.janelaMini} aria-hidden="true" />
                <span className={estilos.tituloDaMeta}>{pauta.titulo}</span>
                <span className={estilos.detalheDaMeta}>
                  {pauta.bloco_nome ?? 'Todo o campus'} · {formatarNumero(pauta.apoios)} de{' '}
                  {formatarNumero(pauta.meta)} apoios
                </span>
                <span className={estilos.barraFina} aria-hidden="true">
                  <i style={{ width: `${String(parte)}%` }} />
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

export interface EtiquetaDeFiltro {
  /** Texto visível, ex.: "Cobrando" ou "Bloco A". */
  texto: string;
  /** Texto para o leitor de tela, ex.: "Tirar o filtro de etapa Cobrando". */
  rotulo: string;
  /** Endereço do Início sem este filtro. */
  href: string;
}

/**
 * Rodapé de ação: os filtros ativos (cada um com "×" que o tira) ou a dica de como filtrar, e o
 * botão que leva à lista carregando os mesmos filtros na URL.
 */
export function AcaoDoInicio({
  etiquetas,
  total,
  status,
  bloco,
}: {
  etiquetas: EtiquetaDeFiltro[];
  total: number;
  status: readonly string[];
  bloco: readonly string[];
}) {
  const filtrado = etiquetas.length > 0;
  const texto =
    total === 1
      ? `Ver a pauta${filtrado ? ' filtrada' : ''}`
      : `Ver as ${formatarNumero(total)} pautas${filtrado ? ' filtradas' : ''}`;
  return (
    <div className={estilos.acao}>
      {filtrado ? (
        <ul className={estilos.etiquetas} aria-label="Filtros ativos">
          {etiquetas.map((etiqueta) => (
            <li key={etiqueta.href}>
              <Link
                href={etiqueta.href}
                className={estilos.etiqueta}
                aria-label={etiqueta.rotulo}
                scroll={false}
              >
                {etiqueta.texto} <span aria-hidden="true">×</span>
              </Link>
            </li>
          ))}
          {etiquetas.length >= 2 && (
            <li>
              <Link href="/" className={estilos.limpar} scroll={false}>
                Limpar tudo
              </Link>
            </li>
          )}
        </ul>
      ) : (
        <p className={estilos.dica}>Toque em etapas e blocos para filtrar as pautas.</p>
      )}
      <Link
        href={urlDeFiltros('/pautas', { status, bloco })}
        className={[componentes.botao, estilos.verTodas].join(' ')}
      >
        {texto}
      </Link>
    </div>
  );
}
