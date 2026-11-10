// Adiciona (ou reativa) quem pode entrar no painel de curadoria (SCRUM-164).
// Uso: pnpm --filter @lumens/backend curador <email> "<nome>"
// Lê DATABASE_URL, CHAVE_CIFRA e CHAVE_HMAC do .env da raiz. O e-mail vai cifrado e com HMAC, que
// é como o painel acha o curador no login: `apps/painel/src/acesso.ts` faz o mesmo cálculo.
import { criarCliente, curadores } from '@lumens/db';
import { chavesDoEnv, cifrar, hmacHex } from '../src/cripto';

const [email, nome] = process.argv.slice(2);
const { DATABASE_URL, CHAVE_CIFRA, CHAVE_HMAC } = process.env;

if (!email?.includes('@') || !nome) {
  console.error('Uso: pnpm --filter @lumens/backend curador <email> "<nome>"');
  process.exit(1);
}
if (!DATABASE_URL || !CHAVE_CIFRA || !CHAVE_HMAC) {
  console.error('Defina DATABASE_URL, CHAVE_CIFRA e CHAVE_HMAC no .env da raiz.');
  process.exit(1);
}

const normalizado = email.trim().toLowerCase();
const chaves = chavesDoEnv({ CHAVE_CIFRA, CHAVE_HMAC });
if (chaves.cifra.length !== 32 || chaves.hmac.length !== 32) {
  console.error(
    'CHAVE_CIFRA e CHAVE_HMAC precisam ter 32 bytes em base64 (openssl rand -base64 32).',
  );
  process.exit(1);
}
const { db, pool } = criarCliente(DATABASE_URL);
try {
  await db
    .insert(curadores)
    .values({
      emailHmac: hmacHex(normalizado, chaves.hmac),
      emailCifrado: cifrar(normalizado, chaves.cifra),
      nome,
    })
    .onConflictDoUpdate({ target: curadores.emailHmac, set: { nome, ativo: true } });
  console.log(`${nome} pode entrar no painel com ${normalizado}.`);
} finally {
  await pool.end();
}
