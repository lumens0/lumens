import { curadores, verificacoesLogin, type Db } from '@lumens/db';
import { criarBancoEmMemoria } from '@lumens/db/teste';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { VALIDADE_DO_LINK_S, adaptador, hmacDoEmail } from './acesso';
import { criarEnvioDoLink, hashDoToken } from './envio';

const CHAVE = Buffer.alloc(32, 9);
const SEGREDO = 'segredo-do-auth';
let db: Db;

beforeAll(async () => {
  db = await criarBancoEmMemoria();
  await db
    .insert(curadores)
    .values({ emailHmac: hmacDoEmail('ana@ufal.br', CHAVE), emailCifrado: 'x', nome: 'Ana' });
}, 30_000);

const pedido = (token: string) => ({
  identifier: 'ana@ufal.br',
  url: `https://painel/callback?token=${token}`,
  from: 'painel@lumens',
  token,
});

describe('e-mail do link de login (SCRUM-305)', () => {
  it('gravação que falha: o e-mail não sai', async () => {
    const smtp = vi.fn(() => Promise.resolve());
    const erros = vi.fn();
    const envio = criarEnvioDoLink(SEGREDO, smtp, erros);
    void envio.guardar(hashDoToken('t-falha', SEGREDO), Promise.reject(new Error('banco caiu')));

    expect(await envio.enviar(pedido('t-falha'))).toBe('gravacao_falhou');
    expect(smtp).not.toHaveBeenCalled();
    expect(erros).toHaveBeenCalled();
  });

  it('reserva barrada: o e-mail não sai', async () => {
    const smtp = vi.fn(() => Promise.resolve());
    const envio = criarEnvioDoLink(SEGREDO, smtp);
    void envio.guardar(hashDoToken('t-barrado', SEGREDO), Promise.resolve(false));

    expect(await envio.enviar(pedido('t-barrado'))).toBe('barrado');
    expect(smtp).not.toHaveBeenCalled();
  });

  it('dois pedidos simultâneos do mesmo e-mail: sai exatamente um e-mail, o do pedido que reservou', async () => {
    const smtp = vi.fn(() => Promise.resolve());
    const envio = criarEnvioDoLink(SEGREDO, smtp);
    const a = adaptador(db, CHAVE, (tokenEmHash, gravacao) => {
      void envio.guardar(tokenEmHash, gravacao);
    });
    const expires = new Date(Date.now() + VALIDADE_DO_LINK_S * 1000);

    // Como o Auth.js: cada pedido grava o token em hash e envia com o token em claro.
    const pedidos = ['claro-1', 'claro-2'].map((claro) => ({
      claro,
      gravar: Promise.resolve(
        a.createVerificationToken?.({
          identifier: 'ana@ufal.br',
          token: hashDoToken(claro, SEGREDO),
          expires,
        }),
      ),
    }));
    await Promise.all(pedidos.map((p) => p.gravar));
    const resultados = await Promise.all(pedidos.map((p) => envio.enviar(pedido(p.claro))));

    expect(resultados.filter((r) => r === 'enviado')).toHaveLength(1);
    expect(smtp).toHaveBeenCalledTimes(1);
    // O e-mail enviado leva o link do pedido cujo token ficou gravado no banco.
    const gravados = (await db.select().from(verificacoesLogin)).map((l) => l.token);
    const enviado = (smtp.mock.calls as unknown as [{ token: string }][])[0]?.[0].token ?? '';
    expect(gravados).toContain(hashDoToken(enviado, SEGREDO));
    expect(gravados).toHaveLength(1);
  });

  it('o envio que falha no SMTP não derruba o pedido', async () => {
    const envio = criarEnvioDoLink(
      SEGREDO,
      () => Promise.reject(new Error('smtp fora')),
      () => undefined,
    );
    void envio.guardar(hashDoToken('t-smtp', SEGREDO), Promise.resolve(true));
    expect(await envio.enviar(pedido('t-smtp'))).toBe('envio_falhou');
  });
});
