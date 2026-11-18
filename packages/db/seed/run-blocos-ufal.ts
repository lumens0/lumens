import { criarCliente } from '../src/client';
import { cadastrarBlocosUfal } from './blocos-ufal';

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error('Defina DATABASE_URL no ambiente ou no .env da raiz.');
  process.exitCode = 1;
} else {
  const { db, pool } = criarCliente(connectionString);
  try {
    const n = await cadastrarBlocosUfal(db);
    console.log(
      `${String(n)} bloco(s) cadastrado(s). Confira as bases de estudantes (estimativa).`,
    );
  } finally {
    await pool.end();
  }
}
