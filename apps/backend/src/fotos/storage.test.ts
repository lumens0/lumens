import {
  DeleteObjectCommand,
  GetObjectCommand,
  NoSuchKey,
  PutObjectCommand,
} from '@aws-sdk/client-s3';
import { describe, expect, it } from 'vitest';
import { criarLeitorS3, criarStorageS3, type ClienteS3 } from './storage';

describe('criarStorageS3', () => {
  it('envia o arquivo ao bucket com a chave e o tipo', async () => {
    const enviados: (PutObjectCommand | DeleteObjectCommand)[] = [];
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

  it('remove o arquivo do bucket pela chave (SCRUM-314)', async () => {
    const enviados: (PutObjectCommand | DeleteObjectCommand)[] = [];
    const cliente: ClienteS3 = {
      send: (comando) => {
        enviados.push(comando);
        return Promise.resolve({});
      },
    };
    const storage = criarStorageS3({ bucket: 'lumens-fotos', regiao: 'us-east-1', cliente });

    await storage.remover('fotos/2026/11/a.jpg');

    expect(enviados).toHaveLength(1);
    expect(enviados[0]).toBeInstanceOf(DeleteObjectCommand);
    expect(enviados[0]?.input).toEqual({ Bucket: 'lumens-fotos', Key: 'fotos/2026/11/a.jpg' });
  });

  it('erro do storage chega a quem chamou', async () => {
    const cliente: ClienteS3 = { send: () => Promise.reject(new Error('negado')) };
    const storage = criarStorageS3({ bucket: 'b', regiao: 'us-east-1', cliente });
    await expect(storage.guardar('k', Buffer.from('x'), 'image/png')).rejects.toThrow('negado');
  });
});

describe('criarLeitorS3', () => {
  it('lê os bytes e o tipo do arquivo pela chave', async () => {
    const enviados: GetObjectCommand[] = [];
    const ler = criarLeitorS3({
      bucket: 'lumens-fotos',
      regiao: 'us-east-1',
      cliente: {
        send: (comando) => {
          enviados.push(comando);
          return Promise.resolve({
            Body: { transformToByteArray: () => Promise.resolve(new Uint8Array([1, 2, 3])) },
            ContentType: 'image/png',
          });
        },
      },
    });

    expect(await ler('relatos/a.png')).toEqual({
      bytes: Buffer.from([1, 2, 3]),
      contentType: 'image/png',
    });
    expect(enviados[0]?.input).toEqual({ Bucket: 'lumens-fotos', Key: 'relatos/a.png' });
  });

  it('arquivo que não existe vira null; outro erro sobe', async () => {
    const semArquivo = criarLeitorS3({
      bucket: 'b',
      regiao: 'us-east-1',
      cliente: { send: () => Promise.reject(new NoSuchKey({ message: 'x', $metadata: {} })) },
    });
    expect(await semArquivo('k')).toBeNull();
    const negado = criarLeitorS3({
      bucket: 'b',
      regiao: 'us-east-1',
      cliente: { send: () => Promise.reject(new Error('negado')) },
    });
    await expect(negado('k')).rejects.toThrow('negado');
  });
});
