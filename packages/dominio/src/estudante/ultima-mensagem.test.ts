import { estudantes, eq, type Db } from '@lumens/db';
import { criarBancoEmMemoria } from '@lumens/db/teste';
import { beforeEach, describe, expect, it } from 'vitest';
import { registrarMensagemRecebida } from './ultima-mensagem';

const T0 = new Date('2026-11-13T12:00:00.000Z');
const depois = (ms: number) => new Date(T0.getTime() + ms);

let db: Db;

beforeEach(async () => {
  db = await criarBancoEmMemoria();
}, 30_000);

async function estudante(telefoneHmac: string): Promise<string> {
  const [linha] = await db
    .insert(estudantes)
    .values({ telefoneHmac, telefoneCifrado: 'c' })
    .returning({ id: estudantes.id });
  if (linha === undefined) throw new Error('estudante não criado');
  return linha.id;
}

const ultima = async (id: string) =>
  (await db.select().from(estudantes).where(eq(estudantes.id, id)))[0]?.ultimaMensagemEm;

const registrar = (telefoneHmac: string, agora: Date) =>
  db.transaction((tx) => registrarMensagemRecebida(tx, { telefoneHmac, agora }));

describe('registrarMensagemRecebida (SCRUM-275)', () => {
  it('grava o instante da mensagem do estudante', async () => {
    const id = await estudante('tel-a');

    expect(await registrar('tel-a', T0)).toBe(true);
    expect(await ultima(id)).toEqual(T0);
  });

  it('mensagem atrasada na fila não volta o relógio', async () => {
    const id = await estudante('tel-a');
    await registrar('tel-a', depois(60_000));

    expect(await registrar('tel-a', T0)).toBe(false);
    expect(await ultima(id)).toEqual(depois(60_000));
  });

  it('quem não tem cadastro não grava nada', async () => {
    const outro = await estudante('tel-b');

    expect(await registrar('tel-sem-cadastro', T0)).toBe(false);
    expect(await ultima(outro)).toBeNull();
  });
});
