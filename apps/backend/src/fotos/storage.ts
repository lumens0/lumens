/**
 * Guarda as fotos no storage (bucket `S3_BUCKET_FOTOS`). O cliente S3 da AWS também fala com R2 e
 * Supabase Storage: para eles, ou para um emulador local, basta preencher `S3_ENDPOINT`.
 */
import {
  DeleteObjectCommand,
  GetObjectCommand,
  NoSuchKey,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';

export interface Storage {
  guardar(chave: string, bytes: Buffer, contentType: string): Promise<void>;
  /** Apaga o arquivo (SCRUM-314). Arquivo que não existe não é erro: o S3 responde igual. */
  remover(chave: string): Promise<void>;
}

/** O pedaço do `S3Client` que usamos: deixa os testes passarem um cliente falso. */
export interface ClienteS3 {
  send(comando: PutObjectCommand | DeleteObjectCommand): Promise<unknown>;
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
    async remover(chave) {
      await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: chave }));
    },
  };
}

export interface ArquivoLido {
  bytes: Buffer;
  /** Tipo gravado junto com o arquivo; `undefined` quando o storage não guardou um. */
  contentType: string | undefined;
}

/** Lê um arquivo do bucket: serve as fotos aprovadas na API de leitura (SCRUM-263). */
export type LerArquivo = (chave: string) => Promise<ArquivoLido | null>;

/** O pedaço do `S3Client` que a leitura usa: deixa os testes passarem um cliente falso. */
export interface ClienteS3Leitura {
  send(comando: GetObjectCommand): Promise<unknown>;
}

export function criarLeitorS3({
  bucket,
  regiao,
  endpoint,
  cliente,
}: Omit<OpcoesDoStorage, 'cliente'> & { cliente?: ClienteS3Leitura }): LerArquivo {
  const s3: ClienteS3Leitura =
    cliente ??
    new S3Client({ region: regiao, ...(endpoint ? { endpoint, forcePathStyle: true } : {}) });
  return async (chave) => {
    try {
      const objeto = (await s3.send(new GetObjectCommand({ Bucket: bucket, Key: chave }))) as {
        Body?: { transformToByteArray(): Promise<Uint8Array> };
        ContentType?: string;
      };
      if (!objeto.Body) return null;
      return {
        bytes: Buffer.from(await objeto.Body.transformToByteArray()),
        contentType: objeto.ContentType,
      };
    } catch (erro) {
      if (erro instanceof NoSuchKey) return null;
      throw erro;
    }
  };
}
