import {
  apoios,
  eq,
  estudantes,
  eventos,
  papeisPauta,
  pautas,
  pedidosEdicao,
  type Db,
} from '@lumens/db';
import { criarBancoEmMemoria } from '@lumens/db/teste';
import { beforeEach, describe, expect, it } from 'vitest';
import { segredoCom } from '../../cripto/cifra';
import {
  EDIT_CLOSED_TEXT,
  EDIT_DONE_TEXT,
  EDIT_EMPTY_TEXT,
  EDIT_FIELD_AGAIN_TEXT,
  EDIT_NONE_TEXT,
  EDIT_PENDING_TEXT,
  EDIT_PERSONAL_TEXT,
  EDIT_REQUESTED_TEXT,
  EDIT_UNCHANGED_TEXT,
  editTooLongText,
} from './edicao';
import { MENU_PRINCIPAL } from './handlers';
import { hashPhone } from './phone';
import { handleIncoming } from './router';
import { ConversationStore } from './store';

const CHAVE = Buffer.alloc(32, 7);
const H = hashPhone('5582999990000', CHAVE);
const segredo = segredoCom(CHAVE);

let db: Db;
let store: ConversationStore;
const send = (text: string) => handleIncoming({ phoneHmac: H, text }, { store, db, segredo });
const passo = async () => (await store.get(H))?.step;

let contador = 0;
async function novoEstudante(telefoneHmac: string) {
  const [e] = await db
    .insert(estudantes)
    .values({ telefoneHmac, telefoneCifrado: 'x', verificadoEm: new Date() })
    .returning({ id: estudantes.id });
  if (!e) throw new Error('estudante não inserido');
  return e.id;
}

async function pautaDe(
  estudanteId: string,
  titulo: string,
  status: (typeof pautas.$inferInsert)['status'] = 'em_curadoria',
) {
  contador += 1;
  const [p] = await db
    .insert(pautas)
    .values({
      slug: `edicao-${String(contador)}`,
      titulo,
      descricao: 'Descrição original.',
      categoria: 'infraestrutura',
      status,
      meta: 30,
    })
    .returning({ id: pautas.id });
  if (!p) throw new Error('pauta não inserida');
  await db.insert(papeisPauta).values({ pautaId: p.id, estudanteId, papel: 'owner' });
  return p.id;
}

const doBanco = async (id: string) => (await db.select().from(pautas).where(eq(pautas.id, id)))[0];

beforeEach(async () => {
  db = await criarBancoEmMemoria();
  store = new ConversationStore(db);
  await send('oi');
}, 60_000);

describe('o menu entende o que a pessoa quer fazer, escrito do jeito dela', () => {
  it.each([
    // Sem cadastro verificado, a opção 2 também começa pela verificação do e-mail.
    ['quero criar uma nova pauta', 'VERIFY_ASK_EMAIL'],
    ['Quero abrir uma pauta', 'VERIFY_ASK_EMAIL'],
    ['quero relatar um problema', 'REPORT_ASK_TEXT'],
    ['tenho um problema no bloco 18', 'REPORT_ASK_TEXT'],
    ['quero verificar meu e-mail', 'VERIFY_ASK_EMAIL'],
    ['confirmar email', 'VERIFY_ASK_EMAIL'],
  ])('"%s" vai para o mesmo fluxo da opção', async (frase, passoEsperado) => {
    await send('menu');
    await send(frase);
    expect(await passo()).toBe(passoEsperado);
  });

  it.each([
    ['quero ver as minhas pautas', 'minhas pautas'],
    ['quero corrigir minha pauta', 'editar'],
    ['ver pautas abertas', 'pautas abertas'],
  ])('"%s" cai na opção certa (%s)', async (frase) => {
    await novoEstudante(H);
    await send('menu');
    const respostas = await send(frase);
    // Sem pauta nenhuma, as duas opções do dono respondem com o aviso delas, nunca "Não entendi".
    expect(JSON.stringify(respostas)).not.toContain('Não entendi');
  });

  it('frase negada, longa ou sem pedido claro continua sendo "Não entendi"', async () => {
    await send('menu');
    expect(JSON.stringify(await send('não tenho problema'))).toContain('Não entendi');
    expect(JSON.stringify(await send('nunca criei pauta'))).toContain('Não entendi');
    expect(JSON.stringify(await send('bom dia, tudo bem com vocês?'))).toContain('Não entendi');
    expect(await passo()).toBe('MENU');
  });
});

describe('menu: 6 Editar pauta', () => {
  it('está no menu principal e também vale pelo nome', async () => {
    expect(JSON.stringify(MENU_PRINCIPAL)).toContain('Editar pauta');
    await novoEstudante(H);
    expect(await send('editar pauta')).toEqual([EDIT_NONE_TEXT]);
    expect(await passo()).toBe('MENU');
  });

  it('pauta recusada não pode ser editada: explica e fica no menu', async () => {
    const id = await novoEstudante(H);
    await pautaDe(id, 'Recusada', 'recusada');
    expect(await send('6')).toEqual([EDIT_NONE_TEXT]);
  });

  describe('pauta já publicada: a edição vira um pedido para a curadoria', () => {
    it('o texto público não muda e o pedido guarda o antes e o depois', async () => {
      const id = await novoEstudante(H);
      const pautaId = await pautaDe(id, 'Já publicada', 'juntando_apoios');
      await send('6');
      expect(await passo()).toBe('OWNER_EDIT_FIELD');
      await send('título');
      expect(await send('Já publicada e corrigida')).toEqual([EDIT_REQUESTED_TEXT, MENU_PRINCIPAL]);

      expect((await doBanco(pautaId))?.titulo).toBe('Já publicada');
      expect(
        await db.select().from(pedidosEdicao).where(eq(pedidosEdicao.pautaId, pautaId)),
      ).toMatchObject([
        {
          campo: 'titulo',
          antes: 'Já publicada',
          depois: 'Já publicada e corrigida',
          status: 'pendente',
        },
      ]);
      // Nada na linha do tempo: o texto não mudou.
      expect(await db.select().from(eventos).where(eq(eventos.pautaId, pautaId))).toEqual([]);
    });

    it('com pedido pendente, outro do mesmo campo é recusado com explicação', async () => {
      const id = await novoEstudante(H);
      await pautaDe(id, 'Já publicada', 'juntando_apoios');
      await send('6');
      await send('descrição');
      await send('Primeira versão');
      await send('6');
      await send('descrição');
      expect(await send('Segunda versão')).toEqual([EDIT_PENDING_TEXT, MENU_PRINCIPAL]);
    });

    it('texto com e-mail ou telefone não vira pedido e a pessoa pode mandar de novo', async () => {
      const id = await novoEstudante(H);
      const pautaId = await pautaDe(id, 'Já publicada', 'juntando_apoios');
      await send('6');
      await send('descrição');
      expect(await send('Falem comigo: fulano@ufal.br')).toEqual([EDIT_PERSONAL_TEXT]);
      expect(await passo()).toBe('OWNER_EDIT_TEXT');
      expect(
        await db.select().from(pedidosEdicao).where(eq(pedidosEdicao.pautaId, pautaId)),
      ).toEqual([]);
      expect(await send('Sem o contato, só o problema')).toEqual([
        EDIT_REQUESTED_TEXT,
        MENU_PRINCIPAL,
      ]);
    });

    it('texto igual ao publicado não gera pedido', async () => {
      const id = await novoEstudante(H);
      const pautaId = await pautaDe(id, 'Já publicada', 'juntando_apoios');
      await send('6');
      await send('título');
      expect(await send('Já publicada')).toEqual([EDIT_UNCHANGED_TEXT, MENU_PRINCIPAL]);
      expect(
        await db.select().from(pedidosEdicao).where(eq(pedidosEdicao.pautaId, pautaId)),
      ).toEqual([]);
    });
  });

  it('corrige o título: o antes e o depois ficam na linha do tempo, só para a curadoria', async () => {
    const id = await novoEstudante(H);
    const pautaId = await pautaDe(id, 'Bebedouro quebrdo');
    await send('6');
    expect(await passo()).toBe('OWNER_EDIT_FIELD');
    await send('campo:titulo');
    expect(await passo()).toBe('OWNER_EDIT_TEXT');
    expect(await send('Bebedouro quebrado')).toEqual([EDIT_DONE_TEXT, MENU_PRINCIPAL]);
    expect((await doBanco(pautaId))?.titulo).toBe('Bebedouro quebrado');
    const [evento] = await db.select().from(eventos).where(eq(eventos.pautaId, pautaId));
    expect(evento).toMatchObject({
      tipo: 'pauta_editada',
      publico: false,
      dados: { campo: 'titulo', antes: 'Bebedouro quebrdo', depois: 'Bebedouro quebrado' },
    });
  });

  it('corrige a descrição pelo nome do campo', async () => {
    const id = await novoEstudante(H);
    const pautaId = await pautaDe(id, 'Pauta');
    await send('editar');
    await send('descrição');
    await send('Agora com mais detalhes: terceiro andar.');
    expect((await doBanco(pautaId))?.descricao).toBe('Agora com mais detalhes: terceiro andar.');
  });

  it('campo que não existe pergunta de novo; texto vazio ou longo também', async () => {
    const id = await novoEstudante(H);
    await pautaDe(id, 'Pauta');
    await send('6');
    expect((await send('banana'))[0]).toBe(EDIT_FIELD_AGAIN_TEXT);
    await send('título');
    expect(await send('   ')).toEqual([EDIT_EMPTY_TEXT]);
    expect(await send('x'.repeat(81))).toEqual([editTooLongText('titulo', 81)]);
    expect(await passo()).toBe('OWNER_EDIT_TEXT');
  });

  it('com mais de uma pauta, escolhe primeiro qual', async () => {
    const id = await novoEstudante(H);
    await pautaDe(id, 'Primeira');
    const segunda = await pautaDe(id, 'Segunda');
    await send('6');
    expect(await passo()).toBe('OWNER_EDIT_PICK');
    await send('Segunda');
    expect(await passo()).toBe('OWNER_EDIT_FIELD');
    await send('título');
    await send('Segunda corrigida');
    expect((await doBanco(segunda))?.titulo).toBe('Segunda corrigida');
  });

  it('se uma das duas pautas é decidida antes da escolha, o passo acompanha a que sobrou', async () => {
    const id = await novoEstudante(H);
    const primeira = await pautaDe(id, 'Primeira');
    const segunda = await pautaDe(id, 'Segunda');
    await send('6');
    expect(await passo()).toBe('OWNER_EDIT_PICK');
    // A curadoria recusa a "Segunda" enquanto a lista está na tela da pessoa.
    await db.update(pautas).set({ status: 'recusada' }).where(eq(pautas.id, segunda));
    await send('Segunda');
    // Sobrou uma pauta: vai direto aos botões dela, sem ficar repetindo "Não achei essa pauta".
    expect(await passo()).toBe('OWNER_EDIT_FIELD');
    await send('campo:titulo');
    expect(await passo()).toBe('OWNER_EDIT_TEXT');
    await send('Primeira corrigida');
    expect((await doBanco(primeira))?.titulo).toBe('Primeira corrigida');
  });

  it('se a curadoria aprovou entre uma mensagem e outra, o texto novo vira pedido e nada muda na hora', async () => {
    const id = await novoEstudante(H);
    const pautaId = await pautaDe(id, 'Pauta');
    await send('6');
    await send('título');
    await db.update(pautas).set({ status: 'juntando_apoios' }).where(eq(pautas.id, pautaId));
    expect(await send('Título novo')).toEqual([EDIT_REQUESTED_TEXT, MENU_PRINCIPAL]);
    expect((await doBanco(pautaId))?.titulo).toBe('Pauta');
  });

  it('se a curadoria recusou entre uma mensagem e outra, a edição é recusada e nada muda', async () => {
    const id = await novoEstudante(H);
    const pautaId = await pautaDe(id, 'Pauta');
    await send('6');
    await send('título');
    await db.update(pautas).set({ status: 'recusada' }).where(eq(pautas.id, pautaId));
    expect(await send('Título novo')).toEqual([EDIT_CLOSED_TEXT, MENU_PRINCIPAL]);
    expect((await doBanco(pautaId))?.titulo).toBe('Pauta');
  });

  it('apoio de outra pessoa trava a edição', async () => {
    const id = await novoEstudante(H);
    const pautaId = await pautaDe(id, 'Pauta');
    const outro = await novoEstudante(hashPhone('5582999991111', CHAVE));
    await send('6');
    await send('título');
    await db.insert(apoios).values({ pautaId, estudanteId: outro, origem: 'bot' });
    expect(await send('Outro título')).toEqual([EDIT_CLOSED_TEXT, MENU_PRINCIPAL]);
    expect((await doBanco(pautaId))?.titulo).toBe('Pauta');
  });

  it('"menu" em qualquer passo da edição desiste sem mudar nada', async () => {
    const id = await novoEstudante(H);
    const pautaId = await pautaDe(id, 'Pauta');
    await send('6');
    await send('título');
    expect(await send('voltar ao menu')).toEqual([MENU_PRINCIPAL]);
    expect((await doBanco(pautaId))?.titulo).toBe('Pauta');
  });
});
