import {
  and,
  apoios,
  curadores,
  eq,
  estudantes,
  pautas,
  promessas,
  respostasConferencia,
  type Db,
} from '@lumens/db';
import { criarBancoEmMemoria } from '@lumens/db/teste';
import { beforeEach, describe, expect, it } from 'vitest';
import { segredoCom } from '../../cripto/cifra';
import { renderizarAviso } from '../envio/aviso';
import {
  AVISO_SEM_RESPOSTA_TEXT,
  CONFERENCIA_REGISTRADA_TEXT,
  CONFERENCIA_TROCADA_TEXT,
  RECUSA_DA_CONFERENCIA_TEXT,
  entradaDeConferencia,
} from './conferencia';
import { MENU_INVALID_TEXT, MENU_TEXT } from './handlers';
import { hashPhone } from './phone';
import { handleIncoming } from './router';
import { ConversationStore } from './store';

const CHAVE = Buffer.alloc(32, 7);
const segredo = segredoCom(CHAVE);
const TITULO = 'Mais mesas no RU';
const DIA = 24 * 3_600_000;
const PROMESSA_QUALQUER = '0b9c1f9e-8d2e-4c39-9a51-2f6f3a1d7c10';

describe('entradaDeConferencia', () => {
  it('payload da conferência vale em qualquer passo, nas duas rodadas', () => {
    expect(entradaDeConferencia(`conferencia:${PROMESSA_QUALQUER}:0`, 'NEW_ASK_TITLE')).toEqual({
      tipo: 'botao',
      promessaId: PROMESSA_QUALQUER,
      resposta: 'sim',
    });
    expect(
      entradaDeConferencia(`conferencia:${PROMESSA_QUALQUER}:reaberta:1`, 'REPORT_ASK_TEXT'),
    ).toEqual({ tipo: 'botao', promessaId: PROMESSA_QUALQUER, resposta: 'em_parte' });
    expect(entradaDeConferencia(`conferencia:${PROMESSA_QUALQUER}:2`, 'MENU')).toMatchObject({
      resposta: 'nao',
    });
  });

  it('payload de outro aviso, ou estragado, é interceptado sem virar texto do passo', () => {
    for (const texto of [
      'lembrete:5e971e1a-0000-4000-8000-000000000001:0',
      `conferencia:${PROMESSA_QUALQUER}:7`,
      'conferencia:nao-e-uuid:0',
    ]) {
      expect(entradaDeConferencia(texto, 'NEW_ASK_TITLE')).toEqual({ tipo: 'outro_aviso' });
    }
  });

  it('digitada só sem pergunta em aberto, e número não conta', () => {
    expect(entradaDeConferencia('Em parte', 'MENU')).toEqual({
      tipo: 'digitada',
      resposta: 'em_parte',
    });
    expect(entradaDeConferencia('não', 'GREETING')).toEqual({ tipo: 'digitada', resposta: 'nao' });
    expect(entradaDeConferencia('sim', 'NEW_ASK_TITLE')).toBeNull();
    expect(entradaDeConferencia('1', 'MENU')).toBeNull();
    // Regressão (Codex na #154): o menu aceita o número com pontuação, e ele não pode virar voto.
    for (const opcao of ['1.', '2)', '3.', ' 3 ', '1!', '(1)', '#2']) {
      expect(entradaDeConferencia(opcao, 'MENU')).toBeNull();
    }
    expect(entradaDeConferencia('oi', 'MENU')).toBeNull();
    // Id de botão da conversa parecido com payload não é aviso.
    expect(entradaDeConferencia('caminho:falabr', 'OWNER_PATHS')).toBeNull();
  });
});

describe('resposta à conferência pela conversa (SCRUM-293)', () => {
  let db: Db;
  let store: ConversationStore;
  let seq = 0;

  beforeEach(async () => {
    db = await criarBancoEmMemoria();
    store = new ConversationStore(db);
  }, 30_000);

  /** Pauta com uma promessa em conferência; `apoiou` diz se a pessoa do telefone a apoia. */
  async function cenario(
    opcoes: {
      apoiou?: boolean;
      apoioEm?: Date;
      abreEm?: Date;
      fechaEm?: Date;
      resultado?: string;
    } = {},
  ) {
    const n = String(++seq);
    const agora = Date.now();
    const telefone = `55829999900${n.padStart(2, '0')}`;
    const phoneHmac = hashPhone(telefone, CHAVE);
    const [estudante] = await db
      .insert(estudantes)
      .values({ telefoneHmac: phoneHmac, telefoneCifrado: 'x', verificadoEm: new Date() })
      .returning({ id: estudantes.id });
    const [pauta] = await db
      .insert(pautas)
      .values({
        slug: `mais-mesas-${n}`,
        titulo: TITULO,
        descricao: 'Faltam mesas no almoço.',
        categoria: 'infraestrutura',
        status: 'prometido',
        meta: 120,
      })
      .returning({ id: pautas.id });
    const [curador] = await db
      .insert(curadores)
      .values({ emailHmac: `c-${n}`, emailCifrado: 'x', nome: 'Curadoria' })
      .returning({ id: curadores.id });
    if (!estudante || !pauta || !curador) throw new Error('cenário incompleto');
    if (opcoes.apoiou ?? true) {
      await db
        .insert(apoios)
        // Por padrão o apoio é de antes da abertura (que fica um dia atrás): só esses valem.
        .values({
          pautaId: pauta.id,
          estudanteId: estudante.id,
          origem: 'bot',
          criadoEm: opcoes.apoioEm ?? new Date(agora - 2 * DIA),
        });
    }
    const [promessa] = await db
      .insert(promessas)
      .values({
        pautaId: pauta.id,
        resumo: 'Instalar 20 mesas',
        dataEntrega: '2026-11-01',
        fonte: 'Ofício 1',
        registradaPor: curador.id,
        conferenciaAbreEm: opcoes.abreEm ?? new Date(agora - DIA),
        conferenciaFechaEm: opcoes.fechaEm ?? new Date(agora + 6 * DIA),
        resultado: opcoes.resultado ?? null,
      })
      .returning({ id: promessas.id });
    if (!promessa) throw new Error('promessa não criada');

    // Os botões saem do aviso de verdade, não de um payload escrito à mão.
    const aviso = renderizarAviso({
      tipo: 'conferencia',
      aviso: promessa.id,
      modelo: 'lumens_conferencia',
      parametros: [TITULO, '01/11/2026', 'Instalar 20 mesas', '07/11/2026'],
    });
    const botao = (texto: string) => {
      const b = aviso.botoes.find((x) => x.texto === texto);
      if (b?.tipo !== 'QUICK_REPLY') throw new Error(`sem botão ${texto}`);
      return b.payload;
    };
    const send = (text: string) => handleIncoming({ phoneHmac, text }, { store, db, segredo });
    const votos = () =>
      db
        .select({ resposta: respostasConferencia.resposta })
        .from(respostasConferencia)
        .where(
          and(
            eq(respostasConferencia.promessaId, promessa.id),
            eq(respostasConferencia.estudanteId, estudante.id),
          ),
        );
    return { phoneHmac, promessaId: promessa.id, botao, send, votos };
  }

  it('o toque no botão grava o voto e confirma, sem mexer no passo da conversa', async () => {
    const c = await cenario();
    await store.save(c.phoneHmac, 'NEW_ASK_TITLE', { title: 'rascunho' });

    expect(await c.send(c.botao('Sim'))).toEqual([CONFERENCIA_REGISTRADA_TEXT(TITULO, 'Sim')]);

    expect(await c.votos()).toEqual([{ resposta: 'sim' }]);
    // O payload não virou título da pauta nova: a conversa segue onde estava.
    expect(await store.get(c.phoneHmac)).toMatchObject({
      step: 'NEW_ASK_TITLE',
      data: { title: 'rascunho' },
    });
  });

  it('sem conversa guardada, quem tem cadastro não recebe o aviso de privacidade de novo (SCRUM-333); o segundo toque troca o voto', async () => {
    const c = await cenario();

    expect(await c.send(c.botao('Sim'))).toEqual([CONFERENCIA_REGISTRADA_TEXT(TITULO, 'Sim')]);
    expect(await c.send(c.botao('Em parte'))).toEqual([
      CONFERENCIA_TROCADA_TEXT(TITULO, 'Em parte'),
    ]);
    expect(await c.votos()).toEqual([{ resposta: 'em_parte' }]);
  });

  it('o botão da segunda rodada também grava', async () => {
    const c = await cenario();

    await c.send(`conferencia:${c.promessaId}:reaberta:2`);

    expect(await c.votos()).toEqual([{ resposta: 'nao' }]);
  });

  it('quem não apoiou recebe a recusa e nada é gravado', async () => {
    const c = await cenario({ apoiou: false });
    await store.save(c.phoneHmac, 'MENU', {});

    expect(await c.send(c.botao('Sim'))).toEqual([RECUSA_DA_CONFERENCIA_TEXT.nao_apoiou]);
    expect(await c.votos()).toEqual([]);
  });

  it('quem não tem cadastro verificado também recebe a recusa', async () => {
    const c = await cenario();
    await db.update(estudantes).set({ verificadoEm: null });

    // Já tem cadastro (a linha existe, só não está verificada): o aviso não vai de novo (SCRUM-333).
    expect(await c.send(c.botao('Sim'))).toEqual([RECUSA_DA_CONFERENCIA_TEXT.nao_apoiou]);
    // Sem cadastro, nenhuma conversa fica guardada com o HMAC do telefone (5.7).
    expect(await store.get(c.phoneHmac)).toBeNull();
  });

  it('depois do fim da conferência, a resposta é recusada com explicação', async () => {
    const vencida = await cenario({
      abreEm: new Date(Date.now() - 10 * DIA),
      fechaEm: new Date(Date.now() - 3 * DIA),
    });
    await store.save(vencida.phoneHmac, 'MENU', {});
    expect(await vencida.send(vencida.botao('Sim'))).toEqual([
      RECUSA_DA_CONFERENCIA_TEXT.conferencia_encerrada,
    ]);

    const apurada = await cenario({ resultado: 'conquistada' });
    await store.save(apurada.phoneHmac, 'MENU', {});
    expect(await apurada.send(apurada.botao('Não'))).toEqual([
      RECUSA_DA_CONFERENCIA_TEXT.conferencia_encerrada,
    ]);
    expect(await apurada.votos()).toEqual([]);
  });

  it('resposta digitada no menu vai para a conferência aberta', async () => {
    const c = await cenario();
    await store.save(c.phoneHmac, 'MENU', {});

    expect(await c.send('em parte')).toEqual([CONFERENCIA_REGISTRADA_TEXT(TITULO, 'Em parte')]);
    expect(await c.votos()).toEqual([{ resposta: 'em_parte' }]);
  });

  it('com a conferência aberta, "2)" no menu escolhe a opção 2 e não vota', async () => {
    const c = await cenario();
    await store.save(c.phoneHmac, 'MENU', {});

    const respostas = await c.send('2)');

    expect(await c.votos()).toEqual([]);
    expect(respostas).not.toContainEqual(expect.stringContaining('Anotei sua resposta'));
  });

  it('"sim" digitado por quem apoiou depois da abertura segue para a conversa', async () => {
    const c = await cenario({ apoioEm: new Date() });
    await store.save(c.phoneHmac, 'MENU', {});

    expect(await c.send('sim')).toEqual([MENU_INVALID_TEXT, MENU_TEXT]);
    expect(await c.votos()).toEqual([]);
  });

  it('"sim" digitado por quem não tem conferência aberta segue para a conversa', async () => {
    const c = await cenario({ apoiou: false });
    await store.save(c.phoneHmac, 'MENU', {});

    expect(await c.send('sim')).toEqual([MENU_INVALID_TEXT, MENU_TEXT]);
  });

  it('botão de outro aviso responde que ainda não dá e não mexe na conversa', async () => {
    const c = await cenario();
    await store.save(c.phoneHmac, 'NEW_ASK_TITLE', {});

    expect(await c.send(`lembrete:${c.promessaId}:0`)).toEqual([AVISO_SEM_RESPOSTA_TEXT]);
    expect((await store.get(c.phoneHmac))?.step).toBe('NEW_ASK_TITLE');
  });
});
