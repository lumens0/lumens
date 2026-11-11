import { connection } from 'next/server';
import { buscarPautas } from '../../dados/api';
import { gerarCsv } from '../../dados/csv';
import { pautasPublicas } from '../../dados/pautas-publicas';

// Dados abertos por pauta (RF-S11), para baixar e abrir no Excel ou no Google Sheets.
export async function GET() {
  // Lê a API na hora do pedido, não no build (a API pode nem estar no ar durante o `next build`).
  await connection();
  return new Response(gerarCsv(pautasPublicas(await buscarPautas())), {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': 'attachment; filename="lumens-pautas.csv"',
      // Mesmo cache da API de leitura.
      'Cache-Control': 'public, max-age=30',
    },
  });
}
