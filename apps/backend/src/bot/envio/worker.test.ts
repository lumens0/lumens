import { disparos, eq, estudantes, type Db } from '@lumens/db';
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
 * Estudante com o endereço (telefone ou chat id) cifrado de verdade, e um aviso de meta batida
 * para ele na fila.
 */
async function avisoPara(telefone: string, telefoneCifrado = cifrar(telefone, chaves.cifra)) {
  const n = String(++seq);
  const [e] = await db
    .insert(estudantes)
    .values({ telefoneHmac: `t-${n}`, telefoneCifrado, verificadoEm: AGORA })
    .returning();
  if (e === undefined) throw new Error('estudante não criado');
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
      sender: whatsappAvisoSender(sender),
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

    // O mesmo corpo da Cloud API de antes do `AvisoSender`.
    expect(recebidas).toEqual([
      montarMensagemModelo(
        {
          tipo: 'meta_batida',
          aviso: 'pauta-1',
          modelo: 'lumens_meta_batida',
          parametros: ['Bebedouro', '120', 'bebedouro'],
        },
        '5582911110000',
      ),
    ]);
    expect(await linhaDe(a)).toMatchObject({ wamidHmac: hmacHex('wamid.A', chaves.hmac) });
    // No WhatsApp a entrega espera o webhook de status.
    expect(await linhaDe(a)).toMatchObject({ entregueEm: null });
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

describe('com CANAL_BOT=telegram', () => {
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

  const loteCom = (sender: EnvioDeps['sender'], limite = Number.MAX_SAFE_INTEGER) =>
    enviarLote({ db, sender, chaves, logger, limite, relogio: () => AGORA }, AGORA);

  it('manda para o chat id (o endereço do estudante), e o envio já vale como entrega', async () => {
    const t = await avisoPara('987654');
    const telegram = telegramFalso();

    expect(await loteCom(telegram.sender)).toEqual({
      enviados: 1,
      falhas: 0,
      adiados: 0,
      tomadosPorOutro: 0,
    });
    expect(telegram.recebidos[0]?.destino).toBe('987654');
    expect(telegram.recebidos[0]?.aviso.texto).toContain('A pauta "Bebedouro", que você apoiou');
    expect(await linhaDe(t)).toMatchObject({
      enviadoEm: AGORA,
      entregueEm: AGORA,
      falhouEm: null,
      wamidHmac: hmacHex('tg:987654:1', chaves.hmac),
    });
  });

  it('sem a cota da Meta, o lote sai inteiro', async () => {
    for (const chat of ['301', '302', '303']) await avisoPara(chat);
    const telegram = telegramFalso();
    expect((await loteCom(telegram.sender)).enviados).toBe(3);
    expect(telegram.recebidos.map((r) => r.destino).sort()).toEqual(['301', '302', '303']);
  });

  it('403 tira só aquele disparo da fila, de vez; o lote segue', async () => {
    const bloqueou = await avisoPara('401');
    const outro = await avisoPara('402');
    const telegram = telegramFalso([
      new ErroDeEnvio('Forbidden: bot was blocked by the user', 'telegram:403', true, false),
    ]);

    expect(await loteCom(telegram.sender)).toEqual({
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
    expect(await loteCom(telegramFalso().sender)).toMatchObject({ enviados: 0 });
  });

  it('erro que para o canal adia o resto do lote, sem marcar falha', async () => {
    const t1 = await avisoPara('501');
    const t2 = await avisoPara('502');
    const telegram = telegramFalso([new ErroDeEnvio('429', 'telegram:429', false, true)]);

    expect(await loteCom(telegram.sender)).toEqual({
      enviados: 0,
      falhas: 0,
      adiados: 2,
      tomadosPorOutro: 0,
    });
    expect(telegram.recebidos).toHaveLength(1);
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
        sender: whatsappAvisoSender(sender),
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
