import type { PautaDetalhe } from '@lumens/contratos';
import { ProximaEtapa, RespostaOficial } from './Andamento';
import { CabecalhoPauta, PlacarDeApoios } from './CabecalhoPauta';
import { Caminhos } from './Caminhos';
import { DestaqueDaConquista, SolucaoEntregue } from './Conquista';
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
  agora = new Date(),
}: {
  pauta: PautaDetalhe;
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
    <main className={estilos.pagina}>
      <div className={estilos.faixa}>
        <Voltar />
        <CabecalhoPauta pauta={pauta} />
      </div>
      {conquistada ? (
        <>
          <DestaqueDaConquista pauta={pauta} />
          <SolucaoEntregue pauta={pauta} />
          <RespostaOficial pauta={pauta} agora={agora} />
          <LinhaDoTempo eventos={pauta.linha_do_tempo} destacar />
          <Relatos relatos={pauta.relatos} />
          <Caminhos caminhos={pauta.caminhos} slug={pauta.slug} conquistada agora={agora} />
        </>
      ) : (
        <>
          <div className={estilos.secao}>
            <PlacarDeApoios pauta={pauta} />
            {metaAjustada && <p className={estilos.vazio}>Meta ajustada pela curadoria</p>}
            <ProximaEtapa pauta={pauta} agora={agora} />
          </div>
          <RespostaOficial pauta={pauta} agora={agora} />
          <Caminhos caminhos={pauta.caminhos} slug={pauta.slug} agora={agora} />
          <Relatos relatos={pauta.relatos} />
          <LinhaDoTempo eventos={pauta.linha_do_tempo} />
        </>
      )}
      {rodape}
    </main>
  );
}
