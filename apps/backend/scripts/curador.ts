// Cria o primeiro administrador do painel de curadoria (SCRUM-164, SCRUM-295). O resto da equipe
// é adicionada e desativada pela tela /curadores, só por administrador.
// Uso: pnpm --filter @lumens/backend curador --administrador <email> "<nome>"
// Sem `--administrador` cadastra um curador comum (ou reativa quem saiu), útil se ninguém mais
// entra no painel. Lê DATABASE_URL, CHAVE_CIFRA e CHAVE_HMAC do .env da raiz. O e-mail vai cifrado
// e com HMAC, que é como o painel acha o curador no login: a regra mora em `@lumens/dominio`.
import { criarCliente } from '@lumens/db';
import { adicionarCurador, type MotivoRecusaCurador } from '@lumens/dominio';
import { chavesDoEnv } from '../src/cripto/cifra';

const USO = 'Uso: pnpm --filter @lumens/backend curador [--administrador] <email> "<nome>"';
const MOTIVOS: Partial<Record<MotivoRecusaCurador, string>> = {
  email_invalido: 'Só e-mail @ufal.br.',
  nome_obrigatorio: 'Informe o nome.',
  ja_ativo: 'Essa pessoa já pode entrar no painel.',
};

const argumentos = process.argv.slice(2);
const administrador = argumentos.includes('--administrador');
const [email, nome] = argumentos.filter((a) => a !== '--administrador');
const { DATABASE_URL, CHAVE_CIFRA, CHAVE_HMAC } = process.env;

if (!email || !nome) {
  console.error(USO);
  process.exit(1);
}
if (!DATABASE_URL || !CHAVE_CIFRA || !CHAVE_HMAC) {
  console.error('Defina DATABASE_URL, CHAVE_CIFRA e CHAVE_HMAC no .env da raiz.');
  process.exit(1);
}

const chaves = chavesDoEnv({ CHAVE_CIFRA, CHAVE_HMAC });
// As mesmas regras do `env.ts` do servidor: 32 bytes cada e diferentes entre si (com a mesma
// chave, quem tiver a do HMAC decifra os e-mails).
if (chaves.cifra.length !== 32 || chaves.hmac.length !== 32 || chaves.cifra.equals(chaves.hmac)) {
  console.error(
    'CHAVE_CIFRA e CHAVE_HMAC precisam ter 32 bytes em base64 cada (openssl rand -base64 32) e ser diferentes.',
  );
  process.exit(1);
}
const { db, pool } = criarCliente(DATABASE_URL);
try {
  const resultado = await adicionarCurador(db, chaves, {
    email,
    nome,
    papel: administrador ? 'administrador' : 'curador',
  });
  if (resultado.feito) {
    console.log(`${nome.trim()} pode entrar no painel com ${email.trim().toLowerCase()}.`);
  } else {
    console.error(MOTIVOS[resultado.motivo] ?? 'Não foi possível adicionar.');
    process.exitCode = 1;
  }
} finally {
  await pool.end();
}
