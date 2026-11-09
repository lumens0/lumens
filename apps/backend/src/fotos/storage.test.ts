import { PutObjectCommand } from '@aws-sdk/client-s3';
import { describe, expect, it } from 'vitest';
import { criarStorageS3, type ClienteS3 } from './storage';

describe('criarStorageS3', () => {
  it('envia o arquivo ao bucket com a chave e o tipo', async () => {
    const enviados: PutObjectCommand[] = [];
    const cliente: ClienteS3 = {
      send: (comando) => {
        enviados.push(comando);
        return Promise.resolve({});
      },
    };
    const storage = criarStorageS3({ bucket: 'lumens-fotos', regiao: 'us-east-1', cliente });

    await storage.guardar('fotos/2026/11/a.jpg', Buffer.from('x'), 'image/jpeg');

    expect(enviados).toHaveLength(1);
    expect(enviados[0]).toBeInstanceOf(PutObjectCommand);
    expect(enviados[0]?.input).toEqual({
      Bucket: 'lumens-fotos',
      Key: 'fotos/2026/11/a.jpg',
      Body: Buffer.from('x'),
      ContentType: 'image/jpeg',
    });
  });

  it('erro do storage chega a quem chamou', async () => {
    const cliente: ClienteS3 = { send: () => Promise.reject(new Error('negado')) };
    const storage = criarStorageS3({ bucket: 'b', regiao: 'us-east-1', cliente });
    await expect(storage.guardar('k', Buffer.from('x'), 'image/png')).rejects.toThrow('negado');
  });
});
