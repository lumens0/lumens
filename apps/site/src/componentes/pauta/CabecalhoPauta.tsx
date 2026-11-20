import type { PautaDetalhe } from '@lumens/contratos';
import { contextoDaPauta } from '../../dados/pautas-publicas';
import { BarraApoios, formatarNumero } from '../BarraApoios';
import { BotaoApoiar, mostraApoiar } from '../BotaoWhatsApp';
import comuns from '../componentes.module.css';
import { STATUS, StatusPill } from '../StatusPill';
import { origemDoSite } from '../../origem';
import { nomeDoCanal } from '../../whatsapp';
import { CompartilharCard } from './CompartilharCard';
import estilos from './pauta.module.css';

/** Título, status, bloco, categoria, responsáveis (só o curso) e os botões. */
export function CabecalhoPauta({ pauta }: { pauta: PautaDetalhe }) {
  return (
    <header className={estilos.cabecalho}>
      <span className={comuns.contexto}>{contextoDaPauta(pauta.categoria, pauta.bloco_nome)}</span>
      <h1 className={estilos.titulo}>{pauta.titulo}</h1>
      <div className={estilos.linha}>
        <StatusPill status={pauta.status} />
        {pauta.urgente && <span className={comuns.seloUrgente}>Urgente</span>}
        {pauta.cursos_responsaveis.length > 0 && (
          <ul className={estilos.owners} aria-label="Responsáveis pela pauta">
            {pauta.cursos_responsaveis.map((curso) => (
              <li key={curso}>Responsável · {curso}</li>
            ))}
          </ul>
        )}
      </div>
      <p className={estilos.descricao}>{pauta.descricao}</p>
      <div className={estilos.cta}>
        {/* No celular o "Apoiar" é o da barra fixa, no fim da tela: este some para não repetir. */}
        {mostraApoiar(pauta.status) && (
          <span className={estilos.apoiarDoTopo}>
            <BotaoApoiar slug={pauta.slug} titulo={pauta.titulo} />
          </span>
        )}
        <CompartilharCard
          slug={pauta.slug}
          titulo={pauta.titulo}
          apoios={formatarNumero(pauta.apoios)}
          etapa={STATUS[pauta.status].rotulo}
          link={new URL(`/p/${pauta.slug}`, origemDoSite()).href}
        />
        {mostraApoiar(pauta.status) && (
          <p className={estilos.nota}>
            O botão abre o {nomeDoCanal()} com a mensagem pronta. Apoiar, relatar e ajudar acontecem
            só no bot.
          </p>
        )}
      </div>
    </header>
  );
}

/**
 * O número de apoios em destaque, com a barra até a meta na cor do status, a mesma do card da
 * lista (SCRUM-349). Acima da meta a barra fica cheia, sem passar do trilho.
 */
export function PlacarDeApoios({ pauta }: { pauta: PautaDetalhe }) {
  return (
    <div className={estilos.placar}>
      <p className={estilos.numero}>
        <span className={estilos.grande}>{formatarNumero(pauta.apoios)}</span>{' '}
        <span className={estilos.de}>de {formatarNumero(pauta.meta)} apoios</span>
      </p>
      <BarraApoios
        apoios={pauta.apoios}
        meta={pauta.meta}
        rotulo={`Apoios da pauta ${pauta.titulo}`}
        cor={STATUS[pauta.status].ponto}
        semLegenda
      />
    </div>
  );
}
