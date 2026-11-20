import { GetObjectCommand, NoSuchKey } from '@aws-sdk/client-s3';
import { bucketDasFotos, clienteS3 } from '../../../../armazenamento';
import { curadorDaSessao } from '../../../../auth';
import { criarGetArquivo } from './arquivo';

export const GET = criarGetArquivo({
  autorizado: async () => (await curadorDaSessao()) !== undefined,
  async ler(chave) {
    try {
      const objeto = await clienteS3().send(
        new GetObjectCommand({ Bucket: bucketDasFotos(), Key: chave }),
      );
      return (await objeto.Body?.transformToByteArray()) ?? null;
    } catch (erro) {
      if (erro instanceof NoSuchKey) return null;
      throw erro;
    }
  },
});
