import { describe, expect, it } from 'vitest';
import { opcoesSmtp } from './smtp';

const SERVIDOR = { host: 'smtp.teste', usuario: 'u', senha: 's' };

describe('opcoesSmtp (SCRUM-304)', () => {
  it('na 587, começa sem TLS e exige o STARTTLS', () => {
    expect(opcoesSmtp({ ...SERVIDOR, porta: 587 })).toMatchObject({
      port: 587,
      secure: false,
      requireTLS: true,
    });
  });

  it('na 465, é TLS desde o início', () => {
    expect(opcoesSmtp({ ...SERVIDOR, porta: 465 })).toMatchObject({
      port: 465,
      secure: true,
      requireTLS: false,
    });
  });

  it('qualquer outra porta também exige o STARTTLS', () => {
    expect(opcoesSmtp({ ...SERVIDOR, porta: 2525 })).toMatchObject({ requireTLS: true });
  });
});
