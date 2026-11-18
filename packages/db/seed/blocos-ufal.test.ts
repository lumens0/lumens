import { blocos } from '../src/index';
import { criarBancoEmMemoria } from '../src/teste';
import { describe, expect, it } from 'vitest';
import { blocosUfal, cadastrarBlocosUfal } from './blocos-ufal';

describe('catálogo dos blocos reais (SCRUM-292)', () => {
  it('slugs únicos e nenhum nome "(fictício)"', () => {
    expect(new Set(blocosUfal.map((b) => b.slug)).size).toBe(blocosUfal.length);
    expect(blocosUfal.some((b) => b.nome.includes('fictício'))).toBe(false);
  });

  it('cadastra uma vez só: rodar de novo não duplica nem muda nada', async () => {
    const db = await criarBancoEmMemoria();
    expect(await cadastrarBlocosUfal(db)).toBe(blocosUfal.length);
    expect(await cadastrarBlocosUfal(db)).toBe(0);
    expect((await db.select().from(blocos)).length).toBe(blocosUfal.length);
  });
});
