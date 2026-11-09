import type { Db } from '@lumens/db';
import { criarBancoEmMemoria } from '@lumens/db/teste';
import { beforeAll, describe, expect, it } from 'vitest';
import { aprovarPauta } from './curadoria';
import { registrarEvento } from './eventos';
import { criarPauta } from './fabricas';
import { listarLinhaDoTempo } from './linha-do-tempo';
import { transicionarStatus } from './status';

let db: Db;

beforeAll(async () => {
  db = await criarBancoEmMemoria();
});

describe('listarLinhaDoTempo', () => {
  it('traz todos os eventos da pauta, inclusive os fora do site, do mais antigo ao mais novo', async () => {
    const pauta = await criarPauta(db, { status: 'em_curadoria' });
    const outra = await criarPauta(db, { status: 'em_curadoria' });
    // Uma transação por evento: o `criado_em` é o início da transação, então cada um tem o seu.
    await db.transaction((tx) =>
      registrarEvento(tx, {
        pautaId: pauta.id,
        tipo: 'pauta_criada',
        dados: { status: 'em_curadoria' },
        origem: 'bot',
      }),
    );
    await db.transaction((tx) =>
      registrarEvento(tx, {
        pautaId: outra.id,
        tipo: 'pauta_criada',
        dados: { status: 'em_curadoria' },
        origem: 'bot',
      }),
    );
    await db.transaction((tx) =>
      transicionarStatus(tx, {
        pautaId: pauta.id,
        para: 'recusada',
        origem: 'curadoria',
        motivo: 'Duplicada.',
      }),
    );

    const linha = await listarLinhaDoTempo(db, pauta.id);

    expect(
      linha.map(({ tipo, dados, origem, publico }) => ({ tipo, dados, origem, publico })),
    ).toEqual([
      { tipo: 'pauta_criada', dados: { status: 'em_curadoria' }, origem: 'bot', publico: false },
      {
        tipo: 'status_alterado',
        dados: { de: 'em_curadoria', para: 'recusada' },
        origem: 'curadoria',
        publico: false,
      },
    ]);
    expect(linha[0]?.criadoEm.getTime()).toBeLessThanOrEqual(linha[1]?.criadoEm.getTime() ?? 0);
  });

  it('eventos da mesma ação saem na ordem em que foram gravados', async () => {
    // Na mesma transação o `now()` empata; o desempate por `id` aleatório erraria metade das vezes.
    for (let i = 0; i < 10; i++) {
      const pauta = await criarPauta(db, { status: 'em_curadoria' });
      await db.transaction((tx) => aprovarPauta(tx, { pautaId: pauta.id }));

      const tipos = (await listarLinhaDoTempo(db, pauta.id)).map((e) => e.tipo);

      expect(tipos).toEqual(['status_alterado', 'pauta_aprovada']);
    }
  });

  it('pauta sem eventos ou inexistente dá lista vazia', async () => {
    const pauta = await criarPauta(db);
    expect(await listarLinhaDoTempo(db, pauta.id)).toEqual([]);
    expect(await listarLinhaDoTempo(db, '00000000-0000-0000-0000-000000000000')).toEqual([]);
  });
});
