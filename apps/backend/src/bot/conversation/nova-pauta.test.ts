import {
  apoios,
  blocos,
  conversas,
  eq,
  estudantes,
  papeisPauta,
  pautas,
  relatos,
  type Db,
} from '@lumens/db';
import { criarBancoEmMemoria } from '@lumens/db/teste';
import { beforeEach, describe, expect, it } from 'vitest';
import { segredoCom } from '../../cripto/cifra';
import type { ResultadoFoto, ServicoDeFotos } from '../../fotos/servico';
import { SUPPORT_VERIFY_FIRST_TEXT } from './apoio';
import { MENU_PRINCIPAL } from './handlers';
import {
  BLOCK_GONE_TEXT,
  CURADORIA_PRAZO_TEXT,
  DESCRIPTION_EMPTY_TEXT,
  DESCRIPTION_QUESTION_TEXT,
  FROM_REPORT_DESCRIPTION_TEXT,
  NEW_SIMILAR_LIST_TEXT,
  NO_PHOTO_TEXT,
  NOT_VERIFIED_AT_END_TEXT,
  PHOTO_ASK_TEXT,
  PHOTO_RECEIVED_TEXT,
  TITLE_EMPTY_TEXT,
  VERIFY_FIRST_TEXT,
  descriptionTooLongText,
  photoRefusedText,
  resumo,
  titleTooLongText,
} from './nova-pauta';
import { CATEGORY_NOT_FOUND_TEXT, CATEGORY_QUESTION_TEXT } from './categorias';
import { hashPhone } from './phone';
import {
  BLOCK_NOT_FOUND_TEXT,
  CAMPUS_ROW_ID,
  NEW_FROM_REPORT_TEXT,
  NEW_SUPPORT_FAILED_TEXT,
  OTHER_ROW_ID,
  PICK_AGAIN_TEXT,
} from './relato';
import type { MensagemDeLista, Resposta } from './resposta';
import { handleIncoming } from './router';
import { ConversationStore } from './store';
import { NEW_TITLE_TEXT } from './texto';

const CHAVE = Buffer.alloc(32, 7);
const H = hashPhone('5582999990000', CHAVE);
const segredo = segredoCom(CHAVE);
const DESCRICAO = 'O bebedouro do térreo não funciona há duas semanas.';

let db: Db;
let store: ConversationStore;
let bloco18: string;
let artes: string;

const send = (text: string) => handleIncoming({ phoneHmac: H, text }, { store, db, segredo });
/** Serviço de fotos falso: devolve o que o teste mandar (o real é testado em `fotos/`). */
let resultadoDaFoto: ResultadoFoto;
const fotosPedidas: { id: string; mimeType: string }[] = [];
const fotos: ServicoDeFotos = {
  guardarFoto: (midia) => {
    fotosPedidas.push(midia);
    return Promise.resolve(resultadoDaFoto);
  },
};
const sendFoto = (servico?: ServicoDeFotos) =>
  handleIncoming(
    { phoneHmac: H, text: '', image: { id: 'midia-1', mimeType: 'image/jpeg' } },
    { store, db, segredo, ...(servico ? { fotos: servico } : {}) },
  );
const passo = async () => (await store.get(H))?.step;
const dados = async () => (await store.get(H))?.data ?? {};
const todasAsPautas = () => db.select().from(pautas);

function listaEm(respostas: Resposta[]): MensagemDeLista {
  const achada = respostas.find((r): r is MensagemDeLista => typeof r !== 'string');
  if (!achada) throw new Error(`nenhuma lista em ${JSON.stringify(respostas)}`);
  return achada;
}

/** O texto da última pergunta com lista ou botões. */
function perguntaEm(respostas: Resposta[]): string {
  const achada = respostas.findLast((r) => typeof r !== 'string');
  if (achada === undefined || achada.tipo === 'imagem') {
    throw new Error(`nenhuma pergunta em ${JSON.stringify(respostas)}`);
  }
  return achada.corpo;
}

const SUGESTAO_INFRA = 'Parece ser Infraestrutura. Confirma?';

function resumoEm(respostas: Resposta[]): string {
  const achado = respostas.find(
    (r): r is string => typeof r === 'string' && r.startsWith('Pauta enviada'),
  );
  if (achado === undefined) throw new Error(`nenhum resumo em ${JSON.stringify(respostas)}`);
  return achado;
}

async function verificar() {
  const [estudante] = await db
    .insert(estudantes)
    .values({ telefoneHmac: H, telefoneCifrado: 'x', verificadoEm: new Date() })
    .returning({ id: estudantes.id });
  if (!estudante) throw new Error('estudante não inserido');
  return estudante.id;
}

// Banco em memória novo + mensagens iniciais: no Windows, com os testes em paralelo, passa de 20s.
beforeEach(async () => {
  db = await criarBancoEmMemoria();
  store = new ConversationStore(db);
  const [b18, art] = await db
    .insert(blocos)
    .values([
      { slug: 'bloco-18', nome: 'Bloco 18', baseEstudantes: 1200 },
      { slug: 'artes', nome: 'Bloco de Artes', baseEstudantes: 300 },
    ])
    .returning({ id: blocos.id });
  if (!b18 || !art) throw new Error('blocos não inseridos');
  bloco18 = b18.id;
  artes = art.id;
  resultadoDaFoto = { ok: true, chave: 'fotos/2026/11/abc.jpg' };
  fotosPedidas.length = 0;
  await send('oi');
}, 60_000);

describe('porta de entrada (verificação)', () => {
  it('quem não é verificado vai para a verificação, guardando o pedido de pauta nova', async () => {
    expect(await send('2')).toEqual([VERIFY_FIRST_TEXT]);
    expect(await passo()).toBe('VERIFY_ASK_EMAIL');
    expect(await dados()).toEqual({ pendingCommand: { kind: 'nova-pauta' } });
    expect(await todasAsPautas()).toEqual([]);
  });

  it('estudante que saiu (RN01) também vai para a verificação', async () => {
    const id = await verificar();
    await db.update(estudantes).set({ saiuEm: new Date() }).where(eq(estudantes.id, id));
    expect(await send('2')).toEqual([VERIFY_FIRST_TEXT]);
  });

  it('vindo do relato (2.5) sem verificação, o relato e o bloco ficam para depois', async () => {
    await send('1');
    await send('a porta do bloco 18 ta emperrada');
    expect(await send('sim')).toEqual([NEW_FROM_REPORT_TEXT, VERIFY_FIRST_TEXT]);
    expect(await passo()).toBe('VERIFY_ASK_EMAIL');
    const data = await dados();
    expect(data).toMatchObject({ blocoId: bloco18, pendingCommand: { kind: 'nova-pauta' } });
    expect(data).toHaveProperty('relatoCifrado');
    expect(data).not.toHaveProperty('parecidas');
  });
});

describe('pauta nova pelo menu', () => {
  let estudanteId: string;
  beforeEach(async () => {
    estudanteId = await verificar();
    expect(await send('2')).toEqual([NEW_TITLE_TEXT]);
  });

  it('título → bloco na lista → descrição → pular foto → pauta em curadoria e resumo', async () => {
    const pergunta = listaEm(await send('Bebedouro quebrado'));
    expect(pergunta.linhas.map((l) => l.id)).toEqual([
      `bloco:${bloco18}`,
      `bloco:${artes}`,
      CAMPUS_ROW_ID,
    ]);
    expect(await passo()).toBe('NEW_ASK_PLACE');

    expect(perguntaEm(await send(`bloco:${bloco18}`))).toBe(SUGESTAO_INFRA);
    expect(await passo()).toBe('NEW_CONFIRM_CATEGORY');
    expect(await send('categoria:confirmar')).toEqual([DESCRIPTION_QUESTION_TEXT]);
    expect(await send(DESCRICAO)).toEqual([PHOTO_ASK_TEXT]);

    const respostas = await send('pular');
    expect(respostas[0]).toBe(NO_PHOTO_TEXT);
    expect(respostas.at(-1)).toBe(MENU_PRINCIPAL);
    const texto = resumoEm(respostas);
    expect(texto).toContain('*Título:* Bebedouro quebrado');
    expect(texto).toContain('*Local:* Bloco 18');
    expect(texto).toContain('*Meta:* 120 apoios');
    expect(texto).toContain('*Foto:* não');
    expect(texto).toContain(CURADORIA_PRAZO_TEXT);

    const [pauta] = await todasAsPautas();
    expect(pauta).toMatchObject({
      titulo: 'Bebedouro quebrado',
      descricao: DESCRICAO,
      blocoId: bloco18,
      status: 'em_curadoria',
      meta: 120,
    });
    if (!pauta) throw new Error('pauta não criada');
    expect(
      await db.select().from(papeisPauta).where(eq(papeisPauta.pautaId, pauta.id)),
    ).toMatchObject([{ estudanteId, papel: 'owner' }]);
    expect(await db.select().from(relatos).where(eq(relatos.pautaId, pauta.id))).toMatchObject([
      { estudanteId, texto: DESCRICAO, moderacao: 'pendente' },
    ]);

    expect(await passo()).toBe('MENU');
    expect(await dados()).toEqual({});
  });

  it('com foto, guarda a chave no primeiro relato e o resumo diz que tem foto', async () => {
    for (const t of ['Bebedouro', 'não sei', 'categoria:outra', DESCRICAO]) await send(t);
    const respostas = await sendFoto(fotos);
    expect(fotosPedidas).toEqual([{ id: 'midia-1', mimeType: 'image/jpeg' }]);
    expect(respostas[0]).toBe(PHOTO_RECEIVED_TEXT);
    expect(resumoEm(respostas)).toContain('*Foto:* sim');
    const [pauta] = await todasAsPautas();
    if (!pauta) throw new Error('pauta não criada');
    expect(await db.select().from(relatos).where(eq(relatos.pautaId, pauta.id))).toMatchObject([
      { fotoChave: 'fotos/2026/11/abc.jpg' },
    ]);
  });

  it.each(['formato', 'tamanho', 'invalida', 'indisponivel', 'armazenamento'] as const)(
    'foto recusada (%s): avisa, continua no passo da foto e não cria pauta',
    async (motivo) => {
      for (const t of ['Bebedouro', 'não sei', 'categoria:outra', DESCRICAO]) await send(t);
      resultadoDaFoto = { ok: false, motivo };
      expect(await sendFoto(fotos)).toEqual([photoRefusedText(motivo)]);
      expect(await passo()).toBe('NEW_ASK_PHOTO');
      expect(await todasAsPautas()).toEqual([]);

      // Ainda dá para pular e criar a pauta sem foto.
      expect(resumoEm(await send('pular'))).toContain('*Foto:* não');
    },
  );

  it('storage fora do ar: o texto não culpa o download nem pede outra foto', () => {
    const texto = photoRefusedText('armazenamento');
    expect(texto).not.toMatch(/baixar|download/i);
    expect(texto).not.toMatch(/outra foto/i);
    expect(texto).toContain('*pular*');
  });

  it('sem serviço de fotos configurado, a foto é recusada como indisponível', async () => {
    for (const t of ['Bebedouro', 'não sei', 'categoria:outra', DESCRICAO]) await send(t);
    expect(await sendFoto()).toEqual([photoRefusedText('indisponivel')]);
  });

  it('"não sei" é o campus inteiro, com a meta máxima', async () => {
    for (const t of ['Fila do RU', 'não sei', 'categoria:outra', 'Fila gigante no almoço.'])
      await send(t);
    const texto = resumoEm(await send('pular'));
    expect(texto).toContain('*Local:* Todo o campus');
    expect(texto).toContain('*Meta:* 300 apoios');
    expect((await todasAsPautas())[0]?.blocoId).toBeNull();
  });

  it('título em branco ou com mais de 80 caracteres pergunta de novo', async () => {
    expect(await send('   ')).toEqual([TITLE_EMPTY_TEXT]);
    expect(await send('x'.repeat(81))).toEqual([titleTooLongText(81)]);
    expect(await passo()).toBe('NEW_ASK_TITLE');
    listaEm(await send('x'.repeat(80)));
    expect(await passo()).toBe('NEW_ASK_PLACE');
  });

  it('aceita o bloco digitado e repete a lista quando não acha', async () => {
    await send('Iluminação');
    const respostas = await send('bloco 99');
    expect(respostas[0]).toBe(BLOCK_NOT_FOUND_TEXT);
    listaEm(respostas);
    expect(await passo()).toBe('NEW_ASK_PLACE');
    expect(listaEm(await send('artes')).corpo).toBe(CATEGORY_QUESTION_TEXT);
    expect(await dados()).toMatchObject({ blocoId: artes });
  });

  it('descrição em branco ou longa demais pergunta de novo', async () => {
    for (const t of ['Bebedouro', 'não sei', 'categoria:outra']) await send(t);
    expect(await send(' ')).toEqual([DESCRIPTION_EMPTY_TEXT]);
    expect(await send('x'.repeat(2001))).toEqual([descriptionTooLongText(2001)]);
    expect(await passo()).toBe('NEW_ASK_DESCRIPTION');
  });

  it('no passo da foto, texto qualquer pede a foto de novo', async () => {
    for (const t of ['Bebedouro', 'não sei', 'categoria:outra', DESCRICAO]) await send(t);
    expect(await send('já mandei')).toEqual([PHOTO_ASK_TEXT]);
    expect(await passo()).toBe('NEW_ASK_PHOTO');
  });

  it('título e descrição ficam cifrados na conversa, nunca em claro', async () => {
    for (const t of ['Título secreto da pauta', 'não sei', 'categoria:outra', 'Descrição secreta'])
      await send(t);
    const linhas = JSON.stringify(await db.select().from(conversas));
    expect(linhas).not.toContain('Título secreto');
    expect(linhas).not.toContain('Descrição secreta');
  });

  it('estudante que deixa de ser verificado no meio não cria pauta', async () => {
    for (const t of ['Bebedouro', 'não sei', 'categoria:outra', DESCRICAO]) await send(t);
    await db.update(estudantes).set({ saiuEm: new Date() }).where(eq(estudantes.id, estudanteId));
    expect(await send('pular')).toEqual([NOT_VERIFIED_AT_END_TEXT, MENU_PRINCIPAL]);
    expect(await todasAsPautas()).toEqual([]);
    expect(await dados()).toEqual({});
  });

  it('bloco apagado no meio da conversa não cria pauta', async () => {
    const [extra] = await db
      .insert(blocos)
      .values({ slug: 'extra', nome: 'Bloco Extra', baseEstudantes: 100 })
      .returning({ id: blocos.id });
    if (!extra) throw new Error('bloco não inserido');
    for (const t of ['Bebedouro', `bloco:${extra.id}`, 'categoria:outra', DESCRICAO]) await send(t);
    await db.delete(blocos).where(eq(blocos.id, extra.id));
    expect(await send('pular')).toEqual([BLOCK_GONE_TEXT, MENU_PRINCIPAL]);
    expect(await todasAsPautas()).toEqual([]);
  });

  it("'cancelar' no meio não cria pauta e limpa as respostas", async () => {
    for (const t of ['Bebedouro', 'não sei', 'categoria:outra']) await send(t);
    await send('cancelar');
    expect(await dados()).toEqual({});
    expect(await todasAsPautas()).toEqual([]);
  });
});

/** Pauta aberta no Bloco 18, parecida com qualquer relato ou título sobre bebedouro. */
async function abrirPautaDeBebedouros(): Promise<string> {
  const [pauta] = await db
    .insert(pautas)
    .values({
      slug: 'bebedouros',
      titulo: 'Bebedouros funcionando no Bloco 18',
      descricao: 'Consertar os bebedouros existentes do bloco.',
      blocoId: bloco18,
      categoria: 'infraestrutura',
      status: 'juntando_apoios',
      meta: 30,
    })
    .returning({ id: pautas.id });
  if (!pauta) throw new Error('pauta não inserida');
  return pauta.id;
}

describe('pauta nova pelo menu com pauta parecida já aberta (SCRUM-346)', () => {
  const TITULO = 'Bebedouro quebrado no corredor';
  let aberta: string;
  let estudanteId: string;

  beforeEach(async () => {
    estudanteId = await verificar();
    aberta = await abrirPautaDeBebedouros();
    await send('2');
    await send(TITULO);
  });

  it('depois do bloco, oferece apoiar a parecida antes de pedir a descrição', async () => {
    const lista = listaEm(await send(`bloco:${bloco18}`));
    expect(lista.corpo).toBe(NEW_SIMILAR_LIST_TEXT);
    expect(lista.linhas.map((l) => l.id)).toEqual([`pauta:${aberta}`, OTHER_ROW_ID]);
    expect(await passo()).toBe('NEW_PICK_SIMILAR');
  });

  it('"É outro problema" segue o fluxo normal e cria a pauta com o título e o bloco', async () => {
    await send(`bloco:${bloco18}`);
    expect(perguntaEm(await send(OTHER_ROW_ID))).toBe(SUGESTAO_INFRA);
    expect(await send('categoria:seguranca')).toEqual([DESCRIPTION_QUESTION_TEXT]);
    await send(DESCRICAO);
    expect(resumoEm(await send('pular'))).toContain(`*Título:* ${TITULO}`);

    const criada = (await todasAsPautas()).find((p) => p.id !== aberta);
    expect(criada).toMatchObject({ titulo: TITULO, blocoId: bloco18, status: 'em_curadoria' });
    expect(await dados()).toEqual({});
  });

  it('"É essa" apoia a pauta aberta, não cria outra e tira o título da conversa', async () => {
    await send(`bloco:${bloco18}`);
    const respostas = await send(`pauta:${aberta}`);
    expect(respostas[0]).toContain('Apoio registrado');
    expect(await passo()).toBe('SUPPORT_ASK_REPORT');
    expect(await db.select().from(apoios).where(eq(apoios.pautaId, aberta))).toHaveLength(1);
    expect(await todasAsPautas()).toHaveLength(1);

    const restantes = await dados();
    expect(restantes).toMatchObject({ apoioPautaId: aberta });
    for (const chave of ['tituloCifrado', 'blocoId', 'parecidas']) {
      expect(restantes).not.toHaveProperty(chave);
    }
  });

  it('se a pauta escolhida fechou no meio, avisa e segue a pauta nova sem perder o título', async () => {
    await send(`bloco:${bloco18}`);
    await db.update(pautas).set({ status: 'recusada' }).where(eq(pautas.id, aberta));

    expect(await send(`pauta:${aberta}`)).toEqual([
      NEW_SUPPORT_FAILED_TEXT,
      expect.objectContaining({ tipo: 'botoes', corpo: SUGESTAO_INFRA }),
    ]);
    await send('categoria:outra');
    await send(DESCRICAO);
    expect(resumoEm(await send('pular'))).toContain(`*Título:* ${TITULO}`);
    expect(await db.select().from(apoios)).toEqual([]);
  });

  it('no canal só de texto, aceita o número da pauta e "É outro problema" escrito', async () => {
    await send(`bloco:${bloco18}`);
    expect(perguntaEm(await send('É outro problema'))).toBe(SUGESTAO_INFRA);

    await send('cancelar');
    await send('2');
    await send(TITULO);
    await send(`bloco:${bloco18}`);
    expect((await send('1'))[0]).toContain('Apoio registrado');
    expect(await db.select().from(apoios).where(eq(apoios.pautaId, aberta))).toHaveLength(1);
  });

  it('cadastro que perdeu a verificação no meio vai verificar, guardando o apoio, sem pauta nova', async () => {
    await send(`bloco:${bloco18}`);
    await db.update(estudantes).set({ saiuEm: new Date() }).where(eq(estudantes.id, estudanteId));

    expect(await send(`pauta:${aberta}`)).toEqual([SUPPORT_VERIFY_FIRST_TEXT]);
    expect(await passo()).toBe('VERIFY_ASK_EMAIL');
    const restantes = await dados();
    expect(restantes).toMatchObject({ pendingCommand: { kind: 'apoiar', id: aberta } });
    expect(restantes).not.toHaveProperty('tituloCifrado');
    expect(await todasAsPautas()).toHaveLength(1);
  });

  it('resposta fora da lista pergunta de novo, com a mesma lista', async () => {
    await send(`bloco:${bloco18}`);
    const respostas = await send('talvez');
    expect(respostas[0]).toBe(PICK_AGAIN_TEXT);
    expect(listaEm(respostas).linhas.map((l) => l.id)).toEqual([`pauta:${aberta}`, OTHER_ROW_ID]);
    expect(await passo()).toBe('NEW_PICK_SIMILAR');
  });
});

describe('pauta nova vinda do relato (2.5)', () => {
  const RELATO = 'o bebedouro do bloco 18 ta quebrado, sala 12';

  beforeEach(async () => {
    await verificar();
    await send('1');
  });

  it('pula local e descrição: o relato vira a descrição e o primeiro relato', async () => {
    await send(RELATO);
    expect(await send(OTHER_ROW_ID)).toEqual([NEW_FROM_REPORT_TEXT, NEW_TITLE_TEXT]);
    expect(perguntaEm(await send('Bebedouro do Bloco 18'))).toBe(SUGESTAO_INFRA);
    expect(await passo()).toBe('NEW_CONFIRM_CATEGORY');
    expect(await send('categoria:infraestrutura')).toEqual([
      FROM_REPORT_DESCRIPTION_TEXT,
      PHOTO_ASK_TEXT,
    ]);
    expect(await passo()).toBe('NEW_ASK_PHOTO');

    const resumoDoRelato = resumoEm(await send('pular'));
    expect(resumoDoRelato).toContain('*Local:* Bloco 18');
    expect(resumoDoRelato).toContain('*Categoria:* Infraestrutura');
    const [pauta] = await todasAsPautas();
    expect(pauta).toMatchObject({
      titulo: 'Bebedouro do Bloco 18',
      descricao: RELATO,
      categoria: 'infraestrutura',
    });
    if (!pauta) throw new Error('pauta não criada');
    expect(await db.select().from(relatos).where(eq(relatos.pautaId, pauta.id))).toMatchObject([
      { texto: RELATO },
    ]);
    expect(await dados()).toEqual({});
  });

  it('a sugestão considera o relato, mesmo com um título sem palavra-chave (SCRUM-365)', async () => {
    await send(RELATO);
    await send(OTHER_ROW_ID);
    expect(perguntaEm(await send('Pauta do bloco 18'))).toBe(SUGESTAO_INFRA);
    expect(await send('categoria:escolher')).toEqual([expect.objectContaining({ tipo: 'lista' })]);
    expect(await send('categoria:seguranca')).toEqual([
      FROM_REPORT_DESCRIPTION_TEXT,
      PHOTO_ASK_TEXT,
    ]);
    expect(resumoEm(await send('pular'))).toContain('*Categoria:* Segurança');
  });

  it('com pauta parecida aberta, "É outro" no relato não mostra a lista de novo', async () => {
    await abrirPautaDeBebedouros();
    listaEm(await send(RELATO));
    await send(OTHER_ROW_ID);
    listaEm(await send('Bebedouro do Bloco 18'));
    expect(await send('infraestrutura')).toEqual([FROM_REPORT_DESCRIPTION_TEXT, PHOTO_ASK_TEXT]);
    expect(await passo()).toBe('NEW_ASK_PHOTO');
  });

  it('relato maior que o limite da descrição: pergunta a descrição', async () => {
    await send(`a porta do bloco 18 ta emperrada${' muito'.repeat(400)}`);
    await send('sim');
    listaEm(await send('Porta emperrada'));
    expect(await send('infraestrutura')).toEqual([DESCRIPTION_QUESTION_TEXT]);
    expect(await passo()).toBe('NEW_ASK_DESCRIPTION');
  });
});

describe('categoria da pauta (SCRUM-357)', () => {
  beforeEach(async () => {
    await verificar();
    await send('2');
    await send('Problema esquisito');
    await send(`bloco:${bloco18}`);
  });

  it('a lista traz as categorias do site e "Outra", sem "a_classificar"', async () => {
    const lista = listaEm(await send('categoria:xyz'));
    expect(lista.linhas.map((l) => l.titulo)).toEqual([
      'Infraestrutura',
      'Segurança',
      'Acessibilidade',
      'Ensino',
      'Permanência',
      'Serviços',
      'Tecnologia',
      'Outra',
    ]);
  });

  it('a categoria tocada na lista chega na pauta e no resumo', async () => {
    await send('categoria:seguranca');
    await send(DESCRICAO);
    const resumoFinal = resumoEm(await send('pular'));
    expect(resumoFinal).toContain('*Categoria:* Segurança');
    const [pauta] = await todasAsPautas();
    expect(pauta?.categoria).toBe('seguranca');
  });

  it.each(['Segurança', 'seguranca', 'SEGURANÇA.', ' Seguranca '])(
    'aceita o nome digitado: %j',
    async (digitado) => {
      expect(await send(digitado)).toEqual([DESCRIPTION_QUESTION_TEXT]);
      expect(await dados()).toMatchObject({ categoria: 'seguranca' });
    },
  );

  it('categoria inválida repete a lista sem perder título nem bloco', async () => {
    const respostas = await send('qualquer coisa');
    expect(respostas[0]).toBe(CATEGORY_NOT_FOUND_TEXT);
    expect(listaEm(respostas).corpo).toBe(CATEGORY_QUESTION_TEXT);
    expect(await passo()).toBe('NEW_ASK_CATEGORY');
    expect(await dados()).toMatchObject({ blocoId: bloco18 });
    expect(await dados()).toHaveProperty('tituloCifrado');
    expect(await dados()).not.toHaveProperty('categoria');
  });

  it('"Outra" segue como a_classificar, para a curadoria', async () => {
    await send('categoria:outra');
    await send(DESCRICAO);
    const resumoFinal = resumoEm(await send('pular'));
    expect(resumoFinal).toContain('*Categoria:* Outra');
    const [pauta] = await todasAsPautas();
    expect(pauta?.categoria).toBe('a_classificar');
  });

  it('a categoria não sobra na conversa depois de criar a pauta', async () => {
    await send('ensino');
    await send(DESCRICAO);
    await send('pular');
    expect(await dados()).toEqual({});
  });
});

describe('sugestão de categoria (SCRUM-365)', () => {
  beforeEach(async () => {
    await verificar();
    await send('2');
  });

  it('termo claro no título sugere a categoria e um toque confirma', async () => {
    await send('Goteira na sala 12');
    const botoes = await send(`bloco:${bloco18}`);
    const pergunta = botoes.at(-1);
    expect(pergunta).toEqual({
      tipo: 'botoes',
      corpo: SUGESTAO_INFRA,
      botoes: [
        { id: 'categoria:confirmar', titulo: 'Confirmar' },
        { id: 'categoria:escolher', titulo: 'Escolher outra' },
      ],
    });
    expect(await passo()).toBe('NEW_CONFIRM_CATEGORY');

    expect(await send('categoria:confirmar')).toEqual([DESCRIPTION_QUESTION_TEXT]);
    await send(DESCRICAO);
    expect(resumoEm(await send('pular'))).toContain('*Categoria:* Infraestrutura');
    const [pauta] = await todasAsPautas();
    expect(pauta?.categoria).toBe('infraestrutura');
    expect(await dados()).toEqual({});
  });

  it('"Escolher outra" abre a lista completa e a escolha manual vale', async () => {
    await send('Goteira na sala 12');
    await send(`bloco:${bloco18}`);
    const lista = listaEm(await send('categoria:escolher'));
    expect(lista.corpo).toBe(CATEGORY_QUESTION_TEXT);
    expect(lista.linhas).toHaveLength(8);
    expect(await passo()).toBe('NEW_ASK_CATEGORY');

    await send('categoria:ensino');
    await send(DESCRICAO);
    await send('pular');
    const [pauta] = await todasAsPautas();
    expect(pauta?.categoria).toBe('ensino');
  });

  it('título ambíguo ou sem termo conhecido cai direto na lista, sem sugerir', async () => {
    for (const titulo of ['Wi-Fi da biblioteca', 'Problema esquisito']) {
      await send(titulo);
      const respostas = await send(`bloco:${bloco18}`);
      expect(respostas).toHaveLength(1);
      expect(listaEm(respostas).corpo).toBe(CATEGORY_QUESTION_TEXT);
      expect(await passo()).toBe('NEW_ASK_CATEGORY');
      expect(await dados()).not.toHaveProperty('categoriaSugerida');
      await send('cancelar');
      await send('2');
    }
  });

  it('digitar uma categoria no lugar dos botões vale como a escolha', async () => {
    await send('Goteira na sala 12');
    await send(`bloco:${bloco18}`);
    expect(await send('Segurança')).toEqual([DESCRIPTION_QUESTION_TEXT]);
    expect(await dados()).toMatchObject({ categoria: 'seguranca' });
  });

  it('resposta que não é nem botão nem categoria repete a pergunta', async () => {
    await send('Goteira na sala 12');
    await send(`bloco:${bloco18}`);
    const respostas = await send('hã?');
    expect(perguntaEm(respostas)).toBe(SUGESTAO_INFRA);
    expect(await passo()).toBe('NEW_CONFIRM_CATEGORY');
    expect(await send('sim')).toEqual([DESCRIPTION_QUESTION_TEXT]);
  });

  it('o texto da pauta fica cifrado: só o id da categoria sugerida entra na conversa', async () => {
    await send('Goteira na sala 12');
    await send(`bloco:${bloco18}`);
    const guardado = JSON.stringify(await dados());
    expect(guardado).not.toContain('Goteira');
    expect(await dados()).toMatchObject({ categoriaSugerida: 'infraestrutura' });
  });
});

describe('resumo', () => {
  it('avisa o prazo da curadoria, o mesmo da fila do painel (24 h)', async () => {
    const texto = await resumo(db, { titulo: 'T', blocoId: null, meta: 300, comFoto: false });
    expect(CURADORIA_PRAZO_TEXT).toBe('A curadoria responde em até 24 horas.');
    expect(texto.split('\n').at(-1)).toBe(CURADORIA_PRAZO_TEXT);
  });
});
