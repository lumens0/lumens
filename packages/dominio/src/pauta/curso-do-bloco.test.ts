import { apoios, blocoCursos, eq, estudantes, type Db } from '@lumens/db';
import { criarBancoEmMemoria } from '@lumens/db/teste';
import { beforeAll, describe, expect, it } from 'vitest';
import { criarBloco, criarEstudanteVerificado, criarPauta } from '../teste/fabricas';
import { registrarApoio } from './apoio';
import { cursoServeAoBloco } from './curso-do-bloco';
import { criarPauta as abrirPauta } from './pauta';

let db: Db;

beforeAll(async () => {
  db = await criarBancoEmMemoria();
});

/** Bloco de unidade: só estudante dos cursos dados apoia e abre pauta nele. */
async function blocoDosCursos(...cursos: string[]) {
  const bloco = await criarBloco(db, 600);
  await db.insert(blocoCursos).values(cursos.map((curso) => ({ blocoId: bloco.id, curso })));
  return bloco;
}

async function estudanteDe(curso: string | null) {
  const estudante = await criarEstudanteVerificado(db);
  await db.update(estudantes).set({ curso }).where(eq(estudantes.id, estudante.id));
  return estudante;
}

const apoiar = (pautaId: string, estudanteId: string) =>
  db.transaction((tx) => registrarApoio(tx, { pautaId, estudanteId, origem: 'bot' }));

describe('cursoServeAoBloco (SCRUM-399)', () => {
  it('campus inteiro e bloco sem cursos aceitam qualquer curso, até sem curso', async () => {
    const aberto = await criarBloco(db);
    expect(await cursoServeAoBloco(db, { blocoId: null, curso: 'História' })).toBe(true);
    expect(await cursoServeAoBloco(db, { blocoId: aberto.id, curso: 'História' })).toBe(true);
    expect(await cursoServeAoBloco(db, { blocoId: aberto.id, curso: null })).toBe(true);
  });

  it('bloco com cursos só aceita um deles; sem curso cadastrado não serve', async () => {
    const ichca = await blocoDosCursos('História', 'Filosofia');
    expect(await cursoServeAoBloco(db, { blocoId: ichca.id, curso: 'Filosofia' })).toBe(true);
    expect(
      await cursoServeAoBloco(db, { blocoId: ichca.id, curso: 'Engenharia de Computação' }),
    ).toBe(false);
    expect(await cursoServeAoBloco(db, { blocoId: ichca.id, curso: null })).toBe(false);
  });
});

describe('registrarApoio com o curso do bloco (SCRUM-399)', () => {
  it('aluno de Engenharia de Computação não apoia pauta do bloco do ICHCA, e nada é gravado', async () => {
    const ichca = await blocoDosCursos('História', 'Filosofia');
    const pauta = await criarPauta(db, { blocoId: ichca.id, meta: 30 });
    const deComputacao = await estudanteDe('Engenharia de Computação');

    const r = await apoiar(pauta.id, deComputacao.id);

    expect(r).toEqual({ registrado: false, motivo: 'fora_do_bloco' });
    expect(await db.select().from(apoios).where(eq(apoios.pautaId, pauta.id))).toHaveLength(0);
  });

  it('aluno de História apoia a pauta do ICHCA', async () => {
    const ichca = await blocoDosCursos('História', 'Filosofia');
    const pauta = await criarPauta(db, { blocoId: ichca.id, meta: 30 });
    const deHistoria = await estudanteDe('História');

    expect(await apoiar(pauta.id, deHistoria.id)).toMatchObject({
      registrado: true,
      totalApoios: 1,
    });
  });

  it('o apoio que já existia antes da trava continua valendo: volta ja_apoiou, não fora_do_bloco', async () => {
    const ichca = await blocoDosCursos('História');
    const pauta = await criarPauta(db, { blocoId: ichca.id, meta: 30 });
    const deComputacao = await estudanteDe('Engenharia de Computação');
    await db
      .insert(apoios)
      .values({ pautaId: pauta.id, estudanteId: deComputacao.id, origem: 'bot' });

    expect(await apoiar(pauta.id, deComputacao.id)).toEqual({
      registrado: false,
      motivo: 'ja_apoiou',
      totalApoios: 1,
    });
  });

  it('bloco aberto e campus inteiro continuam aceitando qualquer curso', async () => {
    const biblioteca = await criarBloco(db);
    const estudante = await estudanteDe('Engenharia de Computação');
    const noBloco = await criarPauta(db, { blocoId: biblioteca.id });
    const noCampus = await criarPauta(db);

    expect(await apoiar(noBloco.id, estudante.id)).toMatchObject({ registrado: true });
    expect(await apoiar(noCampus.id, estudante.id)).toMatchObject({ registrado: true });
  });

  it('estudante sem curso não apoia bloco com cursos', async () => {
    const ichca = await blocoDosCursos('História');
    const pauta = await criarPauta(db, { blocoId: ichca.id });
    const semCurso = await estudanteDe(null);

    expect(await apoiar(pauta.id, semCurso.id)).toEqual({
      registrado: false,
      motivo: 'fora_do_bloco',
    });
  });
});

describe('criarPauta com o curso do bloco (SCRUM-399)', () => {
  const abrir = (estudanteId: string, blocoId: string | null) =>
    db.transaction((tx) =>
      abrirPauta(tx, {
        estudanteId,
        titulo: 'Goteira na sala de aula',
        descricao: 'Chove dentro da sala.',
        blocoId,
      }),
    );

  it('quem não é dos cursos do bloco não abre pauta nele', async () => {
    const ichca = await blocoDosCursos('História');
    const deComputacao = await estudanteDe('Engenharia de Computação');

    expect(await abrir(deComputacao.id, ichca.id)).toEqual({
      criada: false,
      motivo: 'fora_do_bloco',
    });
  });

  it('quem é do curso abre; no campus inteiro qualquer curso abre', async () => {
    const ichca = await blocoDosCursos('História');
    const deHistoria = await estudanteDe('História');
    const deComputacao = await estudanteDe('Engenharia de Computação');

    expect(await abrir(deHistoria.id, ichca.id)).toMatchObject({ criada: true });
    expect(await abrir(deComputacao.id, null)).toMatchObject({ criada: true });
  });
});
