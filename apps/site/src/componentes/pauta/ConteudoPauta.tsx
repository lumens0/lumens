import type { PautaDetalhe } from '@lumens/contratos';
import { CabecalhoPauta } from './CabecalhoPauta';
import { Caminhos } from './Caminhos';
import { LinhaDoTempo } from './LinhaDoTempo';
import { Relatos } from './Relatos';
import estilos from './pauta.module.css';

/** A página da pauta sem a busca: renderiza só os campos conhecidos do contrato. */
export function ConteudoPauta({ pauta }: { pauta: PautaDetalhe }) {
  return (
    <main className={estilos.pagina}>
      <CabecalhoPauta pauta={pauta} />
      <Caminhos caminhos={pauta.caminhos} />
      <Relatos relatos={pauta.relatos} />
      <LinhaDoTempo eventos={pauta.linha_do_tempo} />
    </main>
  );
}
