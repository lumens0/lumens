import { describe, expect, it, vi } from 'vitest';
import {
  compartilharCard,
  copiarLink,
  SEM_SUPORTE,
  SEM_SUPORTE_DO_LINK,
  type RecursosDoNavegador,
} from './compartilhar';

const imagem = new Blob(['png'], { type: 'image/png' });
const dados = { titulo: 'Pauta', link: 'https://lumens.teste/p/x' };
const item = {} as ClipboardItem;

describe('compartilharCard', () => {
  it('usa a folha de compartilhar do aparelho quando ela aceita arquivos', async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    const nav: RecursosDoNavegador = { share, canShare: () => true };
    const r = await compartilharCard(imagem, dados, nav);
    expect(r.resultado).toBe('compartilhado');
    expect(share).toHaveBeenCalledOnce();
    const arg = share.mock.calls[0]?.[0] as { files: File[]; url: string };
    expect(arg.files[0]?.type).toBe('image/png');
    expect(arg.url).toBe(dados.link);
  });

  it('se a pessoa fecha a folha do aparelho, é cancelamento, sem mensagem de erro', async () => {
    const share = vi.fn().mockRejectedValue(new DOMException('x', 'AbortError'));
    const r = await compartilharCard(imagem, dados, { share, canShare: () => true });
    expect(r).toEqual({ resultado: 'cancelado', mensagem: '' });
  });

  it('sem compartilhar arquivos, copia a imagem', async () => {
    const write = vi.fn().mockResolvedValue(undefined);
    const nav: RecursosDoNavegador = {
      share: vi.fn(),
      canShare: () => false,
      clipboard: { write },
      itemDeImagem: () => item,
    };
    const r = await compartilharCard(imagem, dados, nav);
    expect(r).toEqual({ resultado: 'copiado', mensagem: 'Card copiado.' });
    expect(write).toHaveBeenCalledWith([item]);
  });

  it('falha ao compartilhar (que não é cancelamento) cai na cópia da imagem', async () => {
    const nav: RecursosDoNavegador = {
      share: vi.fn().mockRejectedValue(new Error('falhou')),
      canShare: () => true,
      clipboard: { write: vi.fn().mockResolvedValue(undefined) },
      itemDeImagem: () => item,
    };
    expect((await compartilharCard(imagem, dados, nav)).resultado).toBe('copiado');
  });

  it('sem nenhum recurso, ou com a cópia recusada, mostra a mensagem de reserva', async () => {
    expect(await compartilharCard(imagem, dados, {})).toEqual({
      resultado: 'sem-suporte',
      mensagem: SEM_SUPORTE,
    });
    const recusa: RecursosDoNavegador = {
      clipboard: { write: vi.fn().mockRejectedValue(new Error('negado')) },
      itemDeImagem: () => item,
    };
    expect((await compartilharCard(imagem, dados, recusa)).resultado).toBe('sem-suporte');
  });

  it('a mensagem de reserva aponta o caminho de "Copiar só o link"', () => {
    expect(SEM_SUPORTE).toContain('Toque e segure no card');
    expect(SEM_SUPORTE).toContain("'Copiar só o link'");
  });
});

describe('copiarLink', () => {
  it('copia o endereço da pauta', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    const r = await copiarLink(dados.link, { clipboard: { writeText } });
    expect(r).toEqual({ resultado: 'link-copiado', mensagem: 'Link copiado.' });
    expect(writeText).toHaveBeenCalledWith(dados.link);
  });

  it('sem permissão ou sem área de transferência, mostra a mensagem de reserva', async () => {
    expect((await copiarLink(dados.link, {})).mensagem).toBe(SEM_SUPORTE_DO_LINK);
    const negado = { clipboard: { writeText: vi.fn().mockRejectedValue(new Error('negado')) } };
    expect((await copiarLink(dados.link, negado)).resultado).toBe('sem-suporte');
  });
});

describe('ativação do clique (Safari)', () => {
  it('compartilharCard chama o `share` do aparelho de forma síncrona, antes de qualquer espera', () => {
    const share = vi.fn().mockResolvedValue(undefined);
    // Sem `await` aqui: se houvesse uma espera antes, `share` ainda não teria sido chamado.
    void compartilharCard(imagem, dados, { share, canShare: () => true });
    expect(share).toHaveBeenCalledOnce();
  });
});
