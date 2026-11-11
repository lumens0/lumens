import {
  caminhos,
  eq,
  estudantes,
  eventos,
  papeisPauta,
  pautas,
  propostas,
  voluntarios,
  type Db,
} from '@lumens/db';
import { criarBancoEmMemoria } from '@lumens/db/teste';
import { beforeEach, describe, expect, it } from 'vitest';
import { segredoCom } from '../../cripto';
import { MENU_INVALID_TEXT, MENU_TEXT } from './handlers';
import {
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
  PROPOSAL_ALREADY_OPEN_TEXT,
  alreadyOpenText,
} from './minhas-pautas';
import { hashPhone } from './phone';
import {
  ALREADY_DONE_TEXT,
  ALREADY_VOLUNTEER_TEXT,
  DONE_TEXT,
  NEED_VERIFY_TEXT,
  NO_PROPOSAL_TEXT,
  PEOPLE_ASK_TEXT,
  PEOPLE_INVALID_TEXT,
  PROPOSAL_ASK_TEXT,
  PROPOSAL_CLOSED_TEXT,
  PUBLISHED_TEXT,
  volunteerText,
} from './proposta';
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
    expect(listaEm(r).corpo).toMatch(
      /• Fala\.BR: aberto em \d{2}\/\d{2}\/\d{4}, ainda sem protocolo/,
    );
    // Quatro opções não cabem em botões (o limite é 3): viram lista.
    expect(listaEm(r).linhas.map((l) => l.id)).toEqual([
      'caminho:comunidade',
      'texto:falabr',
      'protocolo:falabr',
      'menu',
    ]);
    expect(await passo()).toBe('OWNER_PATHS');

    const abertos = await caminhosDe(pautaId);
    expect(abertos.map((c) => c.tipo)).toEqual(['falabr']);
    const [pauta] = await db.select().from(pautas).where(eq(pautas.id, pautaId));
    // Quem leva a `cobrando` é o protocolo (RN08), não abrir o caminho.
    expect(pauta?.status).toBe('juntando_apoios');
  });

  it('abre os dois, em qualquer ordem; com os dois abertos, sobram o Fala.BR e a proposta', async () => {
    const primeiro = await send('comunidade');
    expect(primeiro[0]).toBe(OPENED_TEXT.comunidade);
    expect(idsDosBotoes(primeiro)).toEqual(['caminho:falabr', 'proposta:nova', 'menu']);

    const segundo = await send('Abrir Fala.BR');
    expect(segundo[0]).toBe(OPENED_TEXT.falabr);
    // Texto, protocolo e proposta passam de 3 botões com o menu: viram lista.
    expect(listaEm(segundo).corpo).toContain(NEXT_STEP_TEXT);
    expect(listaEm(segundo).linhas.map((l) => l.id)).toEqual([
      'texto:falabr',
      'protocolo:falabr',
      'proposta:nova',
      'menu',
    ]);
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
    const indiceDoTexto = r.findIndex((m) => typeof m === 'string' && m.startsWith('Assunto:'));
    expect(r.indexOf(FALABR_TEXT_INTRO)).toBe(indiceDoTexto - 1);
    expect(r.indexOf(removedText(1))).toBeLessThan(r.indexOf(FALABR_TEXT_INTRO));
    const texto = r[indiceDoTexto];
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
    // Aviso, depois "copie a próxima mensagem" e, logo em seguida, o texto: quem segue a
    // instrução copia a manifestação, não o aviso.
    const indiceDoTexto = r.findIndex((m) => typeof m === 'string' && m.startsWith('Assunto:'));
    expect(r.indexOf(FALABR_TEXT_INTRO)).toBe(indiceDoTexto - 1);
    expect(r.indexOf(suspectText(['professora Marta']))).toBeLessThan(r.indexOf(FALABR_TEXT_INTRO));
  });

  it('todos os possíveis nomes entram no aviso, não só os primeiros', async () => {
    await db
      .update(pautas)
      .set({
        descricao:
          'A professora Marta e o professor Pedro, a diretora Joana e o reitor Paulo confirmaram.',
      })
      .where(eq(pautas.id, pautaId));

    const r = await send('caminho:falabr');

    const aviso = r.find((m) => typeof m === 'string' && m.startsWith('Confira antes de colar'));
    for (const nome of ['Marta', 'Pedro', 'Joana', 'Paulo']) {
      expect(aviso).toEqual(expect.stringContaining(nome));
    }
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
    expect(idsDosBotoes(r)).toEqual(['caminho:comunidade', 'resposta:falabr', 'menu']);
  });

  it('com os dois abertos, protocolo e proposta feita: sobram a resposta e outra proposta', async () => {
    const eu = await verificar();
    const pautaId = await pautaDe(eu, 'Wi-Fi da biblioteca', { status: 'cobrando' });
    await db.insert(caminhos).values([
      { pautaId, tipo: 'falabr', status: 'aberto', protocolo: 'OUV-1', prazo: '2026-12-01' },
      { pautaId, tipo: 'comunidade', status: 'aberto' },
    ]);

    await db
      .insert(propostas)
      .values({ pautaId, descricao: 'Mutirão', pessoasNecessarias: 3, status: 'executada' });

    const r = await send('4');
    expect(botoesEm(r).corpo).toContain('• Comunidade: aberto em');
    expect(botoesEm(r).corpo).toContain(NEXT_STEP_TEXT);
    // A proposta feita não aparece no estado: ela já está na linha do tempo como conquista.
    expect(botoesEm(r).corpo).not.toContain('Mutirão');
    expect(idsDosBotoes(r)).toEqual(['resposta:falabr', 'proposta:nova', 'menu']);
    expect(await passo()).toBe('OWNER_PATHS');
  });
});

describe('proposta da comunidade (3.5)', () => {
  let eu: string;
  let pautaId: string;
  const OUTRO = hashPhone('5582988880000', CHAVE);
  const sendOutro = (text: string) =>
    handleIncoming({ phoneHmac: OUTRO, text }, { store, db, segredo });
  const propostasDe = () => db.select().from(propostas).where(eq(propostas.pautaId, pautaId));

  async function publicar() {
    await send('4');
    await send('caminho:comunidade');
    expect(await send('proposta:nova')).toEqual([PROPOSAL_ASK_TEXT]);
    expect(await passo()).toBe('PROPOSAL_ASK_TEXT');
    expect(await send('Mutirão para pintar as faixas')).toEqual([PEOPLE_ASK_TEXT]);
    // O texto fica cifrado na conversa, como o resto do que a pessoa escreve.
    expect(JSON.stringify(await dados())).not.toContain('Mutirão');
    return send('2');
  }

  beforeEach(async () => {
    eu = await verificar();
    pautaId = await pautaDe(eu, 'Faixa de pedestre');
  });

  it('sem a comunidade aberta, não oferece proposta', async () => {
    expect(idsDosBotoes(await send('4'))).not.toContain('proposta:nova');
    expect((await send('proposta:nova'))[0]).toBe(PICK_PATH_AGAIN_TEXT);
    expect(await propostasDe()).toHaveLength(0);
  });

  it('o owner publica: volta aos caminhos com a proposta e o botão de marcar feita', async () => {
    const r = await publicar();

    expect(r[0]).toBe(PUBLISHED_TEXT);
    expect(botoesEm(r).corpo).toContain(
      '• Proposta: Mutirão para pintar as faixas (0 de 2 voluntários)',
    );
    const [publicada] = await propostasDe();
    expect(idsDosBotoes(r)).toEqual([
      'caminho:falabr',
      `proposta:feita:${publicada?.id ?? ''}`,
      'menu',
    ]);
    expect(await passo()).toBe('OWNER_PATHS');
    expect(await dados()).not.toHaveProperty('propostaCifrada');
    expect(await propostasDe()).toMatchObject([
      { descricao: 'Mutirão para pintar as faixas', pessoasNecessarias: 2, status: 'aberta' },
    ]);
  });

  it('quantidade fora de 1 a 50 pergunta de novo', async () => {
    await send('4');
    await send('caminho:comunidade');
    await send('proposta:nova');
    await send('Mutirão');
    expect(await send('muitas')).toEqual([PEOPLE_INVALID_TEXT]);
    expect(await send('0')).toEqual([PEOPLE_INVALID_TEXT]);
    expect(await send('51')).toEqual([PEOPLE_INVALID_TEXT]);
    expect(await passo()).toBe('PROPOSAL_ASK_PEOPLE');
  });

  it('"Vou ajudar" pelo link do site: quem é verificado entra na lista uma vez só', async () => {
    await publicar();
    await db
      .insert(estudantes)
      .values({ telefoneHmac: OUTRO, telefoneCifrado: 'y', verificadoEm: new Date() });

    const r = await sendOutro('ajudar pauta-' + String(contador));
    expect(r).toContain(
      volunteerText({
        descricao: 'Mutirão para pintar as faixas',
        pessoasNecessarias: 2,
        voluntarios: 1,
      }),
    );
    expect(r.at(-1)).toBe(MENU_TEXT);
    expect(await sendOutro('ajudar pauta-' + String(contador))).toEqual([
      ALREADY_VOLUNTEER_TEXT,
      MENU_TEXT,
    ]);
    expect(await db.select().from(voluntarios)).toHaveLength(1);
  });

  it('sem verificação, verifica antes e não grava nada ainda', async () => {
    await publicar();
    const r = await sendOutro('ajudar pauta-' + String(contador));
    expect(r).toContain(NEED_VERIFY_TEXT);
    expect((await store.get(OUTRO))?.step).toBe('VERIFY_ASK_EMAIL');
    expect((await store.get(OUTRO))?.data).toMatchObject({
      pendingCommand: { kind: 'ajudar', id: 'pauta-' + String(contador) },
    });
    expect(await db.select().from(voluntarios)).toHaveLength(0);
  });

  it('pauta sem proposta aberta avisa', async () => {
    expect(await send('ajudar ' + 'pauta-' + String(contador))).toEqual([
      NO_PROPOSAL_TEXT,
      MENU_TEXT,
    ]);
    expect(await send('ajudar nao-existe')).toEqual([NO_PROPOSAL_TEXT, MENU_TEXT]);
  });

  it('marcar feita vira conquista parcial: a pauta continua sendo cobrada (RN09)', async () => {
    await publicar();
    const r = await send('feita');

    expect(r[0]).toBe(DONE_TEXT);
    expect(idsDosBotoes(r)).toEqual(['caminho:falabr', 'proposta:nova', 'menu']);
    expect(await propostasDe()).toMatchObject([{ status: 'executada' }]);
    const [pauta] = await db.select().from(pautas).where(eq(pautas.id, pautaId));
    expect(pauta?.status).toBe('juntando_apoios');
    const tipos = (
      await db.select({ tipo: eventos.tipo }).from(eventos).where(eq(eventos.pautaId, pautaId))
    ).map((e) => e.tipo);
    expect(tipos).toEqual(['caminho_aberto', 'proposta_publicada', 'proposta_executada']);

    // Depois de feita, ninguém mais entra na lista dela.
    const [proposta] = await propostasDe();
    expect(await send(`ajudar ${proposta?.id ?? ''}`)).toEqual([PROPOSAL_CLOSED_TEXT, MENU_TEXT]);
  });

  /** Outro telefone, verificado e co-owner da mesma pauta. */
  async function coOwner() {
    const [outro] = await db
      .insert(estudantes)
      .values({ telefoneHmac: OUTRO, telefoneCifrado: 'y', verificadoEm: new Date() })
      .returning({ id: estudantes.id });
    if (!outro) throw new Error('estudante não inserido');
    await db.insert(papeisPauta).values({ pautaId, estudanteId: outro.id, papel: 'co_owner' });
    await sendOutro('oi');
  }

  it('dois responsáveis propondo ao mesmo tempo: só a primeira proposta entra', async () => {
    await coOwner();
    await send('4');
    await send('caminho:comunidade');
    await sendOutro('4');
    // Os dois começam antes de qualquer um publicar.
    expect(await send('proposta:nova')).toEqual([PROPOSAL_ASK_TEXT]);
    expect(await sendOutro('proposta:nova')).toEqual([PROPOSAL_ASK_TEXT]);
    await send('Mutirão para pintar as faixas');
    await sendOutro('Rifa para comprar tinta');
    expect((await send('2'))[0]).toBe(PUBLISHED_TEXT);

    const r = await sendOutro('3');
    expect(r[0]).toBe(PROPOSAL_ALREADY_OPEN_TEXT);
    expect((await store.get(OUTRO))?.step).toBe('OWNER_PATHS');
    expect((await store.get(OUTRO))?.data).not.toHaveProperty('propostaCifrada');
    expect(await propostasDe()).toMatchObject([{ descricao: 'Mutirão para pintar as faixas' }]);
  });

  it('botão "Proposta feita" antigo não marca a proposta publicada depois', async () => {
    await coOwner();
    const r = await publicar();
    const botaoAntigo = idsDosBotoes(r).find((id) => id.startsWith('proposta:feita:')) ?? '';

    // O co-owner marca a primeira como feita e publica outra.
    await sendOutro('4');
    expect((await sendOutro(botaoAntigo))[0]).toBe(DONE_TEXT);
    await sendOutro('proposta:nova');
    await sendOutro('Rifa para comprar tinta');
    expect((await sendOutro('3'))[0]).toBe(PUBLISHED_TEXT);

    // O owner toca no botão que recebeu antes: nada muda na proposta nova.
    expect((await send(botaoAntigo))[0]).toBe(ALREADY_DONE_TEXT);
    const segunda = (await propostasDe()).find((p) => p.descricao === 'Rifa para comprar tinta');
    expect(segunda?.status).toBe('aberta');
    const tipos = (
      await db.select({ tipo: eventos.tipo }).from(eventos).where(eq(eventos.pautaId, pautaId))
    ).map((e) => e.tipo);
    expect(tipos.filter((t) => t === 'proposta_executada')).toHaveLength(1);
  });

  it('botão com id de proposta de outra pauta não marca nada', async () => {
    await publicar();
    const outraPauta = await pautaDe(eu, 'Bebedouro');
    const [estranha] = await db
      .insert(propostas)
      .values({ pautaId: outraPauta, descricao: 'Outra', pessoasNecessarias: 1 })
      .returning({ id: propostas.id });

    expect((await send(`proposta:feita:${estranha?.id ?? ''}`))[0]).toBe(PICK_PATH_AGAIN_TEXT);
    expect((await send('proposta:feita:nao-e-uuid'))[0]).toBe(PICK_PATH_AGAIN_TEXT);
    const [nela] = await db.select().from(propostas).where(eq(propostas.pautaId, outraPauta));
    expect(nela?.status).toBe('aberta');
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
