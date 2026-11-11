import { apoios, type Db } from '@lumens/db';
import { criarBancoEmMemoria } from '@lumens/db/teste';
import { beforeAll, describe, expect, it } from 'vitest';
import { criarBloco, criarEstudanteVerificado, criarPauta } from './fabricas';
import { textoFalaBrDaPauta } from './texto-falabr-da-pauta';

let db: Db;

beforeAll(async () => {
  db = await criarBancoEmMemoria();
}, 30_000);

describe('textoFalaBrDaPauta (SCRUM-213)', () => {
  it('monta o texto com os campos da pauta, o nome do bloco e os apoios contados agora', async () => {
    const bloco = await criarBloco(db);
    const pauta = await criarPauta(db, {
      titulo: 'Bebedouro quebrado',
      descricao: 'O bebedouro do térreo está sem água há duas semanas.',
      categoria: 'Infraestrutura',
      blocoId: bloco.id,
      meta: 30,
    });
    for (let i = 0; i < 3; i++) {
      const e = await criarEstudanteVerificado(db);
      await db.insert(apoios).values({ pautaId: pauta.id, estudanteId: e.id, origem: 'bot' });
    }

    const resultado = await textoFalaBrDaPauta(db, pauta.id);

    expect(resultado?.texto).toContain('Assunto: Bebedouro quebrado');
    expect(resultado?.texto).toContain(`Local: ${bloco.nome}`);
    expect(resultado?.texto).toContain('sem água há duas semanas');
    expect(resultado?.texto).toContain(
      '3 estudantes que registraram apoio a ela, de uma meta de 30.',
    );
  });

  it('pauta sem bloco é do campus inteiro', async () => {
    const pauta = await criarPauta(db);

    expect((await textoFalaBrDaPauta(db, pauta.id))?.texto).toContain('Local: Campus inteiro');
  });

  it('pauta que não existe devolve undefined', async () => {
    expect(await textoFalaBrDaPauta(db, '00000000-0000-4000-8000-000000000000')).toBeUndefined();
  });
});
