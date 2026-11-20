import { afterEach, describe, expect, it, vi } from 'vitest';
import { buscarPautas } from '../../dados/api';
import { GET } from './route';

vi.mock('next/server', () => ({ connection: () => Promise.resolve() }));
vi.mock('../../dados/api', () => ({ buscarPautas: vi.fn() }));

describe('GET /dados.csv', () => {
  afterEach(() => vi.resetAllMocks());

  it('entrega um CSV para baixar, com o cabeçalho das colunas e cache curto', async () => {
    vi.mocked(buscarPautas).mockResolvedValue([]);
    const resposta = await GET();
    expect(resposta.status).toBe(200);
    expect(resposta.headers.get('Content-Type')).toBe('text/csv; charset=utf-8');
    expect(resposta.headers.get('Content-Disposition')).toBe(
      'attachment; filename="lumens-pautas.csv"',
    );
    expect(resposta.headers.get('Cache-Control')).toBe('public, max-age=10');
    const texto = await resposta.text();
    expect(texto.split('\n')[0]).toContain('pauta;endereco;categoria');
  });

  it('erro da API sobe em vez de entregar um CSV vazio', async () => {
    vi.mocked(buscarPautas).mockRejectedValue(new Error('API fora do ar'));
    await expect(GET()).rejects.toThrow('API fora do ar');
  });
});
