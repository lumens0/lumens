import { caminhos, documentosResposta, eq, papeisPauta, type Db } from '@lumens/db';
import { criarBancoEmMemoria } from '@lumens/db/teste';
import { beforeAll, describe, expect, it } from 'vitest';
import { documentosDeResposta, registrarDocumentoDeResposta } from './documento-resposta';
import { criarEstudanteVerificado, criarPauta, tornarOwner } from '../teste/fabricas';

let db: Db;

beforeAll(async () => {
  db = await criarBancoEmMemoria();
}, 30_000);

let seq = 0;

/** Pauta com um owner e um caminho Fala.BR, protocolado ou não. */
async function cenario({ protocolo = 'OUV-1' }: { protocolo?: string | null } = {}) {
  const pauta = await criarPauta(db, { status: 'cobrando' });
  const owner = await criarEstudanteVerificado(db);
  await tornarOwner(db, pauta.id, owner.id);
  const [caminho] = await db
    .insert(caminhos)
    .values({ pautaId: pauta.id, tipo: 'falabr', status: 'aberto', protocolo, prazo: null })
    .returning();
  if (caminho === undefined) throw new Error('caminho não criado');
  return { pautaId: pauta.id, ownerId: owner.id, caminhoId: caminho.id };
}

const registrar = (caminhoId: string, estudanteId: string, quando = new Date()) =>
  db.transaction((tx) =>
    registrarDocumentoDeResposta(tx, {
      caminhoId,
      estudanteId,
      arquivoChave: `respostas/2026/11/${String(++seq)}.pdf`,
      agora: quando,
    }),
  );

describe('registrarDocumentoDeResposta (SCRUM-220)', () => {
  it('registra o PDF do owner no caminho Fala.BR protocolado', async () => {
    const { pautaId, ownerId, caminhoId } = await cenario();

    const r = await registrar(caminhoId, ownerId);

    expect(r).toMatchObject({ registrado: true });
    const [linha] = await db
      .select()
      .from(documentosResposta)
      .where(eq(documentosResposta.caminhoId, caminhoId));
    expect(linha).toMatchObject({ pautaId, enviadoPor: ownerId, promessaId: null });
  });

  it('caminho sem protocolo ainda não tem resposta para receber', async () => {
    const { ownerId, caminhoId } = await cenario({ protocolo: null });

    expect(await registrar(caminhoId, ownerId)).toEqual({
      registrado: false,
      motivo: 'caminho_sem_protocolo',
    });
  });

  it('quem não é owner ativo não registra', async () => {
    const { pautaId, ownerId, caminhoId } = await cenario();
    await db.update(papeisPauta).set({ ate: new Date() }).where(eq(papeisPauta.pautaId, pautaId));

    expect(await registrar(caminhoId, ownerId)).toEqual({
      registrado: false,
      motivo: 'nao_e_owner',
    });
  });

  it('caminho que não existe', async () => {
    const owner = await criarEstudanteVerificado(db);

    expect(await registrar('00000000-0000-4000-8000-000000000000', owner.id)).toEqual({
      registrado: false,
      motivo: 'caminho_inexistente',
    });
  });

  it('documentosDeResposta lista os da pauta, do mais novo para o mais antigo', async () => {
    const { pautaId, ownerId, caminhoId } = await cenario();
    await registrar(caminhoId, ownerId, new Date('2026-11-01T12:00:00Z'));
    await registrar(caminhoId, ownerId, new Date('2026-11-05T12:00:00Z'));

    const lista = await documentosDeResposta(db, pautaId);

    expect(lista.map((d) => d.recebidoEm)).toEqual([
      new Date('2026-11-05T12:00:00Z'),
      new Date('2026-11-01T12:00:00Z'),
    ]);
  });
});
