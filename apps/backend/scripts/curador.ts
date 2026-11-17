// Cria o primeiro administrador do painel de curadoria (SCRUM-164, SCRUM-295). O resto da equipe
// é adicionada e desativada pela tela /curadores, só por administrador.
// Uso: pnpm --filter @lumens/backend curador --administrador <email> "<nome>"
// Sem `--administrador` cadastra um curador comum (ou reativa quem saiu), útil se ninguém mais
// entra no painel. Lê DATABASE_URL, CHAVE_CIFRA_PAINEL e CHAVE_HMAC do .env da raiz. O e-mail vai
// cifrado com a chave do painel e com HMAC, que é como o painel acha o curador no login: a regra
// mora em `@lumens/dominio`.
//
// Uma vez, ao adotar a CHAVE_CIFRA_PAINEL: `pnpm --filter @lumens/backend curador --recifrar`
// passa o e-mail dos curadores já cadastrados da CHAVE_CIFRA para a CHAVE_CIFRA_PAINEL.
import { criarCliente } from '@lumens/db';
import {
  adicionarCurador,
  recifrarEmailsDeCuradores,
  type MotivoRecusaCurador,
} from '@lumens/dominio';

const USO =
  'Uso: pnpm --filter @lumens/backend curador [--administrador] <email> "<nome>" | --recifrar';
const MOTIVOS: Partial<Record<MotivoRecusaCurador, string>> = {
  email_invalido: 'Só e-mail @ufal.br.',
  nome_obrigatorio: 'Informe o nome.',
  ja_ativo: 'Essa pessoa já pode entrar no painel.',
};

const argumentos = process.argv.slice(2);
const recifrar = argumentos.includes('--recifrar');
const administrador = argumentos.includes('--administrador');
const [email, nome] = argumentos.filter((a) => !a.startsWith('--'));
const { DATABASE_URL, CHAVE_CIFRA, CHAVE_CIFRA_PAINEL, CHAVE_HMAC } = process.env;

if (!recifrar && (!email || !nome)) {
  console.error(USO);
  process.exit(1);
}
if (!DATABASE_URL || !CHAVE_CIFRA_PAINEL || !CHAVE_HMAC) {
  console.error('Defina DATABASE_URL, CHAVE_CIFRA_PAINEL e CHAVE_HMAC no .env da raiz.');
  process.exit(1);
}

const cifra = Buffer.from(CHAVE_CIFRA_PAINEL, 'base64');
const hmac = Buffer.from(CHAVE_HMAC, 'base64');
// 32 bytes cada e diferentes entre si (com a mesma chave, quem tiver a do HMAC decifra os e-mails).
if (cifra.length !== 32 || hmac.length !== 32 || cifra.equals(hmac)) {
  console.error(
    'CHAVE_CIFRA_PAINEL e CHAVE_HMAC precisam ter 32 bytes em base64 cada (openssl rand -base64 32) e ser diferentes.',
  );
  process.exit(1);
}
const { db, pool } = criarCliente(DATABASE_URL);
try {
  if (recifrar) {
    const antiga = Buffer.from(CHAVE_CIFRA ?? '', 'base64');
    if (antiga.length !== 32) {
      console.error(
        'Para recifrar, defina também a CHAVE_CIFRA (a chave de onde os e-mails saem).',
      );
      process.exitCode = 1;
    } else {
      const r = await recifrarEmailsDeCuradores(db, antiga, cifra);
      console.log(
        `${String(r.recifrados)} recifrado(s), ${String(r.jaNaChaveNova)} já na chave do painel, ${String(r.ilegiveis)} ilegível(is).`,
      );
    }
  } else {
    const resultado = await adicionarCurador(
      db,
      { cifra, hmac },
      { email: email ?? '', nome: nome ?? '', papel: administrador ? 'administrador' : 'curador' },
    );
    if (resultado.feito) {
      console.log(
        `${(nome ?? '').trim()} pode entrar no painel com ${(email ?? '').trim().toLowerCase()}.`,
      );
    } else {
      console.error(MOTIVOS[resultado.motivo] ?? 'Não foi possível adicionar.');
      process.exitCode = 1;
    }
  }
} finally {
  await pool.end();
}
