import { caminhos, eq, estudantes, papeisPauta, pautas, type Db } from '@lumens/db';
import { criarBancoEmMemoria } from '@lumens/db/teste';
import { beforeEach, describe, expect, it } from 'vitest';
import { segredoCom } from '../../cripto';
import { MENU_INVALID_TEXT, MENU_TEXT } from './handlers';
import {
  ALL_OPEN_TEXT,
  DATA_LOST_TEXT,
  FALABR_TEXT_INTRO,
  INDEPENDENT_TEXT,
  removedText,
  suspectText,
  NEXT_STEP_TEXT,
  LOST_OWNER_TEXT,
  NOT_OWNER_TEXT,
  OPENED_TEXT,
  PAUTA_CLOSED_TEXT,
  PAUTA_NOT_FOUND_TEXT,
  PICK_PATH_AGAIN_TEXT,
  PICK_PAUTA_TEXT,
  alreadyOpenText,
} from './minhas-pautas';
import { hashPhone } from './phone';
import {
  LIMITES_DOS_BOTOES,
  botoes,
  textoDaResposta,
  type MensagemDeBotoes,
  type MensagemDeLista,
  type Resposta,
} from './resposta';
import { handleIncoming } from './router';
import { ConversationStore } from './store';

const CHAVE = Buffer.alloc(32, 7);
const H = hashPhone('5582999990000', CHAVE);
const segredo = segredoCom(CHAVE);

type Status = (typeof pautas.$inferInsert)['status'];

let db: Db;
let store: ConversationStore;

const send = (text: string) => handleIncoming({ phoneHmac: H, text }, { store, db, segredo });
const passo = async () => (await store.get(H))?.step;
const dados = async () => (await store.get(H))?.data ?? {};
const caminhosDe = (pautaId: string) =>
  db.select().from(caminhos).where(eq(caminhos.pautaId, pautaId));

function botoesEm(respostas: Resposta[]): MensagemDeBotoes {
  const achada = respostas.find(
    (r): r is MensagemDeBotoes => typeof r !== 'string' && r.tipo === 'botoes',
  );
  if (!achada) throw new Error(`nenhum botão em ${JSON.stringify(respostas)}`);
  return achada;
}

function listaEm(respostas: Resposta[]): MensagemDeLista {
  const achada = respostas.find(
    (r): r is MensagemDeLista => typeof r !== 'string' && r.tipo === 'lista',
  );
  if (!achada) throw new Error(`nenhuma lista em ${JSON.stringify(respostas)}`);
  return achada;
}

const idsDosBotoes = (respostas: Resposta[]) => botoesEm(respostas).botoes.map((b) => b.id);

async function verificar() {
  const [estudante] = await db
    .insert(estudantes)
    .values({ telefoneHmac: H, telefoneCifrado: 'x', verificadoEm: new Date() })
    .returning({ id: estudantes.id });
  if (!estudante) throw new Error('estudante não inserido');
  return estudante.id;
}

let contador = 0;
/** Pauta com o estudante como owner. */
async function pautaDe(
  estudanteId: string,
  titulo: string,
  { status = 'juntando_apoios', criadaEm = new Date() }: { status?: Status; criadaEm?: Date } = {},
) {
  contador += 1;
  const [pauta] = await db
    .insert(pautas)
    .values({
      slug: `pauta-${String(contador)}`,
      titulo,
      descricao: 'Descrição da pauta.',
      categoria: 'infraestrutura',
      status,
      meta: 30,
      criadaEm,
    })
    .returning({ id: pautas.id });
  if (!pauta) throw new Error('pauta não inserida');
  await db.insert(papeisPauta).values({ pautaId: pauta.id, estudanteId, papel: 'owner' });
  return pauta.id;
}

beforeEach(async () => {
  db = await criarBancoEmMemoria();
  store = new ConversationStore(db);
  await send('oi');
}, 60_000);

describe('menu: 4 Minhas pautas', () => {
  it('aparece no menu, e a resposta inválida cita as 4 opções', async () => {
    expect(MENU_TEXT).toContain('4 Minhas pautas');
    expect(await send('9')).toEqual([MENU_INVALID_TEXT, MENU_TEXT]);
  });

  it('quem não é verificado não tem pauta: avisa e fica no menu', async () => {
    expect(await send('4')).toEqual([NOT_OWNER_TEXT]);
    expect(await passo()).toBe('MENU');
  });

  it('pauta em curadoria ou recusada não aparece: ainda não aceita caminho', async () => {
    const eu = await verificar();
    await pautaDe(eu, 'Em curadoria', { status: 'em_curadoria' });
    await pautaDe(eu, 'Recusada', { status: 'recusada' });
    expect(await send('4')).toEqual([NOT_OWNER_TEXT]);
    expect(await passo()).toBe('MENU');
  });

  it('com uma pauta só, vai direto aos caminhos (também por "minhas pautas")', async () => {
    const eu = await verificar();
    const pautaId = await pautaDe(eu, 'Bebedouro do bloco 18');

    const r = await send('Minhas pautas');
    const mensagem = botoesEm(r);
    expect(mensagem.corpo).toContain('*Bebedouro do bloco 18*');
    expect(mensagem.corpo).toContain('• Fala.BR: não aberto');
    expect(mensagem.corpo).toContain('• Comunidade: não aberto');
    expect(mensagem.corpo).toContain(INDEPENDENT_TEXT);
    expect(idsDosBotoes(r)).toEqual(['caminho:falabr', 'caminho:comunidade', 'menu']);
    expect(await passo()).toBe('OWNER_PATHS');
    expect(await dados()).toMatchObject({ pautaId });
  });
});

describe('escolher a pauta', () => {
  it('com várias, mostra a lista (a mais nova primeiro) e aceita a linha, o número ou o título', async () => {
    const eu = await verificar();
    const antiga = await pautaDe(eu, 'Antiga', { criadaEm: new Date('2026-09-01T12:00:00Z') });
    const nova = await pautaDe(eu, 'Nova', { criadaEm: new Date('2026-10-01T12:00:00Z') });

    const lista = listaEm(await send('4'));
    expect(lista.corpo).toBe(PICK_PAUTA_TEXT);
    expect(lista.linhas.map((l) => l.id)).toEqual([`pauta:${nova}`, `pauta:${antiga}`]);
    expect(await passo()).toBe('OWNER_PICK_PAUTA');

    expect(botoesEm(await send(`pauta:${antiga}`)).corpo).toContain('*Antiga*');
    expect(await dados()).toMatchObject({ pautaId: antiga });

    await send('menu');
    await send('4');
    expect(botoesEm(await send('2')).corpo).toContain('*Antiga*');

    await send('menu');
    await send('4');
    expect(botoesEm(await send('nova')).corpo).toContain('*Nova*');
    expect(await dados()).toMatchObject({ pautaId: nova });
  });

  it('escolha que não está na lista repete a lista', async () => {
    const eu = await verificar();
    await pautaDe(eu, 'Uma');
    await pautaDe(eu, 'Outra');
    await send('4');

    const r = await send('7');
    expect(r[0]).toBe(PAUTA_NOT_FOUND_TEXT);
    expect(listaEm(r).linhas).toHaveLength(2);
    expect(await passo()).toBe('OWNER_PICK_PAUTA');
  });
});

describe('abrir os caminhos (RN07: um não bloqueia o outro)', () => {
  let eu: string;
  let pautaId: string;

  beforeEach(async () => {
    eu = await verificar();
    pautaId = await pautaDe(eu, 'Bebedouro do bloco 18');
    await send('4');
  });

  it('Fala.BR pelo botão: abre, não muda o status da pauta e a comunidade continua disponível', async () => {
    const r = await send('caminho:falabr');
    expect(r[0]).toBe(OPENED_TEXT.falabr);
    expect(botoesEm(r).corpo).toMatch(
      /• Fala\.BR: aberto em \d{2}\/\d{2}\/\d{4}, ainda sem protocolo/,
    );
    expect(idsDosBotoes(r)).toEqual(['caminho:comunidade', 'texto:falabr', 'menu']);
    expect(await passo()).toBe('OWNER_PATHS');

    const abertos = await caminhosDe(pautaId);
    expect(abertos.map((c) => c.tipo)).toEqual(['falabr']);
    const [pauta] = await db.select().from(pautas).where(eq(pautas.id, pautaId));
    // Quem leva a `cobrando` é o protocolo (RN08), não abrir o caminho.
    expect(pauta?.status).toBe('juntando_apoios');
  });

  it('abre os dois, em qualquer ordem; com os dois abertos, sobra o texto do Fala.BR', async () => {
    const primeiro = await send('comunidade');
    expect(primeiro[0]).toBe(OPENED_TEXT.comunidade);
    expect(idsDosBotoes(primeiro)).toEqual(['caminho:falabr', 'menu']);

    const segundo = await send('Abrir Fala.BR');
    expect(segundo[0]).toBe(OPENED_TEXT.falabr);
    expect(botoesEm(segundo).corpo).toContain(NEXT_STEP_TEXT);
    expect(idsDosBotoes(segundo)).toEqual(['texto:falabr', 'menu']);
    expect(await passo()).toBe('OWNER_PATHS');

    expect(
      (await caminhosDe(pautaId)).map((c) => c.tipo).sort((a, b) => a.localeCompare(b)),
    ).toEqual(['comunidade', 'falabr']);
  });

  it('aceita o nome digitado de vários jeitos', async () => {
    expect((await send('  fala br ')).at(0)).toBe(OPENED_TEXT.falabr);
  });

  it('toque repetido no botão não abre outro caminho do mesmo tipo', async () => {
    await send('caminho:falabr');
    const r = await send('caminho:falabr');
    expect(r[0]).toBe(alreadyOpenText('falabr'));
    expect(await caminhosDe(pautaId)).toHaveLength(1);
    expect(await passo()).toBe('OWNER_PATHS');
  });

  it('resposta que não é caminho mostra o estado de novo', async () => {
    const r = await send('talvez');
    expect(r[0]).toBe(PICK_PATH_AGAIN_TEXT);
    expect(idsDosBotoes(r)).toEqual(['caminho:falabr', 'caminho:comunidade', 'menu']);
    expect(await caminhosDe(pautaId)).toHaveLength(0);
  });

  it('o botão "Voltar ao menu" é o comando global', async () => {
    expect(await send('menu')).toEqual([MENU_TEXT]);
    expect(await passo()).toBe('MENU');
  });

  it('quem deixou de ser owner no meio do caminho não abre', async () => {
    await db.update(papeisPauta).set({ ate: new Date() }).where(eq(papeisPauta.pautaId, pautaId));
    const r = await send('caminho:falabr');
    expect(r).toEqual([LOST_OWNER_TEXT, MENU_TEXT]);
    expect(await caminhosDe(pautaId)).toHaveLength(0);
    expect(await passo()).toBe('MENU');
  });

  it('pauta que fechou no meio do caminho não abre', async () => {
    await db.update(pautas).set({ status: 'conquistada' }).where(eq(pautas.id, pautaId));
    expect(await send('caminho:comunidade')).toEqual([PAUTA_CLOSED_TEXT, MENU_TEXT]);
    expect(await caminhosDe(pautaId)).toHaveLength(0);
  });

  it('sem a pauta nos dados da conversa, pede para começar de novo', async () => {
    await store.save(H, 'OWNER_PATHS', {});
    expect(await send('caminho:falabr')).toEqual([DATA_LOST_TEXT, MENU_TEXT]);
  });
});

describe('texto do Fala.BR (3.4)', () => {
  let pautaId: string;

  beforeEach(async () => {
    const eu = await verificar();
    pautaId = await pautaDe(eu, 'Bebedouro do bloco 18');
    await send('4');
  });

  it('sai logo depois de abrir o Fala.BR: a explicação e, sozinho, o texto para copiar', async () => {
    const [aberto, explicacao, texto, estado] = await send('caminho:falabr');

    expect(aberto).toBe(OPENED_TEXT.falabr);
    expect(explicacao).toBe(FALABR_TEXT_INTRO);
    expect(texto).toEqual(expect.stringContaining('Assunto: Bebedouro do bloco 18'));
    expect(texto).toEqual(expect.stringContaining('Descrição da pauta.'));
    expect(typeof estado).not.toBe('string');
  });

  it('o botão manda o texto de novo e continua nos caminhos', async () => {
    await send('caminho:falabr');

    const [explicacao, texto] = await send('texto:falabr');

    expect(explicacao).toBe(FALABR_TEXT_INTRO);
    expect(texto).toEqual(expect.stringContaining('Assunto: Bebedouro do bloco 18'));
    expect(await passo()).toBe('OWNER_PATHS');
  });

  it('também atende ao pedido digitado', async () => {
    await send('caminho:falabr');

    expect((await send('Texto do Fala.BR'))[0]).toBe(FALABR_TEXT_INTRO);
  });

  it('dado pessoal na descrição sai do texto antes de chegar ao owner (RN08)', async () => {
    await db
      .update(pautas)
      .set({ descricao: 'Quem souber mais escreva para jgss@ic.ufal.br.' })
      .where(eq(pautas.id, pautaId));

    const r = await send('caminho:falabr');

    expect(r).toContain(removedText(1));
    const texto = r.find((m) => typeof m === 'string' && m.startsWith('Assunto:'));
    expect(texto).toEqual(expect.stringContaining('escreva para [removido]'));
    expect(texto).not.toEqual(expect.stringContaining('jgss@ic.ufal.br'));
  });

  it('possível nome de pessoa fica, com o aviso para conferir antes de colar', async () => {
    await db
      .update(pautas)
      .set({ descricao: 'A professora Marta confirmou o problema.' })
      .where(eq(pautas.id, pautaId));

    const r = await send('caminho:falabr');

    expect(r).toContain(suspectText(['professora Marta']));
    // O texto é sempre a última mensagem antes do estado, para copiar sozinho.
    const indiceDoTexto = r.findIndex((m) => typeof m === 'string' && m.startsWith('Assunto:'));
    expect(r.indexOf(suspectText(['professora Marta']))).toBeLessThan(indiceDoTexto);
  });

  it('sem Fala.BR aberto não há botão de texto', async () => {
    expect(idsDosBotoes(await send('talvez'))).not.toContain('texto:falabr');
    expect(await caminhosDe(pautaId)).toHaveLength(0);
  });
});

describe('estado dos caminhos', () => {
  it('mostra protocolo e prazo do Fala.BR já registrado, e só oferece o que falta', async () => {
    const eu = await verificar();
    const pautaId = await pautaDe(eu, 'Iluminação do estacionamento', { status: 'cobrando' });
    await db.insert(caminhos).values({
      pautaId,
      tipo: 'falabr',
      status: 'aberto',
      protocolo: '00106.000123/2026-11',
      prazo: '2026-12-01',
      abertoEm: new Date('2026-11-01T15:00:00Z'),
    });

    const r = await send('4');
    expect(botoesEm(r).corpo).toContain(
      '• Fala.BR: aberto em 01/11/2026, protocolo 00106.000123/2026-11, prazo 01/12/2026',
    );
    expect(idsDosBotoes(r)).toEqual(['caminho:comunidade', 'menu']);
  });

  it('com os dois abertos e o protocolo registrado, mostra o estado e fica no menu', async () => {
    const eu = await verificar();
    const pautaId = await pautaDe(eu, 'Wi-Fi da biblioteca', { status: 'cobrando' });
    await db.insert(caminhos).values([
      { pautaId, tipo: 'falabr', status: 'aberto', protocolo: 'OUV-1', prazo: '2026-12-01' },
      { pautaId, tipo: 'comunidade', status: 'aberto' },
    ]);

    const [estado, ...resto] = await send('4');
    expect(estado).toContain('• Comunidade: aberto em');
    expect(estado).toContain(ALL_OPEN_TEXT);
    expect(resto).toEqual([]);
    expect(await passo()).toBe('MENU');
  });
});

describe('botoes()', () => {
  it('corta o título em 20 caracteres e recusa mais de 3 botões', () => {
    const m = botoes({ corpo: 'Escolha', botoes: [{ id: 'a', titulo: 'x'.repeat(30) }] });
    expect(Array.from(m.botoes[0]?.titulo ?? '')).toHaveLength(LIMITES_DOS_BOTOES.titulo);
    const quatro = ['a', 'b', 'c', 'd'].map((id) => ({ id, titulo: id }));
    expect(() => botoes({ corpo: 'Escolha', botoes: quatro })).toThrow();
    expect(() => botoes({ corpo: 'Escolha', botoes: [] })).toThrow();
  });

  it('vira texto corrido com o título e o id de cada botão', () => {
    const m = botoes({
      corpo: 'Escolha',
      botoes: [{ id: 'caminho:falabr', titulo: 'Abrir Fala.BR' }],
    });
    expect(textoDaResposta(m)).toBe('Escolha\n[Abrir Fala.BR] (caminho:falabr)');
  });
});
