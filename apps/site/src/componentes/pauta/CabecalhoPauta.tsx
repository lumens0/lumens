import type { PautaDetalhe } from '@lumens/contratos';
import { contextoDaPauta } from '../../dados/pautas-publicas';
import { formatarNumero, percentual } from '../BarraApoios';
import { BotaoApoiar, mostraApoiar } from '../BotaoWhatsApp';
import comuns from '../componentes.module.css';
import { StatusPill } from '../StatusPill';
import estilos from './pauta.module.css';

/** Título, status, bloco, categoria, responsáveis (só o curso) e os botões. */
export function CabecalhoPauta({ pauta }: { pauta: PautaDetalhe }) {
  return (
    <header className={estilos.cabecalho}>
      <span className={comuns.contexto}>{contextoDaPauta(pauta.categoria, pauta.bloco_nome)}</span>
      <h1 className={estilos.titulo}>{pauta.titulo}</h1>
      <div className={estilos.linha}>
        <StatusPill status={pauta.status} />
        {pauta.cursos_responsaveis.length > 0 && (
          <ul className={estilos.owners} aria-label="Responsáveis pela pauta">
            {pauta.cursos_responsaveis.map((curso) => (
              <li key={curso}>Owner · {curso}</li>
            ))}
          </ul>
        )}
      </div>
      <p className={estilos.descricao}>{pauta.descricao}</p>
      <div className={estilos.cta}>
        {mostraApoiar(pauta.status) && <BotaoApoiar slug={pauta.slug} titulo={pauta.titulo} />}
        <a
          href={`/p/${pauta.slug}/card.png`}
          download={`lumens-${pauta.slug}.png`}
          className={estilos.fantasma}
          aria-label={`Baixar card da pauta ${pauta.titulo}`}
        >
          Baixar card
        </a>
        <p className={estilos.nota}>
          O botão abre o WhatsApp com a mensagem pronta. Apoiar, relatar e ajudar acontecem só no
          bot.
        </p>
      </div>
    </header>
  );
}

/** O número de apoios em destaque, com a barra até a meta. */
export function PlacarDeApoios({ pauta }: { pauta: PautaDetalhe }) {
  const pct = percentual(pauta.apoios, pauta.meta);
  const legenda = `${formatarNumero(pauta.apoios)} de ${formatarNumero(pauta.meta)} apoios`;
  return (
    <div className={estilos.placar}>
      <p className={estilos.numero}>
        <span className={estilos.grande}>{formatarNumero(pauta.apoios)}</span>{' '}
        <span className={estilos.de}>de {formatarNumero(pauta.meta)} apoios</span>
      </p>
      <div
        className={estilos.trilho}
        role="progressbar"
        aria-label={`Apoios da pauta ${pauta.titulo}`}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={pct}
        aria-valuetext={legenda}
      >
        <div className={estilos.preenchimento} style={{ width: `${String(pct)}%` }} />
      </div>
    </div>
  );
}
