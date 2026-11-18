import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { CardPauta } from '../../../componentes/CardPauta';
import { PAUTAS_TESTE } from '../../../dados/pautas-teste';

export const metadata: Metadata = {
  title: 'Componentes · Lumens',
  robots: { index: false },
};

// Rota de rascunho: os componentes base em todos os status, com as pautas de teste.
// Só no `next dev`: em produção mostraria status que o site promete nunca exibir (SCRUM-306).
export default function Componentes() {
  if (process.env.NODE_ENV === 'production') notFound();
  return (
    <main style={{ maxWidth: 640, margin: '0 auto', padding: 16, display: 'grid', gap: 12 }}>
      <h1 style={{ fontFamily: 'var(--fonte-titulo)', margin: 0 }}>Componentes</h1>
      {PAUTAS_TESTE.map((pauta) => (
        <CardPauta key={pauta.slug} pauta={pauta} />
      ))}
    </main>
  );
}
