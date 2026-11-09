/**
 * Guarda as fotos no storage (bucket `S3_BUCKET_FOTOS`). O cliente S3 da AWS também fala com R2 e
 * Supabase Storage: para eles, ou para um emulador local, basta preencher `S3_ENDPOINT`.
 */
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';

export interface Storage {
  guardar(chave: string, bytes: Buffer, contentType: string): Promise<void>;
}

/** O pedaço do `S3Client` que usamos: deixa os testes passarem um cliente falso. */
export interface ClienteS3 {
  send(comando: PutObjectCommand): Promise<unknown>;
}

export interface OpcoesDoStorage {
  bucket: string;
  regiao: string;
  /** Vazio = AWS. Preenchido = outro serviço compatível (R2, Supabase) ou emulador. */
  endpoint?: string | undefined;
  cliente?: ClienteS3;
}

export function criarStorageS3({ bucket, regiao, endpoint, cliente }: OpcoesDoStorage): Storage {
  const s3: ClienteS3 =
    cliente ??
    new S3Client({
      region: regiao,
      // Endpoint próprio (R2, Supabase, emulador) usa o bucket no caminho, não no subdomínio.
      ...(endpoint ? { endpoint, forcePathStyle: true } : {}),
    });
  return {
    async guardar(chave, bytes, contentType) {
      await s3.send(
        new PutObjectCommand({ Bucket: bucket, Key: chave, Body: bytes, ContentType: contentType }),
      );
    },
  };
}
