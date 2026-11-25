import type { PautaDetalhe } from '@lumens/contratos';
import type { CSSProperties } from 'react';
import { ProximaEtapa, RespostaOficial } from './Andamento';
import { BotaoDeApoio, CabecalhoPauta } from './CabecalhoPauta';
import { mostraApoiar } from '../BotaoWhatsApp';
import { formatarNumero } from '../BarraApoios';
import { STATUS } from '../StatusPill';
import { Caminhos } from './Caminhos';
import { FatosDaConquista, SolucaoEntregue } from './Conquista';
import { FioDeEtapas } from './FioDeEtapas';
import { LinhaDoTempo } from './LinhaDoTempo';
import { Relatos } from './Relatos';
import { Voltar } from './Voltar';
import estilos from './pauta.module.css';

/**
 * A página da pauta sem a busca: renderiza só os campos conhecidos do contrato. Pauta conquistada
 * ganha a visão de conquista (SCRUM-352); as demais seguem como estavam.
 */
export function ConteudoPauta({
  pauta,
  cursosDoBloco,
  agora = new Date(),
}: {
  pauta: PautaDetalhe;
  /** Cursos que apoiam no bloco da pauta (SCRUM-399); `undefined` quando não se sabe. */
  cursosDoBloco?: readonly string[] | undefined;
  /** O "hoje" dos prazos vencidos; nos testes, uma data fixa. */
  agora?: Date;
}) {
  const conquistada = pauta.status === 'conquistada';
  const metaAjustada = pauta.linha_do_tempo.some((evento) => evento.tipo === 'meta_ajustada');
  const rodape = (
    <p className={estilos.rodape}>
      Nenhum nome, telefone ou e-mail de quem participa aparece no site. Dados abertos: qualquer
      pessoa pode baixar os números de todas as pautas em <a href="/dados.csv">CSV</a>.
    </p>
  );
  return (
    <main>
      {/* A faixa de noite brilha na cor da etapa: 30% do raio, 55% na pauta conquistada. */}
      <div
        className={[estilos.faixa, conquistada ? estilos.faixaConquistada : '', 'noite'].join(' ')}
        style={{ '--cor': STATUS[pauta.status].ponto } as CSSProperties}
      >
        <div className={estilos.caixa}>
          <Voltar />
          <CabecalhoPauta pauta={pauta} cursosDoBloco={cursosDoBloco} agora={agora} />
          <FioDeEtapas status={pauta.status} />
          {conquistada && <FatosDaConquista pauta={pauta} />}
        </div>
      </div>
      <div className={[estilos.caixa, estilos.corpo].join(' ')}>
        <div className={estilos.coluna}>
          <p className={estilos.descricao}>{pauta.descricao}</p>
          {metaAjustada && <p className={estilos.subtitulo}>Meta ajustada pela curadoria</p>}
          {conquistada ? (
            <>
              <RespostaOficial pauta={pauta} agora={agora} />
              <SolucaoEntregue pauta={pauta} />
              <Caminhos caminhos={pauta.caminhos} slug={pauta.slug} conquistada agora={agora} />
              <Relatos relatos={pauta.relatos} agora={agora} />
              <LinhaDoTempo eventos={pauta.linha_do_tempo} />
            </>
          ) : (
            <>
              <ProximaEtapa pauta={pauta} agora={agora} />
              <RespostaOficial pauta={pauta} agora={agora} />
              <Caminhos caminhos={pauta.caminhos} slug={pauta.slug} agora={agora} />
              <Relatos relatos={pauta.relatos} agora={agora} />
              <LinhaDoTempo eventos={pauta.linha_do_tempo} />
            </>
          )}
          {rodape}
        </div>
      </div>
      {/* Barra fixa do celular: o número e o botão ficam à mão enquanto se lê a pauta. */}
      {mostraApoiar(pauta.status) && (
        <div className={estilos.barraFixa}>
          <div className={estilos.caixa}>
            <span>
              <b>{formatarNumero(pauta.apoios)}</b> de {formatarNumero(pauta.meta)} apoios
            </span>
            <BotaoDeApoio slug={pauta.slug} titulo={pauta.titulo} curto />
          </div>
        </div>
      )}
    </main>
  );
}
