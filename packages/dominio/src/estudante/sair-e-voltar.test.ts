/**
 * SCRUM-331: sair e voltar com o mesmo e-mail não pode dar um segundo apoio, um segundo voluntário
 * nem uma segunda resposta à conferência na mesma pauta. A volta reativa a mesma linha de
 * `estudante`, pelo HMAC do e-mail que o `sair` guarda.
 */
import {
  apoios,
  curadores,
  eq,
  estudantes,
  promessas,
  propostas,
  respostasConferencia,
  voluntarios,
  type Db,
} from '@lumens/db';
import { criarBancoEmMemoria } from '@lumens/db/teste';
import { beforeAll, describe, expect, it } from 'vitest';
import { registrarVoluntario } from '../caminhos/proposta';
import { registrarRespostaConferencia } from '../conferencia/conferencia-registro';
import { registrarApoio } from '../pauta/apoio';
import { criarPauta } from '../teste/fabricas';
import { sairDoLumens } from './sair';
import { concluirVerificacao, vincularEmail } from './verificacao';

const ABRE = new Date('2026-11-01T12:00:00Z');
const DENTRO = new Date('2026-11-03T12:00:00Z');
const FECHA = new Date('2026-11-08T12:00:00Z');
const CURSO = 'Ciência da Computação';

let db: Db;
let seq = 0;

beforeAll(async () => {
  db = await criarBancoEmMemoria();
});

/** Verifica pelo caminho do bot: código certo (`vincularEmail`) e curso (`concluirVerificacao`). */
async function verificar(telefone: string, email: string): Promise<string> {
  const vinculo = await vincularEmail(db, {
    telefoneHmac: `tel-${telefone}`,
    telefoneCifrado: `cifrado-${telefone}`,
    emailHmac: `email-${email}`,
    emailCifrado: `cifrado-${email}`,
  });
  if (!vinculo.vinculado) throw new Error(`não vinculou: ${vinculo.motivo}`);
  const fim = await concluirVerificacao(db, { telefoneHmac: `tel-${telefone}`, curso: CURSO });
  if (!fim.verificado) throw new Error(`não verificou: ${fim.motivo}`);
  return fim.estudanteId;
}

const sair = (estudanteId: string) =>
  db.transaction((tx) => sairDoLumens(tx, { estudanteId, agora: new Date() }));

const apoiar = (pautaId: string, estudanteId: string) =>
  db.transaction((tx) => registrarApoio(tx, { pautaId, estudanteId, origem: 'bot' }));

async function totalDeApoios(pautaId: string): Promise<number> {
  const linhas = await db.select().from(apoios).where(eq(apoios.pautaId, pautaId));
  return linhas.length;
}

/** Uma pessoa, um e-mail; cada teste usa os seus. */
function pessoa() {
  const n = String(++seq);
  return { telefone: `a${n}`, outroTelefone: `b${n}`, email: `aluno${n}@ufal.br` };
}

describe('sair e voltar com o mesmo e-mail (SCRUM-331)', () => {
  it('apoiar, sair, voltar e apoiar a mesma pauta não muda o total', async () => {
    const p = pessoa();
    const pauta = await criarPauta(db);
    const primeira = await verificar(p.telefone, p.email);
    expect(await apoiar(pauta.id, primeira)).toMatchObject({ registrado: true });
    expect(await totalDeApoios(pauta.id)).toBe(1);

    await sair(primeira);
    const volta = await verificar(p.telefone, p.email);

    expect(volta).toBe(primeira);
    expect(await apoiar(pauta.id, volta)).toMatchObject({ registrado: false, motivo: 'ja_apoiou' });
    expect(await totalDeApoios(pauta.id)).toBe(1);
  });

  it('voltar por outro telefone (ou pelo Telegram) também reativa a mesma linha', async () => {
    const p = pessoa();
    const pauta = await criarPauta(db);
    const primeira = await verificar(p.telefone, p.email);
    await apoiar(pauta.id, primeira);
    await sair(primeira);

    const volta = await verificar(p.outroTelefone, p.email);

    expect(volta).toBe(primeira);
    await apoiar(pauta.id, volta);
    expect(await totalDeApoios(pauta.id)).toBe(1);
    const [linha] = await db.select().from(estudantes).where(eq(estudantes.id, volta));
    expect(linha).toMatchObject({
      telefoneHmac: `tel-${p.outroTelefone}`,
      emailCifrado: `cifrado-${p.email}`,
      saiuEm: null,
    });
  });

  it('voluntário: sair e voltar não entra duas vezes na mesma proposta', async () => {
    const p = pessoa();
    const pauta = await criarPauta(db, { status: 'cobrando' });
    const [proposta] = await db
      .insert(propostas)
      .values({ pautaId: pauta.id, descricao: 'Mutirão de limpeza', pessoasNecessarias: 10 })
      .returning({ id: propostas.id });
    if (!proposta) throw new Error('proposta não criada');
    const vou = (estudanteId: string) =>
      db.transaction((tx) => registrarVoluntario(tx, { propostaId: proposta.id, estudanteId }));

    const primeira = await verificar(p.telefone, p.email);
    expect(await vou(primeira)).toMatchObject({ registrado: true, jaEstava: false });
    await sair(primeira);
    const volta = await verificar(p.telefone, p.email);

    expect(await vou(volta)).toMatchObject({ registrado: true, jaEstava: true });
    const lista = await db
      .select()
      .from(voluntarios)
      .where(eq(voluntarios.propostaId, proposta.id));
    expect(lista).toHaveLength(1);
  });

  it('conferência: sair e voltar não dá uma segunda resposta na apuração', async () => {
    const p = pessoa();
    const pauta = await criarPauta(db, { status: 'prometido' });
    const [curador] = await db
      .insert(curadores)
      .values({
        emailHmac: `curador-${p.email}`,
        emailCifrado: `cifrado-curador-${p.email}`,
        nome: 'Curadoria',
      })
      .returning({ id: curadores.id });
    if (!curador) throw new Error('curador não criado');
    const [promessa] = await db
      .insert(promessas)
      .values({
        pautaId: pauta.id,
        resumo: 'Instalar 20 mesas até dezembro',
        dataEntrega: '2026-12-01',
        fonte: 'Ofício 123',
        registradaPor: curador.id,
        conferenciaAbreEm: ABRE,
        conferenciaFechaEm: FECHA,
      })
      .returning({ id: promessas.id });
    if (!promessa) throw new Error('promessa não criada');
    const responder = (estudanteId: string, resposta: 'sim' | 'nao') =>
      db.transaction((tx) =>
        registrarRespostaConferencia(tx, {
          promessaId: promessa.id,
          estudanteId,
          resposta,
          agora: DENTRO,
        }),
      );

    const primeira = await verificar(p.telefone, p.email);
    await db.insert(apoios).values({ pautaId: pauta.id, estudanteId: primeira, origem: 'bot' });
    expect(await responder(primeira, 'sim')).toMatchObject({ registrada: true });
    await sair(primeira);
    const volta = await verificar(p.telefone, p.email);

    // A mesma pessoa troca o voto, como antes de sair; não soma outro.
    expect(await responder(volta, 'nao')).toMatchObject({
      registrada: true,
      alterouResposta: true,
    });
    const respostas = await db
      .select()
      .from(respostasConferencia)
      .where(eq(respostasConferencia.promessaId, promessa.id));
    expect(respostas).toHaveLength(1);
  });

  it('voltar e sair antes de escolher o curso apaga o vínculo restaurado e guarda o HMAC', async () => {
    const p = pessoa();
    const primeira = await verificar(p.telefone, p.email);
    await sair(primeira);
    // Código certo, ainda sem curso: o telefone e o e-mail cifrado voltam e `saiu_em` continua.
    await vincularEmail(db, {
      telefoneHmac: `tel-${p.telefone}`,
      telefoneCifrado: `cifrado-${p.telefone}`,
      emailHmac: `email-${p.email}`,
      emailCifrado: `cifrado-${p.email}`,
    });

    expect(await sair(primeira)).toMatchObject({ saiu: true });

    const [linha] = await db.select().from(estudantes).where(eq(estudantes.id, primeira));
    expect(linha?.telefoneHmac).toMatch(/^saiu:/);
    expect(linha?.telefoneCifrado).toMatch(/^saiu:/);
    expect(linha?.emailCifrado).toBeNull();
    expect(linha?.emailHmac).toBe(`email-${p.email}`);
    // Sair de novo, já com a lápide, continua sendo `ja_saiu`.
    expect(await sair(primeira)).toEqual({ saiu: false, motivo: 'ja_saiu' });
    // E ainda dá para voltar pela mesma linha.
    expect(await verificar(p.telefone, p.email)).toBe(primeira);
  });
});
