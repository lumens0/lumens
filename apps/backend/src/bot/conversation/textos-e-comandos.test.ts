/**
 * SCRUM-334: textos sem jargão e com forma neutra, confirmação de saída que não aceita "s" solto,
 * menu que entende cumprimento e "ajuda", e o caminho até as pautas abertas pelo menu.
 */
import { ORIGEM_SITE_PRODUCAO } from '@lumens/contratos';
import { estudantes, type Db } from '@lumens/db';
import { criarBancoEmMemoria } from '@lumens/db/teste';
import { beforeEach, describe, expect, it } from 'vitest';
import { segredoCom } from '../../cripto/cifra';
import * as worker from '../worker';
import * as apoio from './apoio';
import * as coOwner from './co-owner';
import * as comandosDoSite from './comandos-do-site';
import * as handlers from './handlers';
import * as minhasPautas from './minhas-pautas';
import * as novaPauta from './nova-pauta';
import { hashPhone } from './phone';
import * as privacidade from './privacidade';
import * as proposta from './proposta';
import * as protocolo from './protocolo-falabr';
import * as relato from './relato';
import * as respostaOficial from './resposta-oficial';
import { handleIncoming } from './router';
import { ConversationStore } from './store';
import * as verificacao from './verificacao';

const CHAVE = Buffer.alloc(32, 4);
const H = hashPhone('5582999993340', CHAVE);
const segredo = segredoCom(CHAVE);

let db: Db;
let store: ConversationStore;

const send = (text: string) => handleIncoming({ phoneHmac: H, text }, { store, db, segredo });
const passo = async () => (await store.get(H))?.step;

/** Já passou pela saudação: está no menu. */
async function noMenu() {
  await send('oi');
  expect(await passo()).toBe('MENU');
}

async function comCadastro() {
  await db.insert(estudantes).values({
    telefoneHmac: H,
    telefoneCifrado: segredo.cifrar('5582999993340'),
    curso: 'Direito',
    verificadoEm: new Date(),
  });
}

/** Só as conversas usam banco: os testes de texto rodam sem subir o PGlite para cada um. */
function comBanco() {
  beforeEach(async () => {
    db = await criarBancoEmMemoria();
    store = new ConversationStore(db);
  }, 60_000);
}

describe('textos para estudante (SCRUM-334)', () => {
  const modulos = {
    worker,
    apoio,
    coOwner,
    comandosDoSite,
    handlers,
    minhasPautas,
    novaPauta,
    privacidade,
    proposta,
    protocolo,
    relato,
    respostaOficial,
    verificacao,
  };
  const textos = Object.entries(modulos).flatMap(([modulo, exportados]) =>
    Object.entries(exportados as Record<string, unknown>)
      .filter((par): par is [string, string] => typeof par[1] === 'string')
      .filter(([nome]) => nome.endsWith('_TEXT'))
      .map(([nome, texto]): [string, string] => [`${modulo}.${nome}`, texto]),
  );

  it('acha os textos', () => {
    expect(textos.length).toBeGreaterThan(50);
  });

  it.each(textos)('%s não usa "owner"', (_nome, texto) => {
    expect(texto).not.toMatch(/\bowner/i);
  });

  it.each(textos)('%s não chama a pessoa de "estudante verificado"', (_nome, texto) => {
    expect(texto).not.toMatch(/estudante verificado|não está verificado/i);
  });

  it('a verificação concluída fala da verificação, não da pessoa', () => {
    expect(verificacao.VERIFIED_TEXT).toMatch(/^Pronto, sua verificação está feita ✅/);
    expect(verificacao.ALREADY_VERIFIED_TEXT).toMatch(/^Sua verificação já está feita\./);
  });
});

describe('confirmação de saída (SCRUM-334)', () => {
  comBanco();

  it('"s" sozinho não confirma: a pessoa continua no Lumens', async () => {
    await comCadastro();
    await noMenu();
    expect(await send('sair')).toEqual([privacidade.LEAVE_CONFIRM_TEXT]);

    expect(await send('s')).toEqual([privacidade.STAYED_TEXT, handlers.MENU_PRINCIPAL]);
    expect(await passo()).toBe('MENU');
    const [linha] = await db.select({ saiuEm: estudantes.saiuEm }).from(estudantes);
    expect(linha?.saiuEm).toBeNull();
  });

  it.each(['sim', 'Sim!', 'sair', 'SAIR'])('"%s" confirma a saída', async (resposta) => {
    await comCadastro();
    await noMenu();
    await send('sair');

    expect(await send(resposta)).toEqual([privacidade.LEFT_TEXT]);
    const [linha] = await db.select({ saiuEm: estudantes.saiuEm }).from(estudantes);
    expect(linha?.saiuEm).not.toBeNull();
  });
});

describe('menu (SCRUM-334)', () => {
  comBanco();

  it.each(['oi', 'Olá!', 'ola', 'voltar', 'Início', 'começar'])(
    '"%s" no menu mostra o menu, sem "Não entendi"',
    async (texto) => {
      await noMenu();
      expect(await send(texto)).toEqual([handlers.MENU_PRINCIPAL]);
      expect(await passo()).toBe('MENU');
    },
  );

  it.each(['ajuda', 'Ajuda?', 'socorro'])(
    '"%s" explica os comandos e mostra o menu',
    async (texto) => {
      await noMenu();
      expect(await send(texto)).toEqual([handlers.HELP_TEXT, handlers.MENU_PRINCIPAL]);
      expect(await passo()).toBe('MENU');
    },
  );

  it('a ajuda aponta o manual do site', () => {
    expect(handlers.HELP_TEXT).toContain(`${ORIGEM_SITE_PRODUCAO}/manual`);
  });

  it('a ajuda cita os comandos menu, cancelar e sair', () => {
    for (const comando of ['*menu*', '*cancelar*', '*sair*'])
      expect(handlers.HELP_TEXT).toContain(comando);
  });

  it('o resto continua sendo "Não entendi", que agora lembra da ajuda', async () => {
    await noMenu();
    expect(await send('banana')).toEqual([handlers.MENU_INVALID_TEXT, handlers.MENU_PRINCIPAL]);
    expect(handlers.MENU_INVALID_TEXT).toContain('*ajuda*');
  });

  it.each(['5', 'Ver pautas abertas', 'pautas abertas'])(
    '"%s" manda o link das pautas abertas e fica no menu',
    async (texto) => {
      await noMenu();
      expect(await send(texto)).toEqual([handlers.OPEN_PAUTAS_TEXT, handlers.MENU_PRINCIPAL]);
      expect(await passo()).toBe('MENU');
    },
  );

  it('o menu lista a opção 5 e o texto dela leva ao site', () => {
    expect(handlers.MENU_PRINCIPAL.linhas).toContainEqual({
      id: '5',
      titulo: 'Ver pautas abertas',
    });
    expect(handlers.OPEN_PAUTAS_TEXT).toContain(ORIGEM_SITE_PRODUCAO);
  });
});

describe('mensagem sem texto (SCRUM-334)', () => {
  it.each([
    ['audio', worker.AUDIO_TEXT],
    ['video', worker.VIDEO_TEXT],
    ['sticker', worker.STICKER_TEXT],
    ['location', worker.UNSUPPORTED_TEXT],
    ['unsupported', worker.UNSUPPORTED_TEXT],
  ])('%s diz o que fazer', (tipo, texto) => {
    expect(worker.textoSemSuporte(tipo)).toBe(texto);
    expect(texto).toContain('Escreva em texto ou mande *menu*');
  });
});
