import { codigosVerificacao, conversas, type Db } from '@lumens/db';
import { CODIGO_EXPIRA_MS, MAX_TENTATIVAS, REENVIO_APOS_MS, hashDoCodigo } from '@lumens/dominio';
import { criarBancoEmMemoria } from '@lumens/db/teste';
import { beforeEach, describe, expect, it } from 'vitest';
import { segredoCom } from '../../cripto';
import type { ServicoDeEmail } from '../../email/codigo';
import { MENU_TEXT } from './handlers';
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
  COURSE_PENDING_TEXT,
  EMAIL_FORMAT_TEXT,
  EMAIL_LOST_TEXT,
  EMAIL_MANY_TEXT,
  EMAIL_MISSING_TEXT,
  EMAIL_NOT_UFAL_TEXT,
  EMAIL_QUESTION_TEXT,
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

const send = (text: string) =>
  handleIncoming({ phoneHmac: H, text }, { store, db, segredo, ...(email ? { email } : {}) });
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
    expect(await send(ultimoCodigo())).toEqual([CODE_OK_TEXT, COURSE_PENDING_TEXT]);
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
