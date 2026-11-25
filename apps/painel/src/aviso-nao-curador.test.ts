import { type Db } from '@lumens/db';
import { criarBancoEmMemoria } from '@lumens/db/teste';
import { beforeAll, describe, expect, it } from 'vitest';
import {
  ASSUNTO_DO_AVISO,
  ESPERA_ENTRE_AVISOS_S,
  LIMITE_GERAL_POR_HORA,
  TEXTO_DO_AVISO,
  avisarNaoCurador,
  reservarAvisoDeNaoCurador,
} from './aviso-nao-curador';
import { reservarEnvio } from './acesso';

const CHAVE = Buffer.alloc(32, 7);
const T0 = new Date('2026-11-24T12:00:00Z');
const depois = (segundos: number) => new Date(T0.getTime() + segundos * 1000);

let db: Db;
beforeAll(async () => {
  db = await criarBancoEmMemoria();
}, 30_000);

function envios() {
  const enviados: { para: string; assunto: string; texto: string }[] = [];
  return {
    enviados,
    enviar: (para: string, assunto: string, texto: string) => {
      enviados.push({ para, assunto, texto });
      return Promise.resolve();
    },
  };
}

describe('aviso a quem pediu o link e não é curador (SCRUM-400)', () => {
  it('manda o aviso ao próprio endereço, sem link e sem dizer quem é da curadoria', async () => {
    const { enviados, enviar } = envios();

    const r = await avisarNaoCurador(db, CHAVE, 'aluna@ufal.br', enviar, undefined, T0);

    expect(r).toBe('enviado');
    expect(enviados).toEqual([
      { para: 'aluna@ufal.br', assunto: ASSUNTO_DO_AVISO, texto: TEXTO_DO_AVISO },
    ]);
    expect(TEXTO_DO_AVISO).not.toMatch(/https?:|\/login/);
    expect(TEXTO_DO_AVISO).toContain('não está na lista da curadoria');
  });

  it('um aviso por endereço por hora; passada a hora, avisa de novo', async () => {
    const { enviados, enviar } = envios();
    const email = 'repete@ufal.br';

    expect(await avisarNaoCurador(db, CHAVE, email, enviar, undefined, T0)).toBe('enviado');
    expect(await avisarNaoCurador(db, CHAVE, email, enviar, undefined, depois(120))).toBe(
      'barrado',
    );
    // Maiúsculas e espaços não driblam o limite: o endereço é normalizado.
    expect(
      await avisarNaoCurador(db, CHAVE, '  REPETE@ufal.br ', enviar, undefined, depois(600)),
    ).toBe('barrado');
    expect(
      await avisarNaoCurador(
        db,
        CHAVE,
        email,
        enviar,
        undefined,
        depois(ESPERA_ENTRE_AVISOS_S + 1),
      ),
    ).toBe('enviado');
    expect(enviados).toHaveLength(2);
  });

  it('o painel todo passa de um teto por hora: acima dele ninguém mais recebe', async () => {
    const dbCheio = await criarBancoEmMemoria();
    const { enviados, enviar } = envios();
    for (let i = 0; i < LIMITE_GERAL_POR_HORA; i++) {
      expect(
        await avisarNaoCurador(dbCheio, CHAVE, `pessoa${String(i)}@ufal.br`, enviar, undefined, T0),
      ).toBe('enviado');
    }

    expect(
      await avisarNaoCurador(dbCheio, CHAVE, 'excedente@ufal.br', enviar, undefined, depois(60)),
    ).toBe('barrado');
    expect(enviados).toHaveLength(LIMITE_GERAL_POR_HORA);
    // Uma hora depois o teto zera.
    expect(
      await avisarNaoCurador(
        dbCheio,
        CHAVE,
        'excedente@ufal.br',
        enviar,
        undefined,
        depois(ESPERA_ENTRE_AVISOS_S + 1),
      ),
    ).toBe('enviado');
  }, 30_000);

  it('falha no envio não lança: o login não depende do aviso', async () => {
    const erros: string[] = [];
    const r = await avisarNaoCurador(
      db,
      CHAVE,
      'falha@ufal.br',
      () => Promise.reject(new Error('smtp fora do ar')),
      (mensagem) => erros.push(mensagem),
      T0,
    );
    expect(r).toBe('falhou');
    expect(erros).toHaveLength(1);
  });

  it('não mexe no limite de um link por minuto de quem pede o link', async () => {
    const email = 'independente@ufal.br';
    expect(await reservarAvisoDeNaoCurador(db, email, CHAVE, T0)).toBe(true);
    // O mesmo endereço ainda pode reservar o envio do link: as chaves são separadas.
    expect(await reservarEnvio(db, email, CHAVE, T0)).toBe(true);
  });
});
