import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';

// O mesmo bucket em que o bot grava (`S3_BUCKET_FOTOS`). As credenciais vêm do ambiente, como no
// backend: papel da instância em produção, e `S3_ENDPOINT` para emulador ou serviço compatível.
let s3: S3Client | undefined;
export function clienteS3(): S3Client {
  const endpoint = process.env.S3_ENDPOINT;
  s3 ??= new S3Client({
    // `||`, não `??`: uma variável definida e vazia (comum em .env) também cai na região padrão.
    region: process.env.AWS_REGION || 'us-east-1',
    ...(endpoint ? { endpoint, forcePathStyle: true } : {}),
  });
  return s3;
}

export function bucketDasFotos(): string {
  const bucket = process.env.S3_BUCKET_FOTOS;
  if (!bucket) throw new Error('S3_BUCKET_FOTOS não configurada no ambiente do painel.');
  return bucket;
}

/** Grava um arquivo no bucket das fotos (a foto da conquista, SCRUM-394). */
export async function guardarNoBucket(
  chave: string,
  bytes: Buffer,
  contentType: string,
): Promise<void> {
  await clienteS3().send(
    new PutObjectCommand({
      Bucket: bucketDasFotos(),
      Key: chave,
      Body: bytes,
      ContentType: contentType,
    }),
  );
}
