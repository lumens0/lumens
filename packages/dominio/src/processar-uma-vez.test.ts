import {
  apoios,
  criarDb,
  criarPool,
  eq,
  mensagensProcessadas,
  sql,
  type Db,
  type Tx,
} from '@lumens/db';
import { criarBancoEmMemoria, criarBancoTemporario } from '@lumens/db/teste';
import { beforeAll, describe, expect, it } from 'vitest';
import { registrarApoio } from './apoio';
import { criarEstudanteVerificado, criarPauta } from './fabricas';
import { processarUmaVez } from './processar-uma-vez';

let db: Db;

beforeAll(async () => {
  db = await criarBancoEmMemoria();
});

const registradas = (wamidHmac: string, banco: Db = db) =>
  banco.select().from(mensagensProcessadas).where(eq(mensagensProcessadas.wamidHmac, wamidHmac));

const apoiosDa = (pautaId: string) => db.select().from(apoios).where(eq(apoios.pautaId, pautaId));

describe('processarUmaVez', () => {
  it('a mesma mensagem duas vezes em sequência roda a ação uma vez', async () => {
    let execucoes = 0;
    const acao = () => Promise.resolve(++execucoes);

    const primeira = await processarUmaVez(db, 'hmac-sequencia', acao);
    const segunda = await processarUmaVez(db, 'hmac-sequencia', acao);

    expect(primeira).toEqual({ processada: true, resultado: 1 });
    expect(segunda).toEqual({ processada: false, motivo: 'duplicada' });
    expect(execucoes).toBe(1);
  });

  it('ação que lança não deixa a mensagem registrada, e o reenvio é processado', async () => {
    const pauta = await criarPauta(db);
    const estudante = await criarEstudanteVerificado(db);
    const apoio = { pautaId: pauta.id, estudanteId: estudante.id, origem: 'bot' as const };

    await expect(
      processarUmaVez(db, 'hmac-falha', async (tx) => {
        await registrarApoio(tx, apoio);
        throw new Error('banco piscou');
      }),
    ).rejects.toThrow('banco piscou');

    // O rollback levou junto o registro da mensagem e o que a ação já tinha gravado.
    expect(await registradas('hmac-falha')).toHaveLength(0);
    expect(await apoiosDa(pauta.id)).toHaveLength(0);

    const reenvio = await processarUmaVez(db, 'hmac-falha', (tx) => registrarApoio(tx, apoio));
    expect(reenvio).toMatchObject({ processada: true, resultado: { totalApoios: 1 } });
    expect(await registradas('hmac-falha')).toHaveLength(1);
  });

  it('apoio por mensagem repetida não muda a contagem nem repete a ação', async () => {
    const pauta = await criarPauta(db);
    const estudante = await criarEstudanteVerificado(db);
    let execucoes = 0;
    const apoiar = () =>
      processarUmaVez(db, 'hmac-apoio', (tx) => {
        execucoes++;
        return registrarApoio(tx, { pautaId: pauta.id, estudanteId: estudante.id, origem: 'bot' });
      });

    const primeira = await apoiar();
    const repetida = await apoiar();

    expect(primeira).toMatchObject({ processada: true, resultado: { totalApoios: 1 } });
    expect(repetida).toEqual({ processada: false, motivo: 'duplicada' });
    expect(execucoes).toBe(1);
    expect(await apoiosDa(pauta.id)).toHaveLength(1);
  });

  it('camada 2: o mesmo apoio em duas mensagens diferentes ainda dá um apoio só', async () => {
    const pauta = await criarPauta(db);
    const estudante = await criarEstudanteVerificado(db);
    const apoio = { pautaId: pauta.id, estudanteId: estudante.id, origem: 'bot' as const };

    // Chaves diferentes: a primeira camada deixa as duas passarem; quem segura é a PK de apoio.
    await processarUmaVez(db, 'hmac-camada2-a', (tx) => registrarApoio(tx, apoio));
    const segunda = await processarUmaVez(db, 'hmac-camada2-b', (tx) => registrarApoio(tx, apoio));

    expect(segunda).toEqual({
      processada: true,
      resultado: { registrado: false, motivo: 'ja_apoiou', totalApoios: 1 },
    });
    expect(await apoiosDa(pauta.id)).toHaveLength(1);
  });
});

// Concorrência precisa de duas conexões ao mesmo tempo, o que o PGlite não tem.
const URL_TESTE = process.env.DATABASE_URL_TESTE;
if (!URL_TESTE && process.env.CI) throw new Error('No CI, defina DATABASE_URL_TESTE.');

describe.skipIf(!URL_TESTE)('processarUmaVez com Postgres de verdade', () => {
  it('duas cópias simultâneas da mesma mensagem rodam a ação uma vez', async () => {
    const temporario = await criarBancoTemporario(URL_TESTE ?? '');
    // Com tratador de erro: apagar o banco temporário derruba as conexões (57P01), e uma conexão
    // sem tratador derruba a suíte.
    const pool = criarPool(
      temporario.url,
      { conexaoMs: 5000, consultaMs: 15_000 },
      () => undefined,
    );
    const real = criarDb(pool);
    try {
      // Abre as duas conexões antes da corrida: sem isso, uma chamada espera a conexão nascer
      // enquanto a outra já terminou, e as transações não se cruzam.
      await Promise.all([pool.query('select pg_sleep(0.05)'), pool.query('select pg_sleep(0.05)')]);
      let execucoes = 0;
      // A ação demora de propósito: a segunda cópia chega com a transação da primeira aberta.
      const acao = async (tx: Tx) => {
        execucoes++;
        await tx.execute(sql`select pg_sleep(0.2)`);
        return 'feito';
      };

      const resultados = await Promise.all([
        processarUmaVez(real, 'hmac-corrida', acao),
        processarUmaVez(real, 'hmac-corrida', acao),
      ]);

      expect(execucoes).toBe(1);
      expect(resultados.filter((r) => r.processada)).toEqual([
        { processada: true, resultado: 'feito' },
      ]);
      expect(resultados.filter((r) => !r.processada)).toEqual([
        { processada: false, motivo: 'duplicada' },
      ]);
      expect(await registradas('hmac-corrida', real)).toHaveLength(1);
    } finally {
      await pool.end();
      await temporario.apagar();
    }
  }, 30_000);
});
