import type { PautaDetalhe } from '@lumens/contratos';
import { comandoApoiar } from '../../whatsapp';
import { BarraApoios } from '../BarraApoios';
import { BotaoWhatsApp } from '../BotaoWhatsApp';
import { aceitaApoio } from '../CardPauta';
import { StatusPill } from '../StatusPill';
import estilos from './pauta.module.css';

/** Título, status, bloco, categoria, responsáveis (só o curso) e apoios. */
export function CabecalhoPauta({ pauta }: { pauta: PautaDetalhe }) {
  return (
    <header className={estilos.cabecalho}>
      <p className={estilos.contexto}>
        {pauta.bloco_nome ? `${pauta.bloco_nome} · ` : ''}
        {pauta.categoria}
      </p>
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
      {aceitaApoio(pauta.status) && (
        <div className={estilos.acoes}>
          <BotaoWhatsApp
            comando={comandoApoiar(pauta.slug)}
            texto="Apoiar"
            rotulo={`Apoiar a pauta ${pauta.titulo} pelo WhatsApp`}
          />
        </div>
      )}
    </header>
  );
}
