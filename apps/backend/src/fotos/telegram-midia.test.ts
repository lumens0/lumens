import { describe, expect, it, vi } from 'vitest';
import { ErroDaApiDoTelegram } from '../bot/telegram/api';
import { ErroDeMidia } from './meta-midia';
import { baixarMidiaDoTelegram } from './telegram-midia';

function apiCom(arquivo: object | Error, bytes: Buffer | Error = Buffer.from('conteudo')) {
  return {
    chamar: vi.fn(() =>
      arquivo instanceof Error ? Promise.reject(arquivo) : Promise.resolve(arquivo),
    ) as never,
    baixarArquivo: vi.fn((_caminho: string) =>
      bytes instanceof Error ? Promise.reject(bytes) : Promise.resolve(bytes),
    ),
  };
}

describe('baixarMidiaDoTelegram', () => {
  it('getFile e depois o download do file_path; o tipo vem da extensão', async () => {
    const api = apiCom({ file_path: 'photos/file_1.jpg', file_size: 8 });
    const midia = await baixarMidiaDoTelegram('FILE', { api });
    expect(midia).toEqual({ bytes: Buffer.from('conteudo'), mimeType: 'image/jpeg' });
    expect(api.chamar).toHaveBeenCalledWith('getFile', { file_id: 'FILE' });
    expect(api.baixarArquivo).toHaveBeenCalledWith('photos/file_1.jpg');
  });

  it('PDF vem como application/pdf', async () => {
    const api = apiCom({ file_path: 'documents/file_2.pdf' });
    expect((await baixarMidiaDoTelegram('F', { api, tamanhoMaximo: 100 })).mimeType).toBe(
      'application/pdf',
    );
  });

  it('acima do limite pelo file_size: recusa sem baixar', async () => {
    const api = apiCom({ file_path: 'documents/a.pdf', file_size: 101 });
    const erro = await baixarMidiaDoTelegram('F', { api, tamanhoMaximo: 100 }).catch(
      (e: unknown) => e,
    );
    expect(erro).toMatchObject({ motivo: 'tamanho' });
    expect(api.baixarArquivo).not.toHaveBeenCalled();
  });

  it('"file is too big" do Telegram (mais de 20 MB) vira tamanho', async () => {
    const api = apiCom(new ErroDaApiDoTelegram('getFile', 400, 'Bad Request: file is too big'));
    const erro = await baixarMidiaDoTelegram('F', { api }).catch((e: unknown) => e);
    expect(erro).toBeInstanceOf(ErroDeMidia);
    expect(erro).toMatchObject({ motivo: 'tamanho' });
  });

  it('falha no download vira indisponível', async () => {
    const api = apiCom({ file_path: 'photos/a.jpg' }, new Error('rede'));
    await expect(baixarMidiaDoTelegram('F', { api })).rejects.toMatchObject({
      motivo: 'indisponivel',
    });
  });

  it('bytes acima do limite depois do download também são recusados', async () => {
    const api = apiCom({ file_path: 'documents/a.pdf' }, Buffer.alloc(200));
    await expect(baixarMidiaDoTelegram('F', { api, tamanhoMaximo: 100 })).rejects.toMatchObject({
      motivo: 'tamanho',
    });
  });
});
