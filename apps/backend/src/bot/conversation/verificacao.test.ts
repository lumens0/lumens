import { CURSOS, codigosVerificacao, conversas, eq, estudantes, type Db } from '@lumens/db';
import { CODIGO_EXPIRA_MS, MAX_TENTATIVAS, REENVIO_APOS_MS, hashDoCodigo } from '@lumens/dominio';
import { criarBancoEmMemoria } from '@lumens/db/teste';
import { beforeEach, describe, expect, it } from 'vitest';
import { hmacHex, segredoCom } from '../../cripto';
import type { ServicoDeEmail } from '../../email/codigo';
import { MENU_TEXT } from './handlers';
import { VERIFY_FIRST_TEXT } from './nova-pauta';
import { NO_PROPOSAL_TEXT } from './proposta';
import { NEW_TITLE_TEXT } from './texto';
import { hashPhone } from './phone';
import { textoDaResposta, type Resposta } from './resposta';
import { handleIncoming } from './router';
import { ConversationStore } from './store';
import {
  CODE_EXPIRED_TEXT,
  CODE_HELP_TEXT,
  CODE_LENGTH_TEXT,
  CODE_NOT_SENT_TEXT,
  CODE_OK_TEXT,
  CODE_RESENT_TEXT,
  CODE_SENT_TEXT,
  ALREADY_VERIFIED_TEXT,
  COURSE_NOT_FOUND_TEXT,
  LINK_LOST_TEXT,
  VERIFIED_TEXT,
  listaDeCursos,
  EMAIL_FORMAT_TEXT,
  EMAIL_IN_USE_TEXT,
  EMAIL_LOST_TEXT,
  EMAIL_MANY_TEXT,
  EMAIL_MISSING_TEXT,
  EMAIL_NOT_UFAL_TEXT,
  EMAIL_QUESTION_TEXT,
  LINK_UNAVAILABLE_TEXT,
  NO_ATTEMPTS_TEXT,
  RESEND_FAILED_TEXT,
  wrongCodeText,
} from './verificacao';

const CHAVE = Buffer.alloc(32, 7);
const H = hashPhone('5582999990000', CHAVE);
const segredo = segredoCom(CHAVE);

let db: Db;
let store: ConversationStore;

/** E-mail falso: guarda o que seria enviado e pode falhar de propósito. */
const enviados: { para: string; codigo: string }[] = [];
let envioFunciona = true;
let email: ServicoDeEmail | undefined;
const emailFalso: ServicoDeEmail = {
  enviarCodigo(para, codigo) {
    if (envioFunciona) enviados.push({ para, codigo });
    return Promise.resolve(envioFunciona);
  },
};

const TELEFONE = '5582999990000';
const hmac = (valor: string) => hmacHex(valor, CHAVE);
/** Como o worker: o telefone cifrado vem no job, e o HMAC usa a CHAVE_HMAC. */
let comIdentidade = true;

const sendDe = (phoneHmac: string, phoneCifrado: string, text: string) =>
  handleIncoming(
    { phoneHmac, text, ...(comIdentidade ? { phoneCifrado } : {}) },
    { store, db, segredo, ...(email ? { email } : {}), ...(comIdentidade ? { hmac } : {}) },
  );
const send = (text: string) => sendDe(H, segredo.cifrar(TELEFONE), text);
const codigoGuardado = async () => (await db.select().from(codigosVerificacao))[0];
const ultimoCodigo = () => enviados.at(-1)?.codigo ?? '';

/** Faz de conta que o último código foi enviado `ms` mais cedo. */
async function voltarNoTempo(ms: number) {
  const linha = await codigoGuardado();
  if (!linha) throw new Error('sem código guardado');
  await db.update(codigosVerificacao).set({ expiraEm: new Date(linha.expiraEm.getTime() - ms) });
}

/** Chega ao passo do código com um e-mail da UFAL. */
async function pedirCodigo() {
  await send('3');
  await send('aluno@ufal.br');
}
const passo = async () => (await store.get(H))?.step;
const dados = async () => (await store.get(H))?.data ?? {};
const textos = (respostas: Resposta[]) => respostas.map(textoDaResposta).join('\n');

beforeEach(async () => {
  db = await criarBancoEmMemoria();
  store = new ConversationStore(db);
  enviados.length = 0;
  envioFunciona = true;
  comIdentidade = true;
  email = emailFalso;
  await send('oi');
}, 60_000);

describe('pedir o e-mail institucional (SCRUM-134)', () => {
  it('a opção 3 do menu pergunta o e-mail da UFAL', async () => {
    expect(await send('3')).toEqual([EMAIL_QUESTION_TEXT]);
    expect(await passo()).toBe('VERIFY_ASK_EMAIL');
  });

  it.each(['aluno@ufal.br', 'Joao.Silva@IC.ufal.br', 'meu email é ana@ctec.ufal.br.'])(
    'aceita %j e segue para o código',
    async (mensagem) => {
      await send('3');
      expect(await send(mensagem)).toEqual([CODE_SENT_TEXT]);
      expect(await passo()).toBe('VERIFY_ASK_CODE');
    },
  );

  it.each([
    ['aluno@gmail.com', EMAIL_NOT_UFAL_TEXT],
    ['aluno@ufal.br.com', EMAIL_NOT_UFAL_TEXT],
    ['aluno@xufal.br', EMAIL_NOT_UFAL_TEXT],
    ['não tenho', EMAIL_MISSING_TEXT],
    ['aluno@', EMAIL_FORMAT_TEXT],
    ['aluno@ufal.br e aluno@gmail.com', EMAIL_MANY_TEXT],
  ])('recusa %j e pergunta de novo', async (mensagem, resposta) => {
    await send('3');
    expect(await send(mensagem)).toEqual([resposta]);
    expect(await passo()).toBe('VERIFY_ASK_EMAIL');
    expect(await dados()).not.toHaveProperty('emailCifrado');
    expect(enviados).toEqual([]);
  });

  it('depois de recusar, aceita o e-mail certo', async () => {
    await send('3');
    await send('aluno@gmail.com');
    expect(await send('aluno@ufal.br')).toEqual([CODE_SENT_TEXT]);
    expect(await passo()).toBe('VERIFY_ASK_CODE');
  });

  it('guarda o e-mail normalizado e cifrado; nunca em claro nem nas respostas', async () => {
    await send('3');
    const respostas = await send('  Aluno.Teste@IC.UFAL.BR ');

    const { emailCifrado } = (await dados()) as { emailCifrado: string };
    expect(segredo.decifrar(emailCifrado)).toBe('aluno.teste@ic.ufal.br');
    expect(textos(respostas).toLowerCase()).not.toContain('aluno.teste');
    const linhas = await db.select().from(conversas);
    expect(JSON.stringify(linhas).toLowerCase()).not.toContain('aluno.teste');
  });

  it('vindo da pauta nova (2.6), mantém o pedido pendente', async () => {
    await send('2');
    expect(await passo()).toBe('VERIFY_ASK_EMAIL');
    await send('aluno@ufal.br');
    expect(await dados()).toMatchObject({ pendingCommand: { kind: 'nova-pauta' } });
  });

  it("'cancelar' no passo do e-mail volta ao menu sem guardar nada", async () => {
    await send('3');
    const respostas = await send('cancelar');
    expect(respostas.at(-1)).toBe(MENU_TEXT);
    expect(await passo()).toBe('MENU');
    expect(await dados()).not.toHaveProperty('emailCifrado');
  });
});

describe('código de 6 dígitos por e-mail (SCRUM-135)', () => {
  it('envia um código de 6 dígitos para o e-mail normalizado', async () => {
    await send('3');
    await send('Aluno@IC.ufal.br');
    expect(enviados).toHaveLength(1);
    expect(enviados[0]?.para).toBe('aluno@ic.ufal.br');
    expect(enviados[0]?.codigo).toMatch(/^\d{6}$/);
  });

  it('o banco guarda só o hash do código, válido por 10 minutos', async () => {
    await send('3');
    const antes = Date.now();
    await send('aluno@ufal.br');
    const codigo = enviados[0]?.codigo ?? '';

    const linha = await codigoGuardado();
    expect(linha?.telefoneHmac).toBe(H);
    expect(linha?.codigoHash).toBe(hashDoCodigo(H, codigo));
    expect(linha?.tentativas).toBe(0);
    const validade = (linha?.expiraEm.getTime() ?? 0) - antes;
    expect(validade).toBeGreaterThan(CODIGO_EXPIRA_MS - 5_000);
    expect(validade).toBeLessThanOrEqual(CODIGO_EXPIRA_MS + 5_000);
    expect(Object.values(linha ?? {})).not.toContain(codigo);
  });

  it('o código não aparece nas respostas nem nos dados da conversa', async () => {
    await send('3');
    const respostas = await send('aluno@ufal.br');
    const codigo = enviados[0]?.codigo ?? '';
    expect(textos(respostas)).not.toContain(codigo);
    // Valor por valor: um texto cifrado pode ter 6 dígitos seguidos por acaso.
    expect(Object.values(await dados())).not.toContain(codigo);
  });

  it('pedir de novo troca o código: só vale o último', async () => {
    await send('3');
    await send('aluno@ufal.br');
    await voltarNoTempo(REENVIO_APOS_MS);
    await send('menu');
    await send('3');
    await send('aluno@ufal.br');
    const ultimo = enviados.at(-1)?.codigo ?? '';
    expect(await db.select().from(codigosVerificacao)).toHaveLength(1);
    expect((await codigoGuardado())?.codigoHash).toBe(hashDoCodigo(H, ultimo));
  });

  it('se o envio falhar, avisa e pede o e-mail de novo', async () => {
    envioFunciona = false;
    await send('3');
    expect(await send('aluno@ufal.br')).toEqual([CODE_NOT_SENT_TEXT]);
    expect(await passo()).toBe('VERIFY_ASK_EMAIL');
    expect(await dados()).not.toHaveProperty('emailCifrado');

    envioFunciona = true;
    expect(await send('aluno@ufal.br')).toEqual([CODE_SENT_TEXT]);
    expect(await passo()).toBe('VERIFY_ASK_CODE');
  });

  it('sem serviço de e-mail configurado, avisa que não conseguiu enviar', async () => {
    email = undefined;
    await send('3');
    expect(await send('aluno@ufal.br')).toEqual([CODE_NOT_SENT_TEXT]);
    expect(await passo()).toBe('VERIFY_ASK_EMAIL');
    expect(await codigoGuardado()).toBeUndefined();
  });
});

describe('conferir o código, 5 tentativas e reenvio (SCRUM-136)', () => {
  it('código certo segue para o curso e não vale de novo', async () => {
    await pedirCodigo();
    expect(await send(ultimoCodigo())).toEqual([CODE_OK_TEXT, listaDeCursos()]);
    expect(await passo()).toBe('VERIFY_ASK_COURSE');
    expect(await codigoGuardado()).toBeUndefined();
  });

  it('aceita o código com espaço ou hífen no meio', async () => {
    await pedirCodigo();
    const codigo = ultimoCodigo();
    expect((await send(`${codigo.slice(0, 3)} ${codigo.slice(3)}`))[0]).toBe(CODE_OK_TEXT);
  });

  it('código errado gasta uma tentativa e diz quantas restam', async () => {
    await pedirCodigo();
    const errado = ultimoCodigo() === '000000' ? '111111' : '000000';
    expect(await send(errado)).toEqual([wrongCodeText(MAX_TENTATIVAS - 1)]);
    expect(await passo()).toBe('VERIFY_ASK_CODE');
    expect((await codigoGuardado())?.tentativas).toBe(1);
  });

  it('no quinto erro acabam as tentativas, e nem o código certo vale mais', async () => {
    await pedirCodigo();
    const certo = ultimoCodigo();
    const errado = certo === '000000' ? '111111' : '000000';
    for (let i = 1; i < MAX_TENTATIVAS; i++) await send(errado);
    expect(await send(errado)).toEqual([NO_ATTEMPTS_TEXT]);
    expect(await send(certo)).toEqual([NO_ATTEMPTS_TEXT]);
    expect(await passo()).toBe('VERIFY_ASK_CODE');
  });

  it('texto que não é código ou tamanho errado não gasta tentativa', async () => {
    await pedirCodigo();
    expect(await send('oi')).toEqual([CODE_HELP_TEXT]);
    expect(await send('12345')).toEqual([CODE_LENGTH_TEXT]);
    expect(await send('1234567')).toEqual([CODE_LENGTH_TEXT]);
    expect((await codigoGuardado())?.tentativas).toBe(0);
  });

  it('código vencido (10 min) não vale, mesmo certo', async () => {
    await pedirCodigo();
    await voltarNoTempo(CODIGO_EXPIRA_MS);
    expect(await send(ultimoCodigo())).toEqual([CODE_EXPIRED_TEXT]);
    expect(await passo()).toBe('VERIFY_ASK_CODE');
  });

  it('"reenviar" antes de 60 s pede para esperar e não envia', async () => {
    await pedirCodigo();
    await voltarNoTempo(20_000);
    const respostas = await send('reenviar');
    // Faltam ~40 s; o teste lento no Windows pode comer alguns segundos.
    expect(respostas).toHaveLength(1);
    expect(respostas[0]).toMatch(
      /^Acabei de enviar um código\. Espere (3\d|40) s para pedir outro\.$/,
    );
    expect(enviados).toHaveLength(1);
  });

  it('"reenviar" depois de 60 s manda outro código para o mesmo e-mail; só o novo vale', async () => {
    await pedirCodigo();
    const antigo = ultimoCodigo();
    await voltarNoTempo(REENVIO_APOS_MS);

    expect(await send('Reenviar!')).toEqual([CODE_RESENT_TEXT]);
    expect(enviados).toHaveLength(2);
    expect(enviados[1]?.para).toBe('aluno@ufal.br');
    const novo = ultimoCodigo();
    if (antigo !== novo) expect(await send(antigo)).toEqual([wrongCodeText(MAX_TENTATIVAS - 1)]);
    expect((await send(novo))[0]).toBe(CODE_OK_TEXT);
  });

  it('depois de esgotar as tentativas, o reenvio libera um código novo', async () => {
    await pedirCodigo();
    const errado = ultimoCodigo() === '000000' ? '111111' : '000000';
    for (let i = 0; i < MAX_TENTATIVAS; i++) await send(errado);
    await voltarNoTempo(REENVIO_APOS_MS);
    await send('não chegou');
    expect((await codigoGuardado())?.tentativas).toBe(0);
    expect((await send(ultimoCodigo()))[0]).toBe(CODE_OK_TEXT);
  });

  it('se o reenvio falhar, avisa e deixa tentar de novo na hora', async () => {
    await pedirCodigo();
    await voltarNoTempo(REENVIO_APOS_MS);
    envioFunciona = false;
    expect(await send('reenviar')).toEqual([RESEND_FAILED_TEXT]);
    expect(await codigoGuardado()).toBeUndefined();

    envioFunciona = true;
    expect(await send('reenviar')).toEqual([CODE_RESENT_TEXT]);
  });

  it('voltar e mandar o e-mail de novo antes de 60 s também espera', async () => {
    await pedirCodigo();
    await send('menu');
    await send('3');
    const respostas = await send('aluno@ufal.br');
    expect(respostas[0]).toMatch(/^Acabei de enviar um código\. Espere \d+ s/);
    expect(await passo()).toBe('VERIFY_ASK_EMAIL');
    expect(enviados).toHaveLength(1);
  });

  it('sem o e-mail na conversa, o reenvio pede o e-mail de novo', async () => {
    await store.save(H, 'VERIFY_ASK_CODE', {});
    expect(await send('reenviar')).toEqual([EMAIL_LOST_TEXT]);
    expect(await passo()).toBe('VERIFY_ASK_EMAIL');
  });
});

describe('vincular telefone e e-mail (SCRUM-137, RN01)', () => {
  const estudanteDe = async (phoneHmac: string) =>
    (await db.select().from(estudantes).where(eq(estudantes.telefoneHmac, phoneHmac)))[0];

  it('código certo cria o cadastro com o telefone e o e-mail, cifrados e com HMAC', async () => {
    await send('3');
    await send('Aluno@IC.ufal.br');
    expect(await send(ultimoCodigo())).toEqual([CODE_OK_TEXT, listaDeCursos()]);

    const estudante = await estudanteDe(H);
    expect(estudante?.emailHmac).toBe(hmac('aluno@ic.ufal.br'));
    expect(segredo.decifrar(estudante?.emailCifrado ?? '')).toBe('aluno@ic.ufal.br');
    expect(segredo.decifrar(estudante?.telefoneCifrado ?? '')).toBe(TELEFONE);
    // Verificado de vez só no fim da 2.4 (curso).
    expect(estudante?.verificadoEm).toBeNull();
    // O e-mail já está no cadastro: sai da conversa.
    expect(await dados()).not.toHaveProperty('emailCifrado');
  });

  it('e-mail já ligado a outro número: explica, pede outro e-mail e não mexe no outro', async () => {
    const OUTRO_TELEFONE = '5582988887777';
    const outro = hashPhone(OUTRO_TELEFONE, CHAVE);
    await sendDe(outro, segredo.cifrar(OUTRO_TELEFONE), 'oi');
    await sendDe(outro, segredo.cifrar(OUTRO_TELEFONE), '3');
    await sendDe(outro, segredo.cifrar(OUTRO_TELEFONE), 'aluno@ufal.br');
    await sendDe(outro, segredo.cifrar(OUTRO_TELEFONE), ultimoCodigo());
    const doOutro = await estudanteDe(outro);
    expect(doOutro?.emailHmac).toBe(hmac('aluno@ufal.br'));

    await pedirCodigo();
    expect(await send(ultimoCodigo())).toEqual([EMAIL_IN_USE_TEXT]);
    expect(await passo()).toBe('VERIFY_ASK_EMAIL');
    expect(await dados()).not.toHaveProperty('emailCifrado');
    expect(await estudanteDe(H)).toBeUndefined();
    expect(await estudanteDe(outro)).toEqual(doOutro);

    // Com outro e-mail, segue normalmente.
    expect(await send('outro.aluno@ufal.br')).toEqual([CODE_SENT_TEXT]);
    expect((await send(ultimoCodigo()))[0]).toBe(CODE_OK_TEXT);
    expect((await estudanteDe(H))?.emailHmac).toBe(hmac('outro.aluno@ufal.br'));
  });

  it('o aviso de e-mail em uso só vem depois do código: antes, o bot não revela nada', async () => {
    const OUTRO_TELEFONE = '5582988887777';
    const outro = hashPhone(OUTRO_TELEFONE, CHAVE);
    for (const t of ['oi', '3', 'aluno@ufal.br']) {
      await sendDe(outro, segredo.cifrar(OUTRO_TELEFONE), t);
    }
    await sendDe(outro, segredo.cifrar(OUTRO_TELEFONE), ultimoCodigo());

    await send('3');
    expect(await send('aluno@ufal.br')).toEqual([CODE_SENT_TEXT]);
  });

  it('sem o telefone cifrado ou o HMAC, não gasta o código e pede para tentar depois', async () => {
    await pedirCodigo();
    comIdentidade = false;
    expect(await send(ultimoCodigo())).toEqual([LINK_UNAVAILABLE_TEXT]);
    expect(await passo()).toBe('VERIFY_ASK_CODE');
    expect((await codigoGuardado())?.tentativas).toBe(0);

    comIdentidade = true;
    expect((await send(ultimoCodigo()))[0]).toBe(CODE_OK_TEXT);
  });

  it('sem o e-mail na conversa, não confere o código e pede o e-mail', async () => {
    await pedirCodigo();
    const codigo = ultimoCodigo();
    await store.save(H, 'VERIFY_ASK_CODE', {});
    expect(await send(codigo)).toEqual([EMAIL_LOST_TEXT]);
    expect(await passo()).toBe('VERIFY_ASK_EMAIL');
    expect(await codigoGuardado()).toBeDefined();
  });
});

describe('curso, verificado e pedido pendente (SCRUM-138)', () => {
  const estudante = async () =>
    (await db.select().from(estudantes).where(eq(estudantes.telefoneHmac, H)))[0];

  /** Do menu até a pergunta do curso. */
  async function ateOCurso() {
    await pedirCodigo();
    await send(ultimoCodigo());
  }

  it('o código certo mostra os cursos numa lista', async () => {
    await pedirCodigo();
    const [, listaEnviada] = await send(ultimoCodigo());
    expect(listaEnviada).toEqual(listaDeCursos());
    expect(listaDeCursos().linhas.map((l) => l.titulo)).toEqual([...CURSOS]);
    expect(await passo()).toBe('VERIFY_ASK_COURSE');
  });

  it('com mais de 10 cursos, a lista mostra 9 e pede para digitar o nome dos outros', () => {
    const muitos = Array.from({ length: 12 }, (_, i) => `Curso ${String(i + 1)}`);
    const mensagem = listaDeCursos(muitos);
    expect(mensagem.linhas).toHaveLength(9);
    expect(mensagem.corpo).toContain('escreva o nome dele');
    expect(listaDeCursos().corpo).not.toContain('escreva o nome dele');
  });

  it('escolher pela lista marca verificado com o curso e volta ao menu', async () => {
    await ateOCurso();
    expect(await send('curso:Ciência da Computação')).toEqual([VERIFIED_TEXT, MENU_TEXT]);
    expect(await passo()).toBe('MENU');
    const cadastro = await estudante();
    expect(cadastro?.curso).toBe('Ciência da Computação');
    expect(cadastro?.verificadoEm).toBeInstanceOf(Date);
    expect(cadastro?.saiuEm).toBeNull();
  });

  it('aceita o nome digitado, sem acento e em minúsculas, e grava o nome da lista', async () => {
    await ateOCurso();
    expect((await send('ciencia da computacao'))[0]).toBe(VERIFIED_TEXT);
    expect((await estudante())?.curso).toBe('Ciência da Computação');
  });

  it('curso fora da lista pergunta de novo e não verifica (o curso vai para o site)', async () => {
    await ateOCurso();
    expect(await send('Maria da Silva')).toEqual([COURSE_NOT_FOUND_TEXT, listaDeCursos()]);
    expect(await passo()).toBe('VERIFY_ASK_COURSE');
    expect(await estudante()).toMatchObject({ curso: null, verificadoEm: null });
  });

  it('quem veio da pauta nova segue para o título depois de verificado', async () => {
    expect(await send('2')).toEqual([VERIFY_FIRST_TEXT]);
    await send('aluno@ufal.br');
    await send(ultimoCodigo());
    expect(await send('curso:Direito')).toEqual([VERIFIED_TEXT, NEW_TITLE_TEXT]);
    expect(await passo()).toBe('NEW_ASK_TITLE');
    expect(await dados()).not.toHaveProperty('pendingCommand');
  });

  it('pedido de apoio fica guardado para a 2.7; por ora, volta ao menu', async () => {
    await ateOCurso();
    await store.save(H, 'VERIFY_ASK_COURSE', { pendingCommand: { kind: 'apoiar', id: 'p1' } });
    expect(await send('curso:Direito')).toEqual([VERIFIED_TEXT, MENU_TEXT]);
    expect(await dados()).toMatchObject({ pendingCommand: { kind: 'apoiar', id: 'p1' } });
  });

  it('quem veio do "Vou ajudar" (3.5) retoma o pedido depois de verificado', async () => {
    await ateOCurso();
    await store.save(H, 'VERIFY_ASK_COURSE', {
      pendingCommand: { kind: 'ajudar', id: 'pauta-sem-proposta' },
    });
    expect(await send('curso:Direito')).toEqual([VERIFIED_TEXT, NO_PROPOSAL_TEXT, MENU_TEXT]);
    expect(await dados()).not.toHaveProperty('pendingCommand');
  });

  it('quem já é verificado não refaz a verificação pelo menu', async () => {
    await ateOCurso();
    await send('curso:Direito');
    expect(await send('3')).toEqual([ALREADY_VERIFIED_TEXT]);
    expect(await passo()).toBe('MENU');
    expect(await send('verificar email')).toEqual([ALREADY_VERIFIED_TEXT]);
  });

  it('quem tinha saído pode se verificar de novo e volta a valer', async () => {
    await ateOCurso();
    await send('curso:Direito');
    await db.update(estudantes).set({ saiuEm: new Date() }).where(eq(estudantes.telefoneHmac, H));

    expect(await send('3')).toEqual([EMAIL_QUESTION_TEXT]);
    await send('aluno@ufal.br');
    await send(ultimoCodigo());
    expect((await send('curso:Pedagogia'))[0]).toBe(VERIFIED_TEXT);
    expect(await estudante()).toMatchObject({ curso: 'Pedagogia', saiuEm: null });
  });

  it('sem o vínculo do e-mail, refaz a parte do e-mail', async () => {
    await store.save(H, 'VERIFY_ASK_COURSE', {});
    expect(await send('curso:Direito')).toEqual([LINK_LOST_TEXT]);
    expect(await passo()).toBe('VERIFY_ASK_EMAIL');
  });
});
