import { eq, eventos, fotosARemover, type Db } from '@lumens/db';
import { criarBancoEmMemoria } from '@lumens/db/teste';
import { beforeAll, describe, expect, it } from 'vitest';
import { criarCurador, criarPauta } from '../teste/fabricas';
import {
  O_QUE_FOI_FEITO_MAXIMO,
  conferirOQueFoiFeito,
  lerConquistaDaCuradoria,
  salvarConquistaDaCuradoria,
} from './conquista';

let db: Db;
let curadorId: string;

beforeAll(async () => {
  db = await criarBancoEmMemoria();
  curadorId = (await criarCurador(db)).id;
});

const salvar = (campos: Parameters<typeof salvarConquistaDaCuradoria>[1]) =>
  db.transaction((tx) => salvarConquistaDaCuradoria(tx, campos));

describe('conferirOQueFoiFeito', () => {
  it('junta espaços e quebras de linha, e vazio vira nulo', () => {
    expect(conferirOQueFoiFeito('  Trocaram \n as lâmpadas.  ')).toEqual({
      ok: true,
      texto: 'Trocaram as lâmpadas.',
    });
    expect(conferirOQueFoiFeito('   ')).toEqual({ ok: true, texto: null });
  });

  it('aceita 160 caracteres e recusa 161 (conta caracteres, não bytes)', () => {
    expect(conferirOQueFoiFeito('ã'.repeat(O_QUE_FOI_FEITO_MAXIMO)).ok).toBe(true);
    expect(conferirOQueFoiFeito('ã'.repeat(O_QUE_FOI_FEITO_MAXIMO + 1))).toEqual({
      ok: false,
      motivo: 'texto_longo',
    });
  });

  it('barra e-mail e telefone', () => {
    expect(conferirOQueFoiFeito('Falem com ana@ufal.br')).toEqual({
      ok: false,
      motivo: 'texto_com_dado_pessoal',
    });
    expect(conferirOQueFoiFeito('Ligue (82) 99999-1234')).toEqual({
      ok: false,
      motivo: 'texto_com_dado_pessoal',
    });
  });
});

describe('salvarConquistaDaCuradoria', () => {
  it('salva texto e foto numa pauta conquistada e registra o evento só da curadoria', async () => {
    const pauta = await criarPauta(db, { status: 'conquistada' });
    expect(
      await salvar({
        pautaId: pauta.id,
        curadorId,
        texto: 'Trocaram as lâmpadas.',
        fotoChave: 'fotos/2026/11/a1.jpg',
      }),
    ).toEqual({ salva: true, fotoSubstituida: null });

    expect(await lerConquistaDaCuradoria(db, pauta.id)).toMatchObject({
      texto: 'Trocaram as lâmpadas.',
      fotoChave: 'fotos/2026/11/a1.jpg',
    });
    expect(
      await db
        .select({
          tipo: eventos.tipo,
          dados: eventos.dados,
          publico: eventos.publico,
          origem: eventos.origem,
        })
        .from(eventos)
        .where(eq(eventos.pautaId, pauta.id)),
    ).toEqual([
      {
        tipo: 'conquista_atualizada',
        dados: { texto: true, foto: true },
        publico: false,
        origem: 'curadoria',
      },
    ]);
  });

  it('trocar a foto põe a antiga na fila de remoção; salvar só o texto mantém a foto', async () => {
    const pauta = await criarPauta(db, { status: 'conquistada' });
    await salvar({
      pautaId: pauta.id,
      curadorId,
      texto: 'a',
      fotoChave: 'fotos/2026/11/velha.jpg',
    });

    expect(await salvar({ pautaId: pauta.id, curadorId, texto: 'b' })).toEqual({
      salva: true,
      fotoSubstituida: null,
    });
    expect((await lerConquistaDaCuradoria(db, pauta.id))?.fotoChave).toBe(
      'fotos/2026/11/velha.jpg',
    );

    expect(
      await salvar({
        pautaId: pauta.id,
        curadorId,
        texto: 'b',
        fotoChave: 'fotos/2026/11/nova.jpg',
      }),
    ).toEqual({ salva: true, fotoSubstituida: 'fotos/2026/11/velha.jpg' });
    const fila = await db.select({ chave: fotosARemover.chave }).from(fotosARemover);
    expect(fila.map((f) => f.chave)).toContain('fotos/2026/11/velha.jpg');
    expect(fila.map((f) => f.chave)).not.toContain('fotos/2026/11/nova.jpg');
  });

  it('remover a foto a tira da conquista e a enfileira', async () => {
    const pauta = await criarPauta(db, { status: 'conquistada' });
    await salvar({ pautaId: pauta.id, curadorId, texto: 'a', fotoChave: 'fotos/2026/11/some.jpg' });
    expect(await salvar({ pautaId: pauta.id, curadorId, texto: 'a', removerFoto: true })).toEqual({
      salva: true,
      fotoSubstituida: 'fotos/2026/11/some.jpg',
    });
    expect((await lerConquistaDaCuradoria(db, pauta.id))?.fotoChave).toBeNull();
  });

  it('não deixa a conquista sem texto e sem foto', async () => {
    const pauta = await criarPauta(db, { status: 'conquistada' });
    expect(await salvar({ pautaId: pauta.id, curadorId, texto: '  ' })).toEqual({
      salva: false,
      motivo: 'sem_conteudo',
    });
    expect(await lerConquistaDaCuradoria(db, pauta.id)).toMatchObject({
      texto: null,
      fotoChave: null,
    });
  });

  it('só pauta conquistada aceita, e nada é gravado nas outras', async () => {
    const pauta = await criarPauta(db, { status: 'cobrando' });
    expect(await salvar({ pautaId: pauta.id, curadorId, texto: 'x' })).toEqual({
      salva: false,
      motivo: 'pauta_nao_conquistada',
    });
    expect(await lerConquistaDaCuradoria(db, pauta.id)).toMatchObject({
      texto: null,
      fotoChave: null,
    });
    expect(
      await salvar({ pautaId: '00000000-0000-4000-8000-000000000000', curadorId, texto: 'x' }),
    ).toEqual({ salva: false, motivo: 'pauta_inexistente' });
  });

  it('recusa chave de foto fora do padrão e texto com dado pessoal sem gravar nada', async () => {
    const pauta = await criarPauta(db, { status: 'conquistada' });
    expect(
      await salvar({ pautaId: pauta.id, curadorId, texto: 'x', fotoChave: '../segredo.jpg' }),
    ).toEqual({ salva: false, motivo: 'foto_invalida' });
    expect(await salvar({ pautaId: pauta.id, curadorId, texto: 'ana@ufal.br' })).toEqual({
      salva: false,
      motivo: 'texto_com_dado_pessoal',
    });
    expect(await lerConquistaDaCuradoria(db, pauta.id)).toMatchObject({
      texto: null,
      fotoChave: null,
    });
  });
});
