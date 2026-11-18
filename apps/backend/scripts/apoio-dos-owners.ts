// Ajuste único da SCRUM-348: dá o apoio de quem criou às pautas aprovadas antes da SCRUM-344.
// Uso: pnpm --filter @lumens/backend apoio-dos-owners            (conferência: só lista, não grava)
//      pnpm --filter @lumens/backend apoio-dos-owners --aplicar  (registra os apoios)
// Idempotente: depois de aplicar, a conferência volta vazia. Lê DATABASE_URL do .env da raiz.
// Rode a conferência primeiro e registre a lista no ticket antes de aplicar na homologação.
import { criarCliente } from '@lumens/db';
import { aplicarApoioDosOwners, conferirApoioDosOwners, type OwnerSemApoio } from '@lumens/dominio';

const { DATABASE_URL } = process.env;
if (!DATABASE_URL) {
  console.error('Defina DATABASE_URL no .env da raiz.');
  process.exit(1);
}

const linha = (o: OwnerSemApoio) =>
  `  ${o.pautaId}  [${o.status}]  ${o.titulo}${o.ignoradoPor ? `  (fica de fora: ${o.ignoradoPor})` : ''}`;

const { db, pool } = criarCliente(DATABASE_URL);
try {
  const { aplicaveis, ignorados } = await conferirApoioDosOwners(db);
  console.log(`Owners que ganham o apoio: ${String(aplicaveis.length)}`);
  aplicaveis.forEach((o) => {
    console.log(linha(o));
  });
  console.log(`Owners que ficam de fora pela regra da aprovação: ${String(ignorados.length)}`);
  ignorados.forEach((o) => {
    console.log(linha(o));
  });
  console.log(
    `Pautas que sobem em 1 no contador público: ${String(new Set(aplicaveis.map((o) => o.pautaId)).size)}`,
  );

  if (process.argv.includes('--aplicar')) {
    const r = await aplicarApoioDosOwners(db);
    console.log(
      `Aplicado: ${String(r.registrados)} apoio(s) registrado(s), ${String(r.recusados)} recusado(s).`,
    );
  } else {
    console.log('Modo de conferência: nada foi gravado. Use --aplicar para registrar.');
  }
} finally {
  await pool.end();
}
