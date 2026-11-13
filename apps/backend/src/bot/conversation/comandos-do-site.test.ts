import { apoios, blocos, eq, estudantes, eventos, papeisPauta, pautas, type Db } from '@lumens/db';
import { criarBancoEmMemoria } from '@lumens/db/teste';
import { beforeEach, describe, expect, it } from 'vitest';
import { hmacHex, segredoCom } from '../../cripto/cifra';
import type { ServicoDeEmail } from '../../email/codigo';
import {
  ASK_WRITE_REPORT_TEXT,
  SUPPORT_CLOSED_TEXT,
  SUPPORT_VERIFY_FIRST_TEXT,
  supportedText,
} from './apoio';
import {
  COOWNER_INVITE_TEXT,
  COOWNER_VERIFY_FIRST_TEXT,
  alreadyOwnerText,
  coOwnerText,
  ownersFullText,
  supportFirstText,
} from './co-owner';
import { PAUTA_NOT_FOUND_TEXT, parseComandoDoSite } from './comandos-do-site';
import { MENU_TEXT } from './handlers';
import { VERIFY_FIRST_TEXT } from './nova-pauta';
import { hashPhone } from './phone';
import { PRIVACY_NOTICE_TEXT } from './privacidade';
import { NO_PROPOSAL_TEXT } from './proposta';
import type { Resposta } from './resposta';
import { handleIncoming } from './router';
import { ConversationStore } from './store';
import { NEW_TITLE_TEXT } from './texto';
import { VERIFIED_TEXT } from './verificacao';

const CHAVE = Buffer.alloc(32, 7);
const segredo = segredoCom(CHAVE);
const hmac = (valor: string) => hmacHex(valor, CHAVE);
const TITULO = 'Bebedouros funcionando no Bloco 18';
const SLUG = 'bebedouros-no-bloco-18';

let db: Db;
let store: ConversationStore;
let pautaId: string;

/** E-mail falso: guarda o último código para a pessoa digitar. */
let ultimoCodigo = '';
const email: ServicoDeEmail = {
  enviarCodigo(_para, codigo) {
    ultimoCodigo = codigo;
    return Promise.resolve(true);
  },
};

/** Uma pessoa conversando com o bot, pelo telefone dela. */
function pessoa(telefone: string) {
  const phoneHmac = hashPhone(telefone, CHAVE);
  const send = (text: string) =>
    handleIncoming(
      { phoneHmac, text, phoneCifrado: segredo.cifrar(telefone) },
      { store, db, segredo, email, hmac },
    );
  return {
    phoneHmac,
    send,
    passo: async () => (await store.get(phoneHmac))?.step,
    dados: async () => (await store.get(phoneHmac))?.data ?? {},
    /** Termina a verificação já pedida (passo do e-mail): e-mail, código e curso. */
    async verificarPeloBot(emailUfal: string) {
      await send(emailUfal);
      await send(ultimoCodigo);
      return send('curso:Direito');
    },
    /** Cadastro verificado direto no banco, para os testes que não são da verificação. */
    async jaVerificado() {
      const [e] = await db
        .insert(estudantes)
        .values({ telefoneHmac: phoneHmac, telefoneCifrado: 'x', verificadoEm: new Date() })
        .returning({ id: estudantes.id });
      if (!e) throw new Error('estudante não inserido');
      return e.id;
    },
  };
}

const apoiosDaPauta = () => db.select().from(apoios).where(eq(apoios.pautaId, pautaId));
const papeisDaPauta = () => db.select().from(papeisPauta).where(eq(papeisPauta.pautaId, pautaId));

async function outroEstudante(n: number) {
  const [e] = await db
    .insert(estudantes)
    .values({ telefoneHmac: `outro-${String(n)}`, telefoneCifrado: 'x', verificadoEm: new Date() })
    .returning({ id: estudantes.id });
  if (!e) throw new Error('estudante não inserido');
  return e.id;
}

const convite = () => ({
  tipo: 'botoes',
  corpo: COOWNER_INVITE_TEXT,
  botoes: [{ id: `cuidar ${pautaId}`, titulo: 'Quero cuidar' }],
});

const ids = (respostas: Resposta[]) =>
  respostas
    .flatMap((r) => (typeof r !== 'string' && r.tipo === 'botoes' ? r.botoes : []))
    .map((b) => b.id);

// Banco em memória novo a cada teste: no Windows, com os testes em paralelo, passa de 20s.
beforeEach(async () => {
  db = await criarBancoEmMemoria();
  store = new ConversationStore(db);
  ultimoCodigo = '';
  const [b18] = await db
    .insert(blocos)
    .values({ slug: 'bloco-18', nome: 'Bloco 18', baseEstudantes: 1200 })
    .returning({ id: blocos.id });
  if (!b18) throw new Error('bloco não inserido');
  const [pauta] = await db
    .insert(pautas)
    .values({
      slug: SLUG,
      titulo: TITULO,
      descricao: 'Consertar os bebedouros existentes do bloco.',
      blocoId: b18.id,
      categoria: 'infraestrutura',
      status: 'juntando_apoios',
      meta: 30,
    })
    .returning({ id: pautas.id });
  if (!pauta) throw new Error('pauta não inserida');
  pautaId = pauta.id;
}, 60_000);

describe('parseComandoDoSite', () => {
  it('reconhece os textos prontos dos botões do site', () => {
    expect(parseComandoDoSite('apoiar bebedouros')).toEqual({ kind: 'apoiar', alvo: 'bebedouros' });
    expect(parseComandoDoSite('  Ajudar faixa ')).toEqual({ kind: 'ajudar', alvo: 'faixa' });
    expect(parseComandoDoSite('cuidar abc')).toEqual({ kind: 'cuidar', alvo: 'abc' });
    expect(parseComandoDoSite('Nova Pauta')).toEqual({ kind: 'nova-pauta' });
  });

  it('não confunde texto comum com comando', () => {
    expect(parseComandoDoSite('apoiar')).toBeNull();
    expect(parseComandoDoSite('quero apoiar bebedouros')).toBeNull();
    expect(parseComandoDoSite('apoiar os bebedouros')).toBeNull();
    expect(parseComandoDoSite('nova pauta sobre luz')).toBeNull();
  });
});

describe('"apoiar <slug>" vindo do site (2.8)', () => {
  it('verificado: registra o apoio e segue para o relato opcional', async () => {
    const p = pessoa('5582999990001');
    await p.jaVerificado();
    await p.send('oi');

    expect(await p.send(`apoiar ${SLUG}`)).toEqual([
      supportedText(TITULO, 1, 30),
      ASK_WRITE_REPORT_TEXT,
    ]);
    expect(await p.passo()).toBe('SUPPORT_ASK_REPORT');
    expect(await apoiosDaPauta()).toMatchObject([{ origem: 'bot' }]);
  });

  it('primeiro contato sem verificação: guarda o pedido, verifica e retoma o apoio', async () => {
    const p = pessoa('5582999990002');

    expect(await p.send(`apoiar ${SLUG}`)).toEqual([
      PRIVACY_NOTICE_TEXT,
      SUPPORT_VERIFY_FIRST_TEXT,
    ]);
    expect(await p.passo()).toBe('VERIFY_ASK_EMAIL');
    expect(await p.dados()).toMatchObject({ pendingCommand: { kind: 'apoiar', id: pautaId } });
    expect(await apoiosDaPauta()).toHaveLength(0);

    expect(await p.verificarPeloBot('aluno2@ufal.br')).toEqual([
      VERIFIED_TEXT,
      supportedText(TITULO, 1, 30),
      ASK_WRITE_REPORT_TEXT,
    ]);
    expect(await p.passo()).toBe('SUPPORT_ASK_REPORT');
    expect(await p.dados()).not.toHaveProperty('pendingCommand');
    expect(await apoiosDaPauta()).toHaveLength(1);
  });

  it('larga o fluxo em andamento e não leva os dados dele', async () => {
    const p = pessoa('5582999990003');
    await p.jaVerificado();
    await p.send('oi');
    await p.send('2');
    await p.send('Título que ficou pela metade');
    expect(await p.passo()).toBe('NEW_ASK_PLACE');

    expect((await p.send(`apoiar ${SLUG}`))[0]).toBe(supportedText(TITULO, 1, 30));
    expect(await p.passo()).toBe('SUPPORT_ASK_REPORT');
    expect(await p.dados()).not.toHaveProperty('tituloCifrado');
  });

  it('pauta que não existe, no menu, avisa sem mandar verificar', async () => {
    const p = pessoa('5582999990004');
    await p.send('oi');

    expect(await p.send('apoiar nao-existe')).toEqual([PAUTA_NOT_FOUND_TEXT, MENU_TEXT]);
    expect(await p.passo()).toBe('MENU');
  });

  it('pauta que não existe, no primeiro contato, avisa junto com a privacidade', async () => {
    const p = pessoa('5582999990005');
    expect(await p.send('apoiar nao-existe')).toEqual([
      PRIVACY_NOTICE_TEXT,
      PAUTA_NOT_FOUND_TEXT,
      MENU_TEXT,
    ]);
  });

  it('no meio de um fluxo, "apoiar <algo que não é pauta>" é só a resposta à pergunta', async () => {
    const p = pessoa('5582999990006');
    await p.send('oi');
    await p.send('1');

    await p.send('apoiar estudantes');
    expect(['REPORT_ASK_BLOCK', 'REPORT_PICK_SIMILAR']).toContain(await p.passo());
  });

  it('pauta fechada para apoio avisa já, sem verificação', async () => {
    await db.update(pautas).set({ status: 'conquistada' }).where(eq(pautas.id, pautaId));
    const p = pessoa('5582999990007');
    await p.send('oi');

    expect(await p.send(`apoiar ${SLUG}`)).toEqual([SUPPORT_CLOSED_TEXT, MENU_TEXT]);
    expect(await p.passo()).toBe('MENU');
    expect(await p.dados()).not.toHaveProperty('pendingCommand');
  });
});

describe('"nova pauta" vindo do site (2.8)', () => {
  it('primeiro contato sem verificação: verifica e retoma no título', async () => {
    const p = pessoa('5582999990010');

    expect(await p.send('nova pauta')).toEqual([PRIVACY_NOTICE_TEXT, VERIFY_FIRST_TEXT]);
    expect(await p.dados()).toMatchObject({ pendingCommand: { kind: 'nova-pauta' } });
    expect(await p.verificarPeloBot('aluno10@ufal.br')).toEqual([VERIFIED_TEXT, NEW_TITLE_TEXT]);
    expect(await p.passo()).toBe('NEW_ASK_TITLE');
  });

  it('no meio de outro fluxo, larga o fluxo e começa a pauta nova', async () => {
    const p = pessoa('5582999990011');
    await p.jaVerificado();
    await p.send('oi');
    await p.send('1');

    expect(await p.send('nova pauta')).toEqual([NEW_TITLE_TEXT]);
    expect(await p.passo()).toBe('NEW_ASK_TITLE');
  });
});

describe('"ajudar <slug>" sem proposta aberta (2.8)', () => {
  it('quem não é verificado recebe o aviso, sem ir para a verificação', async () => {
    const p = pessoa('5582999990020');
    await p.send('oi');

    expect(await p.send(`ajudar ${SLUG}`)).toEqual([NO_PROPOSAL_TEXT, MENU_TEXT]);
    expect(await p.passo()).toBe('MENU');
    expect(await p.dados()).not.toHaveProperty('pendingCommand');
  });
});

describe('virar co-owner (2.8, RN06)', () => {
  /** Apoia pelo site e pula o relato: o fim do apoio traz o convite. */
  async function apoiarEPular(p: ReturnType<typeof pessoa>) {
    await p.send(`apoiar ${SLUG}`);
    return p.send('pular');
  }

  it('o fim do apoio convida, e "Quero cuidar" vira co-owner', async () => {
    const p = pessoa('5582999990030');
    const estudanteId = await p.jaVerificado();
    await p.send('oi');

    const fim = await apoiarEPular(p);
    expect(fim).toContainEqual(convite());

    expect(await p.send(`cuidar ${pautaId}`)).toEqual([coOwnerText(TITULO), MENU_TEXT]);
    expect(await papeisDaPauta()).toMatchObject([{ estudanteId, papel: 'co_owner', ate: null }]);
    const tipos = (await db.select().from(eventos).where(eq(eventos.pautaId, pautaId))).map(
      (e) => e.tipo,
    );
    expect(tipos).toContain('owner_entrou');
  });

  it('pauta com 3 owners: sem convite, e o pedido é recusado pelo limite', async () => {
    for (const n of [1, 2, 3]) {
      const id = await outroEstudante(n);
      await db
        .insert(papeisPauta)
        .values({ pautaId, estudanteId: id, papel: n === 1 ? 'owner' : 'co_owner' });
    }
    const p = pessoa('5582999990031');
    await p.jaVerificado();
    await p.send('oi');

    expect(await apoiarEPular(p)).not.toContainEqual(convite());
    expect(await p.send(`cuidar ${SLUG}`)).toEqual([ownersFullText(TITULO), MENU_TEXT]);
    expect(await papeisDaPauta()).toHaveLength(3);
  });

  it('quem ainda não apoia recebe o botão de apoiar, que funciona com o id', async () => {
    const p = pessoa('5582999990032');
    await p.jaVerificado();
    await p.send('oi');

    const r = await p.send(`cuidar ${SLUG}`);
    expect(r[0]).toMatchObject({ tipo: 'botoes', corpo: supportFirstText(TITULO) });
    expect(ids(r)).toEqual([`apoiar ${pautaId}`]);
    expect(await papeisDaPauta()).toHaveLength(0);

    expect((await p.send(`apoiar ${pautaId}`))[0]).toBe(supportedText(TITULO, 1, 30));
  });

  it('quem já cuida da pauta é avisado, sem segundo papel', async () => {
    const p = pessoa('5582999990033');
    const estudanteId = await p.jaVerificado();
    await db.insert(apoios).values({ pautaId, estudanteId, origem: 'bot' });
    await db.insert(papeisPauta).values({ pautaId, estudanteId, papel: 'owner' });
    await p.send('oi');

    expect(await p.send(`cuidar ${pautaId}`)).toEqual([alreadyOwnerText(TITULO), MENU_TEXT]);
    expect(await papeisDaPauta()).toHaveLength(1);
  });

  it('sem verificação: guarda o pedido e retoma depois de verificado', async () => {
    const p = pessoa('5582999990034');
    await p.send('oi');

    expect(await p.send(`cuidar ${SLUG}`)).toEqual([COOWNER_VERIFY_FIRST_TEXT]);
    expect(await p.dados()).toMatchObject({ pendingCommand: { kind: 'cuidar', id: pautaId } });

    const r = await p.verificarPeloBot('aluno34@ufal.br');
    expect(r[0]).toBe(VERIFIED_TEXT);
    // Ainda não apoia: o pedido retomado oferece o apoio primeiro.
    expect(ids(r)).toEqual([`apoiar ${pautaId}`]);
    expect(await p.dados()).not.toHaveProperty('pendingCommand');
  });
});
