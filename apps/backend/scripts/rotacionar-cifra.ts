// Rotaciona a chave de cifra AES-256-GCM dos dados sensíveis no banco (SCRUM-90).
// Uso: pnpm --filter @lumens/backend rotacionar-cifra --antiga=<base64> --nova=<base64>
// Ou via variáveis de ambiente CHAVE_CIFRA_ANTIGA e CHAVE_CIFRA_NOVA.
import { criarCliente } from '@lumens/db';
import { rotacionarCifra } from '../src/cripto/rotacao';

function extrairArg(nome: string): string | undefined {
  const prefixo = `--${nome}=`;
  const comIgual = process.argv.slice(2).find((arg) => arg.startsWith(prefixo));
  if (comIgual) return comIgual.slice(prefixo.length);

  const idx = process.argv.slice(2).indexOf(`--${nome}`);
  if (idx !== -1 && idx + 1 < process.argv.slice(2).length) {
    return process.argv.slice(2)[idx + 1];
  }
  return undefined;
}

const antigaStr = (extrairArg('antiga') ?? process.env.CHAVE_CIFRA_ANTIGA)?.trim();
const novaStr = (extrairArg('nova') ?? process.env.CHAVE_CIFRA_NOVA)?.trim();
const databaseUrl = process.env.DATABASE_URL;

if (!antigaStr || !novaStr) {
  console.error(
    'Uso: pnpm --filter @lumens/backend rotacionar-cifra --antiga=<base64> --nova=<base64>\n' +
      'Ou defina CHAVE_CIFRA_ANTIGA e CHAVE_CIFRA_NOVA no ambiente.',
  );
  process.exit(1);
}

function validarChave(valor: string, nome: string): Buffer {
  const buf = Buffer.from(valor, 'base64');
  if (buf.toString('base64') !== valor || buf.length !== 32) {
    console.error(
      `${nome} precisa ser base64 válido e ter exatamente 32 bytes (openssl rand -base64 32).`,
    );
    process.exit(1);
  }
  return buf;
}

const chaveAntiga = validarChave(antigaStr, 'CHAVE_CIFRA_ANTIGA (--antiga)');
const chaveNova = validarChave(novaStr, 'CHAVE_CIFRA_NOVA (--nova)');

if (chaveAntiga.equals(chaveNova)) {
  console.error('CHAVE_CIFRA_NOVA precisa ser diferente de CHAVE_CIFRA_ANTIGA.');
  process.exit(1);
}

if (!databaseUrl) {
  console.error('Defina DATABASE_URL no .env da raiz ou nas variáveis de ambiente.');
  process.exit(1);
}

const { db, pool } = criarCliente(databaseUrl);
try {
  const resultado = await rotacionarCifra(db, chaveAntiga, chaveNova);
  console.log(
    `Rotação de chaves concluída com sucesso: ${String(resultado.curadores)} curador(es) e ${String(resultado.estudantes)} estudante(s) recifrado(s).`,
  );
} catch (erro) {
  console.error('Falha na rotação de chaves:', erro);
  process.exit(1);
} finally {
  await pool.end();
}
