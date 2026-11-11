import type { Metadata } from 'next';
import Link from 'next/link';
import { connection } from 'next/server';
import { MapaDoCampus } from '../../componentes/mapa/MapaDoCampus';
import mapa from '../../componentes/mapa/mapa.module.css';
import { lugaresDoMapa } from '../../componentes/mapa/urgencia';
import { buscarPautas } from '../../dados/api';
import { pautasPublicas } from '../../dados/pautas-publicas';
import { metadadosDaMarca } from '../../metadados';
import estilos from '../page.module.css';

export const metadata: Metadata = metadadosDaMarca({
  caminho: '/mapa',
  title: 'Mapa do campus · Lumens',
  description: 'Onde estão as pautas estudantis no Campus A.C. Simões da UFAL.',
});

export default async function Mapa() {
  // Lê a API no acesso, não no build (a API pode nem estar no ar durante o `next build`).
  await connection();
  const lugares = lugaresDoMapa(pautasPublicas(await buscarPautas()));
  return (
    <main className={mapa.pagina}>
      <h1 className={estilos.titulo}>Mapa do campus</h1>
      <p className={estilos.subtitulo}>
        Cada prédio tem a cor da pauta mais urgente dele. Toque num prédio para ver só as pautas de
        lá.
      </p>
      <MapaDoCampus lugares={lugares} />
      <footer className={estilos.rodape}>
        <nav aria-label="Mais do Lumens" className={estilos.navegacao}>
          <Link href="/">Todas as pautas</Link>
          <Link href="/conquistas">Conquistas</Link>
          <Link href="/atividade">Atividade</Link>
        </nav>
      </footer>
    </main>
  );
}
