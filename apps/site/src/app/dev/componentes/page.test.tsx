import { afterEach, describe, expect, it, vi } from 'vitest';
import Componentes from './page';

const NAO_ENCONTRADO = new Error('NEXT_NOT_FOUND');

vi.mock('next/navigation', () => ({
  notFound: vi.fn(() => {
    throw NAO_ENCONTRADO;
  }),
}));

describe('página /dev/componentes', () => {
  afterEach(() => vi.unstubAllEnvs());

  it('é 404 em produção', () => {
    vi.stubEnv('NODE_ENV', 'production');
    expect(() => Componentes()).toThrow(NAO_ENCONTRADO);
  });

  it('renderiza no next dev', () => {
    vi.stubEnv('NODE_ENV', 'development');
    expect(Componentes()).toBeTruthy();
  });
});
