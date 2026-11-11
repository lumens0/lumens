// Sobe só a API de leitura pública (SCRUM-88), sem o bot, as filas nem o agendador.
// Uso: pnpm --filter @lumens/backend api:leitura
//
// Existe para os testes ponta a ponta do site (SCRUM-28): o site lê tudo desta API, e subir o
// back-end inteiro exigiria as chaves da Meta, o pg-boss e o SMTP só para servir as views. A
// conexão é a mesma de produção (`lumens_site`), então o teste passa pelas views da T14 de
// verdade — inclusive a regra que esconde pauta em curadoria.
import Fastify from 'fastify';
import { SLUG_MAX } from '@lumens/contratos';
import { criarDb, criarPool } from '@lumens/db';
import { apiPlugin } from '../src/api';

const { DATABASE_URL_LEITURA, PORT = '3101' } = process.env;

if (!DATABASE_URL_LEITURA) {
  console.error('Defina DATABASE_URL_LEITURA (o login lumens_site) para subir a API de leitura.');
  process.exit(1);
}

const pool = criarPool(DATABASE_URL_LEITURA, { conexaoMs: 5_000, consultaMs: 15_000 }, (erro) => {
  console.error('conexão de leitura do banco caiu:', erro.message);
});
// Mesmo limite de parâmetro do `buildApp`: sem ele, slug longo cai no 404 genérico do Fastify.
const app = Fastify({ routerOptions: { maxParamLength: SLUG_MAX * 2 } });
await app.register(apiPlugin, { db: criarDb(pool), origensCors: [] });
await app.listen({ port: Number(PORT), host: '127.0.0.1' });
console.log(`API de leitura em http://127.0.0.1:${PORT}`);

const encerrar = async () => {
  await app.close();
  await pool.end();
  process.exit(0);
};
process.on('SIGINT', () => void encerrar());
process.on('SIGTERM', () => void encerrar());
