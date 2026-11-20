import type { Metadata } from 'next';
import { connection } from 'next/server';
import { MapaDoCampus } from '../../componentes/mapa/MapaDoCampus';
import { marcadoresDoMapa } from '../../componentes/mapa/urgencia';
import { buscarBlocos, buscarPautas } from '../../dados/api';
import { pautasPublicas } from '../../dados/pautas-publicas';
import { metadadosDaMarca } from '../../metadados';

export const metadata: Metadata = metadadosDaMarca({
  caminho: '/mapa',
  title: 'Mapa do campus · Lumens',
  description: 'Onde estão as pautas estudantis no Campus A.C. Simões da UFAL.',
});

export default async function Mapa({
  searchParams,
}: {
  searchParams: Promise<{ bloco?: string | string[] }>;
}) {
  // Lê a API no acesso, não no build (a API pode nem estar no ar durante o `next build`).
  await connection();
  const [blocos, pautas] = await Promise.all([buscarBlocos(), buscarPautas()]);
  const { bloco } = await searchParams;
  const marcadores = marcadoresDoMapa(blocos, pautasPublicas(pautas));

  return (
    <main>
      <MapaDoCampus
        marcadores={marcadores}
        blocoInicial={typeof bloco === 'string' ? bloco : undefined}
      />
    </main>
  );
}
