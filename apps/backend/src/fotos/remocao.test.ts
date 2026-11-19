import { fotosARemover, type Db } from '@lumens/db';
import { criarBancoEmMemoria } from '@lumens/db/teste';
import { beforeEach, describe, expect, it } from 'vitest';
import { ConversationStore } from '../bot/conversation/store';
import { limparConversasExpiradas } from '../agendador/limpeza-conversas';
import { agendarRemocao, executarRemocoes } from './remocao';
import { criarServicoDeFotos, type ServicoDeFotos } from './servico';
import type { Storage } from './storage';

let db: Db;

beforeEach(async () => {
  db = await criarBancoEmMemoria();
}, 30_000);

const fila = async () =>
  (await db.select().from(fotosARemover).orderBy(fotosARemover.chave)).map((l) => ({
    chave: l.chave,
    tentativas: l.tentativas,
  }));

/** Serviço cujo storage falha para as chaves que o teste marcar, e que guarda o que saiu. */
function servico(falhas: Set<string>): { fotos: ServicoDeFotos; apagadas: string[] } {
  const apagadas: string[] = [];
  const storage: Storage = {
    guardar: () => Promise.resolve(),
    remover: (chave: string) => {
      if (falhas.has(chave)) return Promise.reject(new Error('storage fora do ar'));
      apagadas.push(chave);
      return Promise.resolve();
    },
  };
  const fotos = criarServicoDeFotos({
    baixar: () => Promise.reject(new Error('sem download')),
    storage,
  });
  return { fotos, apagadas };
}

describe('fila durável de remoção de fotos', () => {
  it('agendar não repete a chave e desfaz junto com a transação', async () => {
    await agendarRemocao(db, ['fotos/a.jpg', 'fotos/a.jpg', 'fotos/b.jpg']);
    await agendarRemocao(db, ['fotos/a.jpg']);
    expect((await fila()).map((l) => l.chave)).toEqual(['fotos/a.jpg', 'fotos/b.jpg']);

    // Transação que desfaz: a chave não fica na fila (o arquivo continua valendo).
    await expect(
      db.transaction(async (tx) => {
        await agendarRemocao(tx, ['fotos/c.jpg']);
        throw new Error('volta');
      }),
    ).rejects.toThrow('volta');
    expect((await fila()).map((l) => l.chave)).toEqual(['fotos/a.jpg', 'fotos/b.jpg']);
  });

  it('storage fora do ar: a chave fica na fila com a tentativa contada, e sai numa rodada posterior', async () => {
    await agendarRemocao(db, ['fotos/a.jpg', 'fotos/b.jpg']);
    const falhas = new Set(['fotos/b.jpg']);
    const { fotos, apagadas } = servico(falhas);

    expect(await executarRemocoes(db, fotos)).toBe(1);
    expect(apagadas).toEqual(['fotos/a.jpg']);
    // Só a que o storage confirmou saiu da fila; a outra fica, com a tentativa registrada.
    expect(await fila()).toEqual([{ chave: 'fotos/b.jpg', tentativas: 1 }]);

    // Mais uma rodada com o storage ainda fora do ar.
    expect(await executarRemocoes(db, fotos)).toBe(0);
    expect(await fila()).toEqual([{ chave: 'fotos/b.jpg', tentativas: 2 }]);

    // O storage volta: na rodada seguinte a chave sai.
    falhas.clear();
    expect(await executarRemocoes(db, fotos)).toBe(1);
    expect(apagadas).toEqual(['fotos/a.jpg', 'fotos/b.jpg']);
    expect(await fila()).toEqual([]);
  });

  it('sem serviço de fotos, ou com a fila vazia, não faz nada nem lança', async () => {
    await agendarRemocao(db, ['fotos/a.jpg']);
    expect(await executarRemocoes(db, undefined)).toBe(0);
    expect(await fila()).toHaveLength(1);
    await db.delete(fotosARemover);
    expect(await executarRemocoes(db, servico(new Set()).fotos)).toBe(0);
  });

  it('serviço que só sabe removerFotos: o que não lançou vale como confirmado', async () => {
    await agendarRemocao(db, ['fotos/a.jpg']);
    const chamadas: string[][] = [];
    const fotos: ServicoDeFotos = {
      guardarFoto: () => Promise.resolve({ ok: false, motivo: 'indisponivel' } as const),
      removerFotos: (chaves) => {
        chamadas.push([...chaves]);
        return Promise.resolve();
      },
    };
    expect(await executarRemocoes(db, fotos)).toBe(1);
    expect(chamadas).toEqual([['fotos/a.jpg']]);
    expect(await fila()).toEqual([]);
  });

  it('limpeza de conversas: storage falha, a conversa some mas a chave fica na fila e sai depois', async () => {
    let agora = new Date('2026-11-18T12:00:00Z');
    const store = new ConversationStore(db, () => agora);
    await store.save('tel', 'NEW_ASK_PHOTO', { fotoChaves: ['fotos/2026/11/x.jpg'] });
    agora = new Date(agora.getTime() + 25 * 3600_000);
    const falhas = new Set(['fotos/2026/11/x.jpg']);
    const { fotos, apagadas } = servico(falhas);

    expect(await limparConversasExpiradas({ store, db, fotos })).toBe(1);
    // A conversa foi apagada e as chaves dela já não estão em lugar nenhum... a não ser na fila.
    expect(await store.fotoChavesDaConversa('tel')).toEqual([]);
    expect(await fila()).toEqual([{ chave: 'fotos/2026/11/x.jpg', tentativas: 1 }]);
    expect(apagadas).toEqual([]);

    // Na próxima rodada (nenhuma conversa para apagar), a fila é esvaziada.
    falhas.clear();
    expect(await limparConversasExpiradas({ store, db, fotos })).toBe(0);
    expect(apagadas).toEqual(['fotos/2026/11/x.jpg']);
    expect(await fila()).toEqual([]);
  });
});
