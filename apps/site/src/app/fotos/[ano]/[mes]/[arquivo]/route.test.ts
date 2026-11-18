import { beforeEach, describe, expect, it, vi } from 'vitest';
import { buscarFoto } from '../../../../../dados/api';
import { GET } from './route';

vi.mock('../../../../../dados/api', () => ({ buscarFoto: vi.fn() }));
vi.mock('next/server', () => ({ connection: () => Promise.resolve() }));

const pedir = () =>
  GET(new Request('https://lumens.teste/fotos/2026/11/a.jpg'), {
    params: Promise.resolve({ ano: '2026', mes: '11', arquivo: 'a.jpg' }),
  });

describe('GET /fotos/[ano]/[mes]/[arquivo]', () => {
  beforeEach(() => vi.mocked(buscarFoto).mockReset());

  it('foto aprovada: devolve a imagem com o tipo e sem deixar o navegador adivinhar', async () => {
    vi.mocked(buscarFoto).mockResolvedValue({
      bytes: new TextEncoder().encode('img').buffer,
      tipo: 'image/jpeg',
    });
    const res = await pedir();
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('image/jpeg');
    expect(res.headers.get('x-content-type-options')).toBe('nosniff');
    expect(await res.text()).toBe('img');
  });

  it('foto pendente, recusada ou inexistente: 404 sem corpo de imagem', async () => {
    vi.mocked(buscarFoto).mockResolvedValue(null);
    const res = await pedir();
    expect(res.status).toBe(404);
    expect(res.headers.get('content-type')).not.toContain('image');
  });

  it('tipo que não é imagem (HTML, por exemplo) nunca é servido', async () => {
    vi.mocked(buscarFoto).mockResolvedValue({ bytes: new ArrayBuffer(0), tipo: 'text/html' });
    expect((await pedir()).status).toBe(404);
  });
});
