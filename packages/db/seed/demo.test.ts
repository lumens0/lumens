import { blocoCursos, blocos, curadores, pautas } from '../src/index';
import { criarBancoEmMemoria } from '../src/teste';
import { describe, expect, it } from 'vitest';
import { CURSOS_DOS_BLOCOS } from '../src/cursos-dos-blocos';
import { criarDados, zerarBanco } from './demo';

/** O demo é montado de novo antes de cada apresentação: zera o banco e recria os dados. */
describe('db:demo (SCRUM-399)', () => {
  it('zera um banco já com blocos e vínculos de cursos e recria tudo, duas vezes seguidas', async () => {
    const db = await criarBancoEmMemoria();
    await db
      .insert(curadores)
      .values({ emailHmac: 'h', emailCifrado: 'c', nome: 'Curador de teste' });

    // Primeira montagem: com `bloco_curso` populado, o TRUNCATE de `bloco` precisa levar a tabela
    // dele junto (a FK a impede de ficar de fora da lista de tabelas zeradas).
    await criarDados(db);
    expect((await db.select().from(blocoCursos)).length).toBeGreaterThan(0);

    await zerarBanco(db);
    expect(await db.select().from(blocoCursos)).toEqual([]);
    expect(await db.select().from(blocos)).toEqual([]);
    expect(await db.select().from(pautas)).toEqual([]);
    // O curador fica: o demo precisa de um ativo.
    expect(await db.select().from(curadores)).toHaveLength(1);

    // Segunda montagem: os vínculos voltam, iguais ao mapa de cursos por bloco.
    const resumo = await criarDados(db);
    expect(resumo.pautas).toBeGreaterThan(0);
    const vinculos = await db.select().from(blocoCursos);
    const esperados = Object.values(CURSOS_DOS_BLOCOS).flat().length;
    expect(vinculos).toHaveLength(esperados);
  }, 60_000);
});
