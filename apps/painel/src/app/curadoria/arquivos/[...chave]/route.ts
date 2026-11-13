import { GetObjectCommand, NoSuchKey, S3Client } from '@aws-sdk/client-s3';
import { curadorDaSessao } from '../../../../auth';
import { criarGetArquivo } from './arquivo';

// O mesmo bucket em que o bot grava (`S3_BUCKET_FOTOS`). As credenciais vêm do ambiente, como no
// backend: papel da instância em produção, e `S3_ENDPOINT` para emulador ou serviço compatível.
let s3: S3Client | undefined;
function cliente(): S3Client {
  const endpoint = process.env.S3_ENDPOINT;
  s3 ??= new S3Client({
    region: process.env.AWS_REGION ?? 'us-east-1',
    ...(endpoint ? { endpoint, forcePathStyle: true } : {}),
  });
  return s3;
}

export const GET = criarGetArquivo({
  autorizado: async () => (await curadorDaSessao()) !== undefined,
  async ler(chave) {
    const bucket = process.env.S3_BUCKET_FOTOS;
    if (!bucket) throw new Error('S3_BUCKET_FOTOS não configurada no ambiente do painel.');
    try {
      const objeto = await cliente().send(new GetObjectCommand({ Bucket: bucket, Key: chave }));
      return (await objeto.Body?.transformToByteArray()) ?? null;
    } catch (erro) {
      if (erro instanceof NoSuchKey) return null;
      throw erro;
    }
  },
});
