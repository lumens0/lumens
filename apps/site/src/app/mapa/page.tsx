import type { Metadata } from 'next';
import { connection } from 'next/server';
import { MapaDoCampus } from '../../componentes/mapa/MapaDoCampus';
import estilos from '../../componentes/mapa/mapa.module.css';
import { marcadoresDoMapa } from '../../componentes/mapa/urgencia';
import { buscarBlocos, buscarPautas } from '../../dados/api';
import { pautasPublicas } from '../../dados/pautas-publicas';
import { metadadosDaMarca } from '../../metadados';
import pagina from '../page.module.css';

export const metadata: Metadata = metadadosDaMarca({
  caminho: '/mapa',
  title: 'Mapa do campus · Lumens',
  description: 'Onde estão as pautas estudantis no Campus A.C. Simões da UFAL.',
});

export default async function Mapa() {
  // Lê a API no acesso, não no build (a API pode nem estar no ar durante o `next build`).
  await connection();
  const [blocos, pautas] = await Promise.all([buscarBlocos(), buscarPautas()]);
  const marcadores = marcadoresDoMapa(blocos, pautasPublicas(pautas));

  return (
    <main className={estilos.pagina}>
      <p className={estilos.eyebrow}>Extra · outra forma de ver as pautas</p>
      <h1 className={pagina.titulo}>Mapa do campus</h1>
      <p className={estilos.lead}>
        Cada bloco mostra a cor da pauta mais urgente. Toque num prédio para ver as pautas dele.
      </p>

      <MapaDoCampus marcadores={marcadores} />
    </main>
  );
}
