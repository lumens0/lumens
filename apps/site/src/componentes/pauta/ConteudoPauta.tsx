import type { PautaDetalhe } from '@lumens/contratos';
import { ProximaEtapa, RespostaOficial } from './Andamento';
import { CabecalhoPauta, PlacarDeApoios } from './CabecalhoPauta';
import { Caminhos } from './Caminhos';
import { LinhaDoTempo } from './LinhaDoTempo';
import { Relatos } from './Relatos';
import { Voltar } from './Voltar';
import estilos from './pauta.module.css';

/** A página da pauta sem a busca: renderiza só os campos conhecidos do contrato. */
export function ConteudoPauta({ pauta }: { pauta: PautaDetalhe }) {
  return (
    <main className={estilos.pagina}>
      <Voltar />
      <CabecalhoPauta pauta={pauta} />
      <div className={estilos.secao}>
        <PlacarDeApoios pauta={pauta} />
        <ProximaEtapa pauta={pauta} />
      </div>
      <RespostaOficial pauta={pauta} />
      <Caminhos caminhos={pauta.caminhos} slug={pauta.slug} />
      <Relatos relatos={pauta.relatos} />
      <LinhaDoTempo eventos={pauta.linha_do_tempo} />
      <p className={estilos.rodape}>
        Nenhum nome, telefone ou e-mail de quem participa aparece no site. Dados abertos: qualquer
        pessoa pode baixar os números de todas as pautas em <a href="/dados.csv">CSV</a>.
      </p>
    </main>
  );
}
