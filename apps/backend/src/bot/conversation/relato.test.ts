import { blocos, conversas, estudantes, pautas, type Db } from '@lumens/db';
import { criarBancoEmMemoria } from '@lumens/db/teste';
import { beforeEach, describe, expect, it } from 'vitest';
import { segredoCom } from '../../cripto';
import { MENU_TEXT } from './handlers';
import { hashPhone } from './phone';
import {
  BLOCK_NOT_FOUND_TEXT,
  CAMPUS_ROW_ID,
  NEW_FROM_REPORT_TEXT,
  NO_SIMILAR_TEXT,
  NOTHING_CREATED_TEXT,
  OTHER_ROW_ID,
  PICK_AGAIN_TEXT,
  REPORT_LOST_TEXT,
  REPORT_PROMPT_TEXT,
  REPORT_TOO_SHORT_TEXT,
  YES_NO_TEXT,
  blocoCitado,
  blocoEscolhido,
  listaDeBlocos,
} from './relato';
import { cortar, lista, textoDaResposta, type MensagemDeLista, type Resposta } from './resposta';
import { handleIncoming } from './router';
import { ConversationStore } from './store';
import { NEW_TITLE_TEXT } from './texto';

const CHAVE = Buffer.alloc(32, 7);
const H = hashPhone('5582999990000', CHAVE);
const segredo = segredoCom(CHAVE);

let db: Db;
let store: ConversationStore;
let ids: { bloco18: string; artes: string; bebedouros: string; banheiros: string; ru: string };

const send = (text: string) => handleIncoming({ phoneHmac: H, text }, { store, db, segredo });
const passo = async () => (await store.get(H))?.step;
const dados = async () => (await store.get(H))?.data ?? {};

function listaEm(respostas: Resposta[]): MensagemDeLista {
  const achada = respostas.find((r): r is MensagemDeLista => typeof r !== 'string');
  if (!achada) throw new Error(`nenhuma lista em ${JSON.stringify(respostas)}`);
  return achada;
}

// Banco em memória novo + mensagens iniciais: no Windows, com os testes em paralelo, passa de 20s.
beforeEach(async () => {
  db = await criarBancoEmMemoria();
  store = new ConversationStore(db);
  const [b18, artes] = await db
    .insert(blocos)
    .values([
      { slug: 'bloco-18', nome: 'Bloco 18', baseEstudantes: 1200 },
      { slug: 'artes', nome: 'Bloco de Artes', baseEstudantes: 300 },
    ])
    .returning({ id: blocos.id });
  if (!b18 || !artes) throw new Error('blocos não inseridos');
  const pauta = (slug: string, titulo: string, descricao: string, blocoId: string | null) => ({
    slug,
    titulo,
    descricao,
    blocoId,
    categoria: 'infraestrutura',
    status: 'juntando_apoios' as const,
    meta: 30,
  });
  const [bebedouros, banheiros, ru] = await db
    .insert(pautas)
    .values([
      pauta(
        'bebedouros',
        'Bebedouros funcionando no Bloco 18',
        'Consertar os bebedouros existentes e publicar um calendário de manutenção preventiva para o semestre todo.',
        b18.id,
      ),
      pauta('banheiros', 'Banheiros limpos', 'Falta papel e sabonete nos banheiros.', b18.id),
      pauta('ru', 'Fila menor no RU', 'Abrir mais um caixa no almoço do RU.', null),
    ])
    .returning({ id: pautas.id });
  if (!bebedouros || !banheiros || !ru) throw new Error('pautas não inseridas');
  ids = {
    bloco18: b18.id,
    artes: artes.id,
    bebedouros: bebedouros.id,
    banheiros: banheiros.id,
    ru: ru.id,
  };
  // "É outro problema" leva à pauta nova, que só segue com estudante verificado (2.6).
  await db
    .insert(estudantes)
    .values({ telefoneHmac: H, telefoneCifrado: 'x', verificadoEm: new Date() });
  await send('oi');
  await send('1');
}, 60_000);

describe('relatar (2.5)', () => {
  it('o menu pede o relato e aceita mensagem encaminhada', async () => {
    await send('menu');
    expect(await send('1')).toEqual([REPORT_PROMPT_TEXT]);
    expect(REPORT_PROMPT_TEXT).toContain('encaminhar');
    expect(await passo()).toBe('REPORT_ASK_TEXT');
  });

  it('relato sem termo útil pede mais detalhe e continua no mesmo passo', async () => {
    expect(await send('tá aqui ó')).toEqual([REPORT_TOO_SHORT_TEXT]);
    expect(await passo()).toBe('REPORT_ASK_TEXT');
  });

  it('relato que cita o bloco vai direto para as parecidas, sem perguntar o bloco', async () => {
    const respostas = await send('o bebedouro do bloco 18 ta quebrado');
    const parecidas = listaEm(respostas);
    expect(parecidas.linhas.map((l) => l.id)).toEqual([`pauta:${ids.bebedouros}`, OTHER_ROW_ID]);
    expect(await passo()).toBe('REPORT_PICK_SIMILAR');
    expect(await dados()).toMatchObject({ blocoId: ids.bloco18 });
  });

  it('linha da pauta respeita os limites da lista: título até 24, descrição até 72', async () => {
    const [linha] = listaEm(await send('o bebedouro do bloco 18 ta quebrado')).linhas;
    expect(linha?.titulo).toBe('Bebedouros funcionando…');
    expect(Array.from(linha?.titulo ?? '').length).toBeLessThanOrEqual(24);
    expect(Array.from(linha?.descricao ?? '').length).toBeLessThanOrEqual(72);
    expect(linha?.descricao).toMatch(/…$/);
  });

  it('relato sem bloco pede o bloco numa lista, com a opção do campus inteiro', async () => {
    const pergunta = listaEm(await send('o banheiro ta sem papel'));
    expect(pergunta.linhas.map((l) => l.id)).toEqual([
      `bloco:${ids.bloco18}`,
      `bloco:${ids.artes}`,
      CAMPUS_ROW_ID,
    ]);
    expect(await passo()).toBe('REPORT_ASK_BLOCK');

    const parecidas = listaEm(await send(`bloco:${ids.bloco18}`));
    expect(parecidas.linhas[0]?.id).toBe(`pauta:${ids.banheiros}`);
    expect(await passo()).toBe('REPORT_PICK_SIMILAR');
  });

  it('aceita o bloco digitado e repete a lista quando não acha o bloco', async () => {
    await send('fila gigante no almoço do RU');
    const respostas = await send('bloco 99');
    expect(respostas[0]).toBe(BLOCK_NOT_FOUND_TEXT);
    listaEm(respostas);
    expect(await passo()).toBe('REPORT_ASK_BLOCK');

    // Pauta do campus inteiro aparece em qualquer bloco.
    const parecidas = listaEm(await send('artes'));
    expect(parecidas.linhas[0]?.id).toBe(`pauta:${ids.ru}`);
    expect(await dados()).toMatchObject({ blocoId: ids.artes });
  });

  it('"todo o campus" procura em todos os blocos', async () => {
    await send('banheiro sem sabonete');
    const parecidas = listaEm(await send(CAMPUS_ROW_ID));
    expect(parecidas.linhas[0]?.id).toBe(`pauta:${ids.banheiros}`);
    expect(await dados()).toMatchObject({ blocoId: null });
  });

  it('o relato fica cifrado na conversa, nunca em claro', async () => {
    const relato = 'o banheiro ta sem papel, falei com joao.silva@ufal.br';
    await send(relato);
    const linhas = JSON.stringify(await db.select().from(conversas));
    expect(linhas).not.toContain('joao.silva');
    expect(linhas).not.toContain('banheiro ta sem papel');
    const { relatoCifrado } = (await dados()) as { relatoCifrado: string };
    expect(segredo.decifrar(relatoCifrado)).toBe(relato);
  });

  it('"É essa" encerra o relato (o apoio é da 2.7) e limpa os dados do relato', async () => {
    await send('o bebedouro do bloco 18 ta quebrado');
    const respostas = await send(`pauta:${ids.bebedouros}`);
    expect(respostas[0]).toContain('2.7');
    expect(respostas[0]).toContain('Bebedouros funcionando no Bloco 18');
    expect(respostas.at(-1)).toBe(MENU_TEXT);
    expect(await passo()).toBe('MENU');
    expect(await dados()).toEqual({});
  });

  it('escolhe a pauta pelo número digitado', async () => {
    await send('o bebedouro do bloco 18 ta quebrado');
    const [resposta] = await send('1');
    expect(resposta).toContain('Bebedouros funcionando no Bloco 18');
  });

  it('"É outro problema" vai para a pauta nova levando o relato e o bloco', async () => {
    const relato = 'o bebedouro do bloco 18 ta quebrado';
    await send(relato);
    expect(await send(OTHER_ROW_ID)).toEqual([NEW_FROM_REPORT_TEXT, NEW_TITLE_TEXT]);
    expect(await passo()).toBe('NEW_ASK_TITLE');
    const data = (await dados()) as { relatoCifrado: string; blocoId: string };
    expect(segredo.decifrar(data.relatoCifrado)).toBe(relato);
    expect(data.blocoId).toBe(ids.bloco18);
    expect(data).not.toHaveProperty('parecidas');
  });

  it('escolha fora da lista repete a lista', async () => {
    await send('o bebedouro do bloco 18 ta quebrado');
    const respostas = await send(`pauta:${ids.ru}`);
    expect(respostas[0]).toBe(PICK_AGAIN_TEXT);
    expect(listaEm(respostas).linhas).toHaveLength(2);
    expect(await passo()).toBe('REPORT_PICK_SIMILAR');
  });

  describe('sem pauta parecida', () => {
    beforeEach(async () => {
      expect(await send('a porta do bloco 18 ta emperrada')).toEqual([NO_SIMILAR_TEXT]);
      expect(await passo()).toBe('REPORT_PICK_SIMILAR');
    });

    it('"sim" oferece criar a pauta nova', async () => {
      expect(await send('Sim!')).toEqual([NEW_FROM_REPORT_TEXT, NEW_TITLE_TEXT]);
      expect(await passo()).toBe('NEW_ASK_TITLE');
    });

    it('"não" volta ao menu sem criar nada', async () => {
      expect(await send('não')).toEqual([NOTHING_CREATED_TEXT, MENU_TEXT]);
      expect(await dados()).toEqual({});
    });

    it('outra resposta pergunta de novo', async () => {
      expect(await send('hein?')).toEqual([YES_NO_TEXT]);
      expect(await passo()).toBe('REPORT_PICK_SIMILAR');
    });
  });

  it('relato que não decifra mais (chave trocada) volta ao menu pedindo de novo', async () => {
    await send('o banheiro ta sem papel');
    await store.save(H, 'REPORT_ASK_BLOCK', { relatoCifrado: 'nao-e-cifra' });
    expect(await send(CAMPUS_ROW_ID)).toEqual([REPORT_LOST_TEXT, MENU_TEXT]);
    expect(await passo()).toBe('MENU');
  });
});

describe('blocos', () => {
  const lista3 = [
    { id: 'b1', slug: 'bloco-1', nome: 'Bloco 1' },
    { id: 'b18', slug: 'bloco-18', nome: 'Bloco 18 (fictício)' },
    { id: 'bib', slug: 'biblioteca-central', nome: 'Biblioteca Central' },
  ];

  it.each([
    ['problema no Bloco 18!', 'b18'],
    ['problema no bloco 1', 'b1'],
    ['na biblioteca central', 'bib'],
    ['na biblioteca', undefined],
    ['bloco 1 e bloco 18', undefined],
  ])('blocoCitado(%j) = %s', (relato, esperado) => {
    expect(blocoCitado(relato, lista3)?.id).toBe(esperado);
  });

  it.each([
    ['bloco:b18', 'b18'],
    ['bloco:nao-existe', undefined],
    [CAMPUS_ROW_ID, null],
    ['Não sei', null],
    ['Biblioteca Central', 'bib'],
    ['biblioteca-central', 'bib'],
    ['18', 'b18'],
    ['bloco', undefined],
    ['', undefined],
  ])('blocoEscolhido(%j) = %s', (resposta, esperado) => {
    expect(blocoEscolhido(resposta, lista3)?.blocoId).toBe(esperado);
  });

  it('com mais de 9 blocos, mostra 9 e pede para digitar o nome dos outros', () => {
    const muitos = Array.from({ length: 12 }, (_, i) => ({
      id: String(i),
      slug: `b${String(i)}`,
      nome: `Bloco ${String(i)}`,
    }));
    const mensagem = listaDeBlocos(muitos);
    expect(mensagem.linhas).toHaveLength(10);
    expect(mensagem.linhas.at(-1)?.id).toBe(CAMPUS_ROW_ID);
    expect(mensagem.corpo).toContain('escreva o nome');
  });
});

describe('mensagem de lista', () => {
  it('corta título, descrição e botão nos limites da Meta', () => {
    const m = lista({
      corpo: 'Escolha',
      botao: 'Um botão com texto longo demais',
      linhas: [{ id: 'a', titulo: 'x'.repeat(30), descricao: 'y'.repeat(100) }],
    });
    expect(Array.from(m.botao).length).toBeLessThanOrEqual(20);
    expect(m.botao).toMatch(/…$/);
    expect(Array.from(m.linhas[0]?.titulo ?? '').length).toBe(24);
    expect(Array.from(m.linhas[0]?.descricao ?? '').length).toBe(72);
  });

  it('recusa lista vazia ou com mais de 10 linhas', () => {
    const linha = { id: 'a', titulo: 'a' };
    expect(() => lista({ corpo: 'c', botao: 'b', linhas: [] })).toThrow();
    expect(() =>
      lista({ corpo: 'c', botao: 'b', linhas: Array.from({ length: 11 }, () => linha) }),
    ).toThrow();
  });

  it('cortar não parte emoji e não corta o que cabe', () => {
    expect(cortar('Água 💧💧💧', 6)).toBe('Água…');
    expect(cortar('curto', 24)).toBe('curto');
  });

  it('vira texto legível no log do pnpm dev', () => {
    const texto = textoDaResposta(
      lista({ corpo: 'Corpo', botao: 'Ver', linhas: [{ id: 'x', titulo: 'T', descricao: 'D' }] }),
    );
    expect(texto).toBe('Corpo\n[Ver]\n• T — D [x]');
  });
});
