// Zera o banco local (menos os curadores) e o bucket de fotos, e cria os dados da apresentação, com
// fotos e PDFs de exemplo gerados na hora. Uso: pnpm db:demo
// Lê DATABASE_URL_MIGRACAO (.env.database: o login da aplicação não tem TRUNCATE) e, para as fotos,
// S3_ENDPOINT, S3_BUCKET_FOTOS e AWS_* do .env. Recusa qualquer banco ou storage fora de localhost.
import {
  CreateBucketCommand,
  DeleteObjectsCommand,
  HeadBucketCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { criarCliente, curadores, eq } from '@lumens/db';
import { criarDados, zerarBanco, type GuardarArquivo } from '@lumens/db/demo';
import { randomInt } from 'node:crypto';
import sharp from 'sharp';

const HOSTS_LOCAIS = new Set(['localhost', '127.0.0.1', '[::1]']);

/**
 * Só o host que a conexão realmente usa conta: o `pg` deixa `?host=` e `?hostaddr=` da query
 * sobrescreverem o da URL, então `postgres://u@localhost/db?host=prod` não é local.
 */
function ehLocal(url: string | undefined): boolean {
  if (!url) return false;
  try {
    const u = new URL(url);
    return (
      HOSTS_LOCAIS.has(u.hostname) && !u.searchParams.has('host') && !u.searchParams.has('hostaddr')
    );
  } catch {
    return false;
  }
}

const { DATABASE_URL_MIGRACAO, S3_ENDPOINT, S3_BUCKET_FOTOS, AWS_REGION } = process.env;

if (!DATABASE_URL_MIGRACAO || !ehLocal(DATABASE_URL_MIGRACAO)) {
  console.error('db:demo só roda com DATABASE_URL_MIGRACAO apontando para localhost.');
  process.exit(1);
}

const n = (valor: number): string => String(valor);

/** Paisagem aleatória: céu em degradê, sol, morros e prédios com janelas. Sem arquivo externo. */
async function fotoAleatoria(): Promise<Buffer> {
  const cor = (min: number, max: number) =>
    `rgb(${[0, 1, 2].map(() => randomInt(min, max)).join(',')})`;
  const predios = Array.from({ length: 5 }, (_, i) => {
    const x = 60 + i * 230 + randomInt(-20, 20);
    const h = randomInt(180, 380);
    const janelas = Array.from({ length: 12 }, (_, j) => {
      const jx = x + 20 + (j % 3) * 55;
      const jy = 800 - h + 20 + Math.floor(j / 3) * 60;
      return `<rect x="${n(jx)}" y="${n(jy)}" width="30" height="36" fill="${randomInt(0, 3) ? '#ffe9a8' : '#2b3b4f'}"/>`;
    }).join('');
    return `<rect x="${n(x)}" y="${n(800 - h)}" width="190" height="${n(h)}" fill="${cor(90, 190)}"/>${janelas}`;
  }).join('');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="800">
    <defs><linearGradient id="c" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${cor(40, 140)}"/><stop offset="1" stop-color="${cor(160, 255)}"/>
    </linearGradient></defs>
    <rect width="1200" height="800" fill="url(#c)"/>
    <circle cx="${n(randomInt(150, 1050))}" cy="${n(randomInt(90, 220))}" r="${n(randomInt(50, 90))}" fill="#fff6c8"/>
    <ellipse cx="300" cy="820" rx="560" ry="${n(randomInt(160, 260))}" fill="${cor(50, 130)}"/>
    <ellipse cx="900" cy="830" rx="520" ry="${n(randomInt(140, 230))}" fill="${cor(40, 110)}"/>
    ${predios}
  </svg>`;
  return sharp(Buffer.from(svg)).jpeg({ quality: 82 }).toBuffer();
}

function pdfDeExemplo(): Buffer {
  const texto = 'Resposta oficial (exemplo da demonstracao do Lumens)';
  const fluxo = `BT /F1 16 Tf 60 740 Td (${texto}) Tj ET`;
  const objetos = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
    `<< /Length ${String(fluxo.length)} >>\nstream\n${fluxo}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ];
  let corpo = '%PDF-1.4\n';
  const posicoes = objetos.map((o, i) => {
    const pos = corpo.length;
    corpo += `${String(i + 1)} 0 obj\n${o}\nendobj\n`;
    return pos;
  });
  const xref = corpo.length;
  corpo += `xref\n0 ${String(objetos.length + 1)}\n0000000000 65535 f \n`;
  corpo += posicoes.map((p) => `${String(p).padStart(10, '0')} 00000 n \n`).join('');
  corpo += `trailer\n<< /Size ${String(objetos.length + 1)} /Root 1 0 R >>\nstartxref\n${String(xref)}\n%%EOF\n`;
  return Buffer.from(corpo, 'latin1');
}

const { db, pool } = criarCliente(DATABASE_URL_MIGRACAO);
try {
  // Antes de apagar qualquer coisa: o demo precisa de um curador ativo, que o reset preserva.
  const ativos = await db
    .select({ id: curadores.id })
    .from(curadores)
    .where(eq(curadores.ativo, true))
    .limit(1);
  if (ativos.length === 0) {
    throw new Error('Nenhum curador ativo cadastrado: cadastre um (pnpm curador) antes do demo.');
  }
  let guardarArquivo: GuardarArquivo | undefined;
  if (S3_ENDPOINT && S3_BUCKET_FOTOS && ehLocal(S3_ENDPOINT)) {
    const s3 = new S3Client({
      region: AWS_REGION ?? 'us-east-1',
      endpoint: S3_ENDPOINT,
      forcePathStyle: true,
    });
    try {
      await s3.send(new HeadBucketCommand({ Bucket: S3_BUCKET_FOTOS }));
    } catch {
      await s3.send(new CreateBucketCommand({ Bucket: S3_BUCKET_FOTOS }));
    }
    // Esvazia o bucket: arquivo de antes não pode ficar sem dono.
    for (;;) {
      const lista = await s3.send(new ListObjectsV2Command({ Bucket: S3_BUCKET_FOTOS }));
      const chaves = (lista.Contents ?? []).flatMap((o) => (o.Key ? [{ Key: o.Key }] : []));
      if (chaves.length === 0) break;
      const apagou = await s3.send(
        new DeleteObjectsCommand({ Bucket: S3_BUCKET_FOTOS, Delete: { Objects: chaves } }),
      );
      // O S3 responde 200 mesmo quando algumas chaves falham: sem isto o laço não terminaria.
      if (apagou.Errors?.length) {
        throw new Error(`Não consegui apagar ${n(apagou.Errors.length)} arquivo(s) do bucket.`);
      }
    }
    guardarArquivo = async (chave, tipo) => {
      await s3.send(
        new PutObjectCommand({
          Bucket: S3_BUCKET_FOTOS,
          Key: chave,
          Body: tipo === 'foto' ? await fotoAleatoria() : pdfDeExemplo(),
          ContentType: tipo === 'foto' ? 'image/jpeg' : 'application/pdf',
        }),
      );
    };
  } else {
    console.warn('S3_ENDPOINT local não configurado: o demo sai sem fotos nem PDFs.');
  }
  await zerarBanco(db);
  const resumo = await criarDados(db, guardarArquivo ? { guardarArquivo } : {});
  console.log('Banco zerado (curadores mantidos) e dados de demonstração criados:', resumo);
} catch (erro) {
  console.error('Falha ao criar o demo:', erro);
  process.exitCode = 1;
} finally {
  await pool.end();
}
