import { caminhos, disparos, eq, papeisPauta, type Db } from '@lumens/db';
import { criarBancoEmMemoria } from '@lumens/db/teste';
import { beforeAll, describe, expect, it } from 'vitest';
import { registrarEvento } from './eventos';
import { criarEstudanteVerificado, criarPauta, tornarOwner } from './fabricas';
import {
  enfileirarAvisosDeInatividade,
  enfileirarLembretesDePrazo,
  removerOwnersAvisados,
} from './lembretes';

let db: Db;

beforeAll(async () => {
  db = await criarBancoEmMemoria();
}, 30_000);

const DIA = 86_400_000;
/** Meio-dia de 10/11/2026 em Maceió. */
const AGORA = new Date('2026-11-10T15:00:00.000Z');
const diasAntes = (n: number) => new Date(AGORA.getTime() - n * DIA);

const avisosDa = (pautaOuCaminho: string) =>
  db
    .select()
    .from(disparos)
    .then((linhas) => linhas.filter((d) => d.aviso.includes(pautaOuCaminho)));

describe('lembrete do prazo do Fala.BR (3.8)', () => {
  /** Pauta cobrando, com um owner e o caminho do Fala.BR protocolado com o prazo dado. */
  async function cenario(prazo: string, status: 'cobrando' | 'prometido' = 'cobrando') {
    const pauta = await criarPauta(db, { status, titulo: 'Mais mesas no RU' });
    const owner = await criarEstudanteVerificado(db);
    await tornarOwner(db, pauta.id, owner.id);
    const [caminho] = await db
      .insert(caminhos)
      .values({ pautaId: pauta.id, tipo: 'falabr', status: 'aberto', protocolo: 'OUV-1', prazo })
      .returning();
    if (caminho === undefined) throw new Error('caminho não criado');
    return { pauta, owner, caminhoId: caminho.id };
  }

  const rodar = () => db.transaction((tx) => enfileirarLembretesDePrazo(tx, { agora: AGORA }));

  it('cinco dias antes, o owner recebe o lembrete com título, prazo e slug', async () => {
    const { pauta, owner, caminhoId } = await cenario('2026-11-15');

    await rodar();

    const [aviso] = await avisosDa(caminhoId);
    expect(aviso).toMatchObject({
      tipo: 'lembrete',
      estudanteId: owner.id,
      modelo: 'lumens_lembrete_prazo',
      parametros: ['Mais mesas no RU', '15/11/2026', pauta.slug],
    });
  });

  it.each([
    ['seis dias antes', '2026-11-16'],
    ['já vencido', '2026-11-09'],
  ])('não avisa %s', async (_caso, prazo) => {
    const { caminhoId } = await cenario(prazo);

    await rodar();

    expect(await avisosDa(caminhoId)).toHaveLength(0);
  });

  it('avisa no próprio dia do vencimento, se o agendador só chegou nele', async () => {
    const { caminhoId } = await cenario('2026-11-10');

    await rodar();

    expect(await avisosDa(caminhoId)).toHaveLength(1);
  });

  it('não avisa depois que chegou a resposta oficial', async () => {
    const { pauta, caminhoId } = await cenario('2026-11-13');
    await db.transaction((tx) =>
      registrarEvento(tx, {
        pautaId: pauta.id,
        tipo: 'resposta_oficial_recebida',
        dados: { caminho_id: caminhoId },
        origem: 'curadoria',
      }),
    );

    await rodar();

    expect(await avisosDa(caminhoId)).toHaveLength(0);
  });

  it('não avisa pauta que já saiu de cobrando', async () => {
    const { caminhoId } = await cenario('2026-11-13', 'prometido');

    await rodar();

    expect(await avisosDa(caminhoId)).toHaveLength(0);
  });

  it('rodar de novo não repete; prorrogado, o prazo novo rende outro lembrete', async () => {
    const { caminhoId } = await cenario('2026-11-12');
    await rodar();
    await rodar();
    expect(await avisosDa(caminhoId)).toHaveLength(1);

    await db.update(caminhos).set({ prazo: '2026-11-14' }).where(eq(caminhos.id, caminhoId));
    await rodar();

    expect((await avisosDa(caminhoId)).map((a) => a.aviso).sort()).toEqual([
      `prazo:${caminhoId}:2026-11-12`,
      `prazo:${caminhoId}:2026-11-14`,
    ]);
  });
});

describe('owner inativo (3.8)', () => {
  /** Pauta com um owner cuja última mensagem ao bot foi há `dias` dias. */
  async function ownerParado(dias: number, status: 'cobrando' | 'conquistada' = 'cobrando') {
    const pauta = await criarPauta(db, { status, titulo: 'Mais mesas no RU' });
    const owner = await criarEstudanteVerificado(db);
    await tornarOwner(db, pauta.id, owner.id);
    await db
      .update(papeisPauta)
      .set({ ultimaAtividadeEm: diasAntes(dias) })
      .where(eq(papeisPauta.pautaId, pauta.id));
    return { pautaId: pauta.id, ownerId: owner.id };
  }

  const avisar = (agora = AGORA) =>
    db.transaction((tx) => enfileirarAvisosDeInatividade(tx, { agora }));
  const remover = (agora = AGORA) => db.transaction((tx) => removerOwnersAvisados(tx, { agora }));

  /** Marca o aviso do owner como saído da fila em `quando` (o que o worker de envio faria). */
  const avisoSaiu = (
    pautaId: string,
    quando: Date,
    campo: 'enviadoEm' | 'falhouEm' = 'enviadoEm',
  ) =>
    db
      .select()
      .from(disparos)
      .then(async (linhas) => {
        const aviso = linhas.find((d) => d.aviso.startsWith(`inatividade:${pautaId}:`));
        if (aviso === undefined) throw new Error('sem aviso de inatividade');
        await db
          .update(disparos)
          .set({ [campo]: quando })
          .where(eq(disparos.id, aviso.id));
      });

  const ativo = async (pautaId: string) =>
    (await db.select().from(papeisPauta).where(eq(papeisPauta.pautaId, pautaId)))[0]?.ate === null;

  it('no dia 25 o owner recebe o aviso preventivo', async () => {
    const { pautaId, ownerId } = await ownerParado(25);

    await avisar();

    const [aviso] = await avisosDa(pautaId);
    expect(aviso).toMatchObject({
      tipo: 'lembrete',
      estudanteId: ownerId,
      modelo: 'lumens_owner_inativo',
      parametros: ['Mais mesas no RU', '16/10/2026'],
    });
  });

  it('no dia 24 ainda não', async () => {
    const { pautaId } = await ownerParado(24);

    await avisar();

    expect(await avisosDa(pautaId)).toHaveLength(0);
  });

  it('pauta conquistada não cobra atividade do owner', async () => {
    const { pautaId } = await ownerParado(28, 'conquistada');

    await avisar();

    expect(await avisosDa(pautaId)).toHaveLength(0);
  });

  it('no dia 30, sai quem foi avisado há pelo menos cinco dias', async () => {
    const { pautaId } = await ownerParado(30);
    await avisar(diasAntes(5));
    await avisoSaiu(pautaId, diasAntes(5));

    expect(await remover()).toBe(1);
    expect(await ativo(pautaId)).toBe(false);
  });

  it('passado o dia 30 sem aviso (agendador fora do ar), não sai: é avisado agora', async () => {
    const { pautaId } = await ownerParado(33);

    await avisar();
    expect(await remover()).toBe(0);
    expect(await ativo(pautaId)).toBe(true);
    expect(await avisosDa(pautaId)).toHaveLength(1);
  });

  it('avisado há menos de cinco dias, espera', async () => {
    const { pautaId } = await ownerParado(33);
    await avisar(diasAntes(2));
    await avisoSaiu(pautaId, diasAntes(2));

    expect(await remover()).toBe(0);
    expect(await ativo(pautaId)).toBe(true);
  });

  it('aviso que a fila ainda não mandou não conta', async () => {
    const { pautaId } = await ownerParado(36);
    await avisar(diasAntes(6));

    await remover();

    expect(await ativo(pautaId)).toBe(true);
  });

  it('aviso que falhou de vez conta: o número não recebe, e esperar não muda isso', async () => {
    const { pautaId } = await ownerParado(31);
    await avisar(diasAntes(6));
    await avisoSaiu(pautaId, diasAntes(6), 'falhouEm');

    expect(await remover()).toBe(1);
    expect(await ativo(pautaId)).toBe(false);
  });

  it('o owner que voltou e sumiu de novo recebe aviso do período novo', async () => {
    const { pautaId } = await ownerParado(26);
    await avisar();
    await db
      .update(papeisPauta)
      .set({ ultimaAtividadeEm: diasAntes(1) })
      .where(eq(papeisPauta.pautaId, pautaId));

    await avisar(new Date(AGORA.getTime() + 25 * DIA));

    expect(await avisosDa(pautaId)).toHaveLength(2);
  });
});
