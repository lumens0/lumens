import type { PautaDetalhe } from '@lumens/contratos';
import { contextoDaPauta } from '../../dados/pautas-publicas';
import { BarraApoios } from '../BarraApoios';
import { BotaoApoiar, mostraApoiar } from '../BotaoWhatsApp';
import comuns from '../componentes.module.css';
import { StatusPill } from '../StatusPill';
import estilos from './pauta.module.css';

/** Título, status, bloco, categoria, responsáveis (só o curso), apoios e o botão do card. */
export function CabecalhoPauta({ pauta }: { pauta: PautaDetalhe }) {
  return (
    <header className={estilos.cabecalho}>
      <span className={comuns.contexto}>{contextoDaPauta(pauta.categoria, pauta.bloco_nome)}</span>
      <h1 className={estilos.titulo}>{pauta.titulo}</h1>
      <StatusPill status={pauta.status} />
      <p className={estilos.descricao}>{pauta.descricao}</p>
      {pauta.cursos_responsaveis.length > 0 && (
        <ul className={estilos.owners} aria-label="Responsáveis pela pauta">
          {pauta.cursos_responsaveis.map((curso) => (
            <li key={curso}>Owner · {curso}</li>
          ))}
        </ul>
      )}
      <BarraApoios
        apoios={pauta.apoios}
        meta={pauta.meta}
        rotulo={`Apoios da pauta ${pauta.titulo}`}
      />
      <div className={comuns.acoes}>
        {mostraApoiar(pauta.status) && <BotaoApoiar slug={pauta.slug} titulo={pauta.titulo} />}
        <a
          href={`/p/${pauta.slug}/card.png`}
          download={`lumens-${pauta.slug}.png`}
          className={comuns.botaoSecundario}
          aria-label={`Baixar o card da pauta ${pauta.titulo}`}
        >
          Baixar card
        </a>
      </div>
    </header>
  );
}
