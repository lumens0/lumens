import { describe, expect, it, vi } from 'vitest';
import { entregarLink } from './link-de-acesso';

const URL_DO_LINK = 'http://localhost:3001/api/auth/callback/nodemailer?token=abc';

describe('entrega do link de acesso', () => {
  it('no next dev: mostra o link no terminal e não envia e-mail', () => {
    const enviar = vi.fn();
    const mostrar = vi.fn();
    entregarLink(URL_DO_LINK, { emDev: true, enviar, mostrar });

    expect(enviar).not.toHaveBeenCalled();
    expect(mostrar).toHaveBeenCalledOnce();
    expect(mostrar.mock.calls[0]?.[0]).toContain(URL_DO_LINK);
  });

  it('fora do dev: envia e não mostra o link', () => {
    const enviar = vi.fn();
    const mostrar = vi.fn();
    entregarLink(URL_DO_LINK, { emDev: false, enviar, mostrar });

    expect(enviar).toHaveBeenCalledOnce();
    expect(mostrar).not.toHaveBeenCalled();
  });
});
