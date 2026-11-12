import { chatsTelegram, disparos, eq, estudantes, type Db } from '@lumens/db';
import { criarBancoEmMemoria } from '@lumens/db/teste';
import { enfileirarDisparos, renovarReserva, reservarLote } from '@lumens/dominio';
import { beforeEach, describe, expect, it } from 'vitest';
import { cifrar, hmacHex, type Chaves } from '../../cripto/cifra';
import { criarLogger } from '../../infra/logger';
import type { AvisoRenderizado } from './aviso';
import { montarMensagemModelo, type MensagemModelo } from './mensagem-modelo';
import {
  ErroDaMeta,
  ErroDeEnvio,
  whatsappAvisoSender,
  type AvisoSender,
  type ModeloSender,
} from './sender';
import {
  enviarLote,
  type EnvioDeps,
  registerStatusWorker,
  registrarStatusDeEnvio,
  STATUS_QUEUE_OPTIONS,
} from './worker';

const chaves: Chaves = { cifra: Buffer.alloc(32, 1), hmac: Buffer.alloc(32, 2) };
const logger = criarLogger('silent');
const AGORA = new Date('2026-11-09T15:00:00.000Z');

let db: Db;
let seq = 0;

beforeEach(async () => {
  db = await criarBancoEmMemoria();
}, 30_000);

/**
 * Estudante com telefone cifrado de verdade, e um aviso de meta batida para ele na fila. Com
 * `chat`, o telefone também está ligado a um chat do Telegram (o contato foi compartilhado).
 */
async function avisoPara(
  telefone: string,
  telefoneCifrado = cifrar(telefone, chaves.cifra),
  chat?: string,
) {
  const n = String(++seq);
  const [e] = await db
    .insert(estudantes)
    .values({ telefoneHmac: `t-${n}`, telefoneCifrado, verificadoEm: AGORA })
    .returning();
  if (e === undefined) throw new Error('estudante não criado');
  if (chat !== undefined) {
    await db.insert(chatsTelegram).values({
      chatHmac: `chat-${n}`,
      chatCifrado: cifrar(chat, chaves.cifra),
      telefoneHmac: `t-${n}`,
      telefoneCifrado,
    });
  }
  await db.transaction((tx) =>
    enfileirarDisparos(
      tx,
      [
        {
          tipo: 'meta_batida',
          aviso: 'pauta-1',
          estudanteId: e.id,
          modelo: 'lumens_meta_batida',
          parametros: ['Bebedouro', '120', 'bebedouro'],
        },
      ],
      new Date(AGORA.getTime() + seq),
    ),
  );
  return e.id;
}

/** Sender falso: responde pela ordem de `respostas` (wamid ou erro) e guarda o que recebeu. */
function senderFalso(respostas: (string | Error)[]) {
  const recebidas: MensagemModelo[] = [];
  const sender: ModeloSender = {
    enviar: (mensagem) => {
      recebidas.push(mensagem);
      const r = respostas.shift() ?? 'wamid.X';
      return r instanceof Error ? Promise.reject(r) : Promise.resolve({ wamid: r });
    },
  };
  return { sender, recebidas };
}

const linhaDe = async (estudanteId: string) =>
  (await db.select().from(disparos).where(eq(disparos.estudanteId, estudanteId)))[0];

const lote = (sender: ModeloSender, limite = 250) =>
  enviarLote(
    {
      db,
      senders: { whatsapp: whatsappAvisoSender(sender) },
      chaves,
      logger,
      limite,
      relogio: () => AGORA,
    },
    AGORA,
  );

describe('enviarLote (SCRUM-208)', () => {
  it('manda para o telefone decifrado e grava o envio com o HMAC do wamid', async () => {
    const a = await avisoPara('5582911110000');
    const { sender, recebidas } = senderFalso(['wamid.A']);

    expect(await lote(sender)).toEqual({ enviados: 1, falhas: 0, adiados: 0, tomadosPorOutro: 0 });

    expect(recebidas[0]?.to).toBe('5582911110000');
    expect(await linhaDe(a)).toMatchObject({ wamidHmac: hmacHex('wamid.A', chaves.hmac) });
    expect((await linhaDe(a))?.enviadoEm).not.toBeNull();
  });

  it('respeita o limite de pessoas', async () => {
    await avisoPara('5582900000001');
    await avisoPara('5582900000002');
    const { sender, recebidas } = senderFalso([]);

    await lote(sender, 1);

    expect(recebidas).toHaveLength(1);
  });

  it('erro permanente tira o disparo da fila com o código da Meta, e o lote segue', async () => {
    const a = await avisoPara('5582900000003');
    const b = await avisoPara('5582900000004');
    const { sender } = senderFalso([new ErroDaMeta(131026, 'não entregável'), 'wamid.B']);

    expect(await lote(sender)).toEqual({ enviados: 1, falhas: 1, adiados: 0, tomadosPorOutro: 0 });
    expect((await linhaDe(a))?.falha).toBe('meta:131026');
    expect((await linhaDe(b))?.enviadoEm).not.toBeNull();
  });

  it('erro que vale para o lote para tudo; nada é marcado como falha', async () => {
    const a = await avisoPara('5582900000005');
    const b = await avisoPara('5582900000006');
    const { sender, recebidas } = senderFalso([new ErroDaMeta(130429, 'limite de vazão')]);

    expect(await lote(sender)).toEqual({ enviados: 0, falhas: 0, adiados: 2, tomadosPorOutro: 0 });
    expect(recebidas).toHaveLength(1);
    for (const id of [a, b])
      expect(await linhaDe(id)).toMatchObject({ falha: null, enviadoEm: null });
  });

  it('modelo ainda não aprovado adia só aquele disparo', async () => {
    await avisoPara('5582900000007');
    await avisoPara('5582900000008');
    const { sender, recebidas } = senderFalso([new ErroDaMeta(132001, 'modelo não existe')]);

    expect(await lote(sender)).toEqual({ enviados: 1, falhas: 0, adiados: 1, tomadosPorOutro: 0 });
    expect(recebidas).toHaveLength(2);
  });

  it('telefone que não decifra sai da fila sem chamar a Meta', async () => {
    const a = await avisoPara('', 'cifrado-de-mentira');
    const { sender, recebidas } = senderFalso([]);

    expect(await lote(sender)).toEqual({ enviados: 0, falhas: 1, adiados: 0, tomadosPorOutro: 0 });
    expect(recebidas).toHaveLength(0);
    expect((await linhaDe(a))?.falha).toBe('telefone_ilegivel');
  });
});

describe('um sender por canal (Telegram)', () => {
  /** Telegram falso: responde pela ordem de `respostas` (id ou erro) e guarda o que recebeu. */
  function telegramFalso(respostas: (string | Error)[] = []) {
    const recebidos: { aviso: AvisoRenderizado; destino: string }[] = [];
    const sender: AvisoSender = {
      enviar: (aviso, destino) => {
        recebidos.push({ aviso, destino });
        const r = respostas.shift() ?? `tg:${destino}:1`;
        return r instanceof Error ? Promise.reject(r) : Promise.resolve({ id: r, entregue: true });
      },
    };
    return { sender, recebidos };
  }

  const loteCom = (senders: EnvioDeps['senders'], limite = 250) =>
    enviarLote({ db, senders, chaves, logger, limite, relogio: () => AGORA }, AGORA);

  it('cada estudante recebe pelo seu canal; o WhatsApp recebe o mesmo corpo da Cloud API', async () => {
    const w = await avisoPara('5582900000101');
    const t = await avisoPara('5582900987654', undefined, '987654');
    const whatsapp = senderFalso(['wamid.W']);
    const telegram = telegramFalso();

    const resultado = await loteCom({
      whatsapp: whatsappAvisoSender(whatsapp.sender),
      telegram: telegram.sender,
    });

    expect(resultado).toEqual({ enviados: 2, falhas: 0, adiados: 0, tomadosPorOutro: 0 });
    expect(whatsapp.recebidas).toEqual([
      montarMensagemModelo(
        {
          tipo: 'meta_batida',
          aviso: 'pauta-1',
          modelo: 'lumens_meta_batida',
          parametros: ['Bebedouro', '120', 'bebedouro'],
        },
        '5582900000101',
      ),
    ]);
    expect(telegram.recebidos).toHaveLength(1);
    expect(telegram.recebidos[0]?.destino).toBe('987654');
    expect(telegram.recebidos[0]?.aviso.texto).toContain('A pauta "Bebedouro", que você apoiou');

    // Registro: no WhatsApp a entrega espera o webhook; no Telegram o envio já é a entrega.
    const linhaW = await linhaDe(w);
    expect(linhaW?.enviadoEm).not.toBeNull();
    expect(linhaW?.entregueEm).toBeNull();
    const linhaT = await linhaDe(t);
    expect(linhaT).toMatchObject({
      enviadoEm: AGORA,
      entregueEm: AGORA,
      falhouEm: null,
      wamidHmac: hmacHex('tg:987654:1', chaves.hmac),
    });
  });

  it('Telegram não configurado: quem tem chat recebe pelo WhatsApp, no telefone', async () => {
    const t = await avisoPara('5582900000111', undefined, '111');
    const w = await avisoPara('5582900000102');
    const whatsapp = senderFalso(['wamid.A', 'wamid.B']);

    expect(await loteCom({ whatsapp: whatsappAvisoSender(whatsapp.sender) })).toEqual({
      enviados: 2,
      falhas: 0,
      adiados: 0,
      tomadosPorOutro: 0,
    });
    expect(whatsapp.recebidas.map((m) => m.to).sort()).toEqual(['5582900000102', '5582900000111']);
    for (const id of [t, w]) expect(await linhaDe(id)).toMatchObject({ canal: 'whatsapp' });
  });

  it('só o Telegram configurado: o worker anda sem a Meta', async () => {
    await avisoPara('5582900000222', undefined, '222');
    const w = await avisoPara('5582900000103');

    expect((await loteCom({ telegram: telegramFalso().sender })).enviados).toBe(1);
    expect(await linhaDe(w)).toMatchObject({ enviadoEm: null, falhouEm: null });
  });

  it('quem está no Telegram não gasta nem espera pela cota da Meta', async () => {
    const t1 = await avisoPara('5582900000301', undefined, '301');
    const t2 = await avisoPara('5582900000302', undefined, '302');
    const w1 = await avisoPara('5582900000104');
    const w2 = await avisoPara('5582900000105');
    const whatsapp = senderFalso([]);
    const telegram = telegramFalso();
    const senders = { whatsapp: whatsappAvisoSender(whatsapp.sender), telegram: telegram.sender };

    // Cota de uma pessoa: sai um do WhatsApp e os dois do Telegram.
    expect((await loteCom(senders, 1)).enviados).toBe(3);
    expect(telegram.recebidos.map((r) => r.destino).sort()).toEqual(['301', '302']);
    for (const id of [t1, t2]) expect((await linhaDe(id))?.enviadoEm).not.toBeNull();
    const doWhatsapp = [await linhaDe(w1), await linhaDe(w2)];
    expect(doWhatsapp.filter((l) => l?.enviadoEm !== null)).toHaveLength(1);
  });

  it('403 tira só aquele disparo da fila, de vez; o lote segue', async () => {
    const bloqueou = await avisoPara('5582900000401', undefined, '401');
    const outro = await avisoPara('5582900000402', undefined, '402');
    const telegram = telegramFalso([
      new ErroDeEnvio('Forbidden: bot was blocked by the user', 'telegram:403', true, false, true),
    ]);

    expect(await loteCom({ telegram: telegram.sender })).toEqual({
      enviados: 1,
      falhas: 1,
      adiados: 0,
      tomadosPorOutro: 0,
    });
    // "Avisado" para a SCRUM-239 é enviado OU falhou: o 403 conta, e não volta para a fila.
    expect(await linhaDe(bloqueou)).toMatchObject({
      falha: 'telegram:403',
      enviadoEm: null,
      entregueEm: null,
    });
    expect((await linhaDe(bloqueou))?.falhouEm).not.toBeNull();
    expect((await linhaDe(outro))?.enviadoEm).not.toBeNull();
    expect(await loteCom({ telegram: telegramFalso().sender })).toMatchObject({ enviados: 0 });
  });

  it('403 apaga o chat: o próximo aviso da pessoa vai pelo WhatsApp', async () => {
    const bloqueou = await avisoPara('5582900000403', undefined, '403');
    const outro = await avisoPara('5582900000404', undefined, '404');
    const whatsapp = senderFalso([]);
    const senders = {
      whatsapp: whatsappAvisoSender(whatsapp.sender),
      telegram: telegramFalso([
        new ErroDeEnvio(
          'Forbidden: bot was blocked by the user',
          'telegram:403',
          true,
          false,
          true,
        ),
      ]).sender,
    };

    await loteCom(senders);
    const chats = await db.select({ chat: chatsTelegram.telefoneHmac }).from(chatsTelegram);
    expect(chats).toHaveLength(1);
    expect((await linhaDe(outro))?.canal).toBe('telegram');

    // Um aviso novo para quem bloqueou sai pelo WhatsApp, para o telefone.
    await db.transaction((tx) =>
      enfileirarDisparos(tx, [
        {
          tipo: 'meta_batida',
          aviso: 'pauta-2',
          estudanteId: bloqueou,
          modelo: 'lumens_meta_batida',
          parametros: ['Bebedouro', '120', 'bebedouro'],
        },
      ]),
    );
    expect((await loteCom(senders)).enviados).toBe(1);
    expect(whatsapp.recebidas.map((m) => m.to)).toEqual(['5582900000403']);
  });

  it('400 (e outra falha permanente) não apaga o chat', async () => {
    await avisoPara('5582900000405', undefined, '405');
    const telegram = telegramFalso([
      new ErroDeEnvio('Bad Request: message is too long', 'telegram:400', true, false),
    ]);

    expect((await loteCom({ telegram: telegram.sender })).falhas).toBe(1);
    expect(await db.select().from(chatsTelegram)).toHaveLength(1);
  });

  it('erro que para o Telegram não para o WhatsApp do mesmo lote', async () => {
    const t1 = await avisoPara('5582900000501', undefined, '501');
    const t2 = await avisoPara('5582900000502', undefined, '502');
    const w = await avisoPara('5582900000106');
    const telegram = telegramFalso([new ErroDeEnvio('429', 'telegram:429', false, true)]);

    const resultado = await loteCom({
      whatsapp: whatsappAvisoSender(senderFalso([]).sender),
      telegram: telegram.sender,
    });

    expect(resultado).toEqual({ enviados: 1, falhas: 0, adiados: 2, tomadosPorOutro: 0 });
    expect(telegram.recebidos).toHaveLength(1);
    expect((await linhaDe(w))?.enviadoEm).not.toBeNull();
    for (const id of [t1, t2])
      expect(await linhaDe(id)).toMatchObject({ falha: null, enviadoEm: null });
  });
});

describe('duas instâncias com um lote mais longo que a reserva', () => {
  it('a reserva que venceu e foi tomada por outra não é mandada de novo', async () => {
    const MINUTO = 60_000;
    await avisoPara('5582900000011');
    await avisoPara('5582900000012');
    let agora = AGORA;
    const daOutra: { id: string; reservadoEm: Date }[] = [];

    // A instância A reserva os dois às 12h. O primeiro envio demora: quando ele volta, já passou
    // dos dez minutos, e a instância B pega o que estava reservado por A.
    const sender: ModeloSender = {
      enviar: async () => {
        if (daOutra.length === 0) {
          agora = new Date(AGORA.getTime() + 11 * MINUTO);
          daOutra.push(...(await db.transaction((tx) => reservarLote(tx, { limite: 250, agora }))));
        }
        return { wamid: `wamid.${String(daOutra.length)}.${agora.toISOString()}` };
      },
    };

    const resultado = await enviarLote(
      {
        db,
        senders: { whatsapp: whatsappAvisoSender(sender) },
        chaves,
        logger,
        limite: 250,
        relogio: () => agora,
      },
      AGORA,
    );

    // A mandou o primeiro (renovou a reserva antes) e pulou o segundo, que agora é de B.
    expect(resultado).toEqual({ enviados: 1, falhas: 0, adiados: 0, tomadosPorOutro: 1 });
    // B pegou os dois, mas o primeiro já saiu por A: B também não o manda de novo.
    const posses = await Promise.all(
      daOutra.map((d) =>
        db.transaction((tx) => renovarReserva(tx, { id: d.id, reservadoEm: d.reservadoEm, agora })),
      ),
    );
    expect(posses.filter((p) => p !== null)).toHaveLength(1);
  });
});

describe('registro de entrega (SCRUM-209)', () => {
  async function enviadoComo(wamid: string) {
    const a = await avisoPara(`55829${String(++seq).padStart(8, '0')}`);
    await lote(senderFalso([wamid]).sender);
    return a;
  }

  it('delivered grava a entrega no instante que a Meta informou', async () => {
    const a = await enviadoComo('wamid.E1');

    const achou = await registrarStatusDeEnvio(db, {
      wamidHmac: hmacHex('wamid.E1', chaves.hmac),
      status: 'delivered',
      timestamp: '1794000000',
    });

    expect(achou).toBe(true);
    expect((await linhaDe(a))?.entregueEm).toEqual(new Date(1_794_000_000_000));
  });

  it('failed grava a falha de entrega com o código da Meta', async () => {
    const a = await enviadoComo('wamid.F1');

    await registrarStatusDeEnvio(db, {
      wamidHmac: hmacHex('wamid.F1', chaves.hmac),
      status: 'failed',
      timestamp: '1794000000',
      codigoErro: 131026,
    });

    expect(await linhaDe(a)).toMatchObject({ falha: 'meta:131026', entregueEm: null });
  });

  describe('worker de status', () => {
    async function handlerRegistrado() {
      let handler: ((jobs: unknown[]) => Promise<unknown>) | undefined;
      const boss = {
        getQueue: () => Promise.resolve(null),
        createQueue: () => Promise.resolve(),
        schedule: () => Promise.resolve(),
        work: (_n: string, h: (jobs: unknown[]) => Promise<unknown>) => {
          handler = h;
          return Promise.resolve('w');
        },
      };
      await registerStatusWorker(boss as unknown as Parameters<typeof registerStatusWorker>[0], {
        db,
        logger,
      });
      if (handler === undefined) throw new Error('worker não registrado');
      return handler;
    }

    const job = (retryCount: number) => ({
      id: 'j',
      retryCount,
      data: { wamidHmac: 'nao-e-disparo', status: 'delivered', timestamp: '1794000000' },
    });

    it('status sem disparo ainda é tentado de novo uma vez (o envio pode não ter gravado)', async () => {
      const handler = await handlerRegistrado();

      await expect(handler([job(0)])).rejects.toThrow(/sem disparo/);
    });

    it('na última tentativa desiste em silêncio: é status de mensagem que não é aviso', async () => {
      const handler = await handlerRegistrado();

      await expect(handler([job(STATUS_QUEUE_OPTIONS.retryLimit)])).resolves.toBeUndefined();
    });
  });
});
