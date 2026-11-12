import { chatsTelegram, disparos, estudantes, eq, type Db } from '@lumens/db';
import { criarBancoEmMemoria } from '@lumens/db/teste';
import { beforeEach, describe, expect, it } from 'vitest';
import type { TipoDisparo } from './envio';
import {
  RESERVA_EXPIRA_MS,
  enfileirarDisparos,
  registrarEntrega,
  registrarEnvio,
  registrarFalha,
  registrarFalhaDeEntrega,
  renovarReserva,
  reservarLote,
  type NovoAviso,
} from './fila';

const T0 = new Date('2026-11-02T12:00:00.000Z');
const depois = (ms: number) => new Date(T0.getTime() + ms);
const MINUTO = 60_000;
const HORA = 60 * MINUTO;

let db: Db;
let seq = 0;

beforeEach(async () => {
  db = await criarBancoEmMemoria();
});

/** Estudante; `'telegram'` também liga um chat do Telegram ao telefone dele. */
async function estudante(canal: 'whatsapp' | 'telegram' = 'whatsapp'): Promise<string> {
  const n = String(++seq);
  const [linha] = await db
    .insert(estudantes)
    .values({ telefoneHmac: `tel-${n}`, telefoneCifrado: `cifrado-${n}` })
    .returning({ id: estudantes.id });
  if (linha === undefined) throw new Error('estudante não criado');
  if (canal === 'telegram') {
    await db.insert(chatsTelegram).values({
      chatHmac: `chat-${n}`,
      chatCifrado: `chat-cifrado-${n}`,
      telefoneHmac: `tel-${n}`,
      telefoneCifrado: `cifrado-${n}`,
    });
  }
  return linha.id;
}

function aviso(tipo: TipoDisparo, estudanteId: string, avisoId = 'pauta-1'): NovoAviso {
  return { tipo, aviso: avisoId, estudanteId, modelo: `lumens_${tipo}`, parametros: ['Pauta'] };
}

const enfileirar = (avisos: NovoAviso[], agora = T0) =>
  db.transaction((tx) => enfileirarDisparos(tx, avisos, agora));
const reservar = (limite: number, agora: Date) =>
  db.transaction((tx) => reservarLote(tx, { limite, agora }));

/** Reserva um lote e registra todos como enviados, como faria quem envia. */
async function enviarLote(limite: number, agora: Date) {
  const lote = await reservar(limite, agora);
  for (const d of lote) {
    await db.transaction((tx) =>
      registrarEnvio(tx, { id: d.id, wamidHmac: `wamid-${d.id}`, agora }),
    );
  }
  return lote;
}

const resumo = (lote: { tipo: string; estudanteId: string }[]) =>
  lote.map((d) => `${d.tipo}:${d.estudanteId}`);

describe('enfileirarDisparos', () => {
  it('o mesmo aviso para a mesma pessoa entra uma vez só', async () => {
    const a = await estudante();

    expect(await enfileirar([aviso('meta_batida', a)])).toBe(1);
    expect(await enfileirar([aviso('meta_batida', a)])).toBe(0);

    expect(await db.select().from(disparos)).toHaveLength(1);
  });

  it('avisos diferentes para a mesma pessoa entram todos', async () => {
    const a = await estudante();

    const n = await enfileirar([
      aviso('meta_batida', a, 'pauta-1'),
      aviso('meta_batida', a, 'pauta-2'),
      aviso('lembrete', a, 'pauta-1'),
    ]);

    expect(n).toBe(3);
  });

  it('enfileirar de novo um aviso que já saiu não reenvia', async () => {
    const a = await estudante();
    await enfileirar([aviso('meta_batida', a)]);
    await enviarLote(10, T0);

    await enfileirar([aviso('meta_batida', a)], depois(2 * HORA));

    expect(await reservar(10, depois(30 * HORA))).toEqual([]);
  });

  it('guarda modelo e parâmetros para quem envia', async () => {
    const a = await estudante();
    await enfileirar([
      { ...aviso('conferencia', a), parametros: ['Bebedouro', '15/10/2026', 'trocar', '22/10'] },
    ]);

    const [reservado] = await reservar(10, T0);

    expect(reservado?.modelo).toBe('lumens_conferencia');
    expect(reservado?.parametros).toEqual(['Bebedouro', '15/10/2026', 'trocar', '22/10']);
  });

  it('parâmetro com quebra de linha ou espaços em sequência vira uma linha só', async () => {
    const a = await estudante();
    await enfileirar([
      { ...aviso('meta_batida', a), parametros: ['Bebedouro\nquebrado\t no  bloco 12 ', '120'] },
    ]);

    const [reservado] = await reservar(10, T0);

    expect(reservado?.parametros).toEqual(['Bebedouro quebrado no bloco 12', '120']);
  });
});

describe('reservarLote (RNF06)', () => {
  it('respeita o limite de pessoas e a prioridade', async () => {
    const [a, b, c] = [await estudante(), await estudante(), await estudante()];
    await enfileirar([aviso('meta_batida', a)], T0);
    await enfileirar([aviso('meta_batida', b)], depois(1000));
    await enfileirar([aviso('meta_batida', c)], depois(2000));
    await enfileirar([aviso('conferencia', c, 'promessa-1')], depois(MINUTO));

    const lote = await reservar(2, T0);

    // A conferência de C passa na frente; a meta batida de C sai de graça
    // porque C já entrou neste lote; B espera.
    expect(resumo(lote)).toEqual([`conferencia:${c}`, `meta_batida:${a}`, `meta_batida:${c}`]);
  });

  it('o que foi reservado não sai de novo no lote seguinte', async () => {
    const a = await estudante();
    await enfileirar([aviso('meta_batida', a)]);

    expect(await reservar(10, T0)).toHaveLength(1);
    expect(await reservar(10, depois(MINUTO))).toEqual([]);
  });

  describe('retomada', () => {
    it('reserva que não virou envio volta depois que vence', async () => {
      // O processo caiu entre reservar e chamar a Meta.
      const a = await estudante();
      await enfileirar([aviso('conferencia', a)]);
      const [primeiro] = await reservar(10, T0);

      expect(await reservar(10, depois(RESERVA_EXPIRA_MS - 1))).toEqual([]);

      const [retomado] = await reservar(10, depois(RESERVA_EXPIRA_MS + 1));
      expect(retomado?.id).toBe(primeiro?.id);
    });

    it('retomar não gasta vaga de novo: a pessoa já estava contada', async () => {
      const [a, b] = [await estudante(), await estudante()];
      await enfileirar([aviso('meta_batida', a)], T0);
      await enfileirar([aviso('meta_batida', b)], depois(1000));
      await reservar(1, T0);

      // Limite de 1, já ocupado por A. A reserva de A vence e ela volta de
      // graça; B continua esperando.
      const lote = await reservar(1, depois(RESERVA_EXPIRA_MS + 1));

      expect(resumo(lote)).toEqual([`meta_batida:${a}`]);
    });

    it('o que a Meta aceitou nunca volta, nem com a reserva vencida', async () => {
      const a = await estudante();
      await enfileirar([aviso('meta_batida', a)]);
      await enviarLote(10, T0);

      expect(await reservar(10, depois(2 * RESERVA_EXPIRA_MS))).toEqual([]);
    });

    it('o que falhou de vez sai da fila', async () => {
      const a = await estudante();
      await enfileirar([aviso('meta_batida', a)]);
      const [d] = await reservar(10, T0);

      await db.transaction((tx) =>
        registrarFalha(tx, { id: d?.id ?? '', motivo: '131026', agora: T0 }),
      );

      expect(await reservar(10, depois(2 * RESERVA_EXPIRA_MS))).toEqual([]);
      const [linha] = await db.select().from(disparos);
      expect(linha?.falha).toBe('131026');
    });
  });

  describe('canal do disparo (chat do Telegram)', () => {
    it('quem tem chat sai pelo Telegram, para o chat; quem não tem, pelo WhatsApp', async () => {
      const [w, t] = [await estudante(), await estudante('telegram')];
      await enfileirar([aviso('meta_batida', w), aviso('meta_batida', t)]);

      const lote = await reservar(10, T0);

      expect(lote.map((d) => [d.estudanteId, d.canal, d.telefoneCifrado])).toEqual([
        [w, 'whatsapp', expect.stringMatching(/^cifrado-/)],
        [t, 'telegram', expect.stringMatching(/^chat-cifrado-/)],
      ]);
      // O canal fica gravado na reserva.
      const canais = await db.select({ e: disparos.estudanteId, c: disparos.canal }).from(disparos);
      expect(Object.fromEntries(canais.map((l) => [l.e, l.c]))).toEqual({
        [w]: 'whatsapp',
        [t]: 'telegram',
      });
    });

    it('Telegram não configurado: quem tem chat recebe pelo WhatsApp, e gasta vaga', async () => {
      const t = await estudante('telegram');
      await enfileirar([aviso('meta_batida', t)]);

      const lote = await db.transaction((tx) =>
        reservarLote(tx, { limite: 10, agora: T0, canais: ['whatsapp'] }),
      );

      expect(lote.map((d) => [d.canal, d.telefoneCifrado])).toEqual([
        ['whatsapp', expect.stringMatching(/^cifrado-/)],
      ]);
      const [linha] = await db.select().from(disparos).where(eq(disparos.estudanteId, t));
      expect(linha?.canal).toBe('whatsapp');
    });

    it('quem está no Telegram sai sem cota e não ocupa vaga da Meta', async () => {
      const [w1, w2] = [await estudante(), await estudante()];
      const [t1, t2] = [await estudante('telegram'), await estudante('telegram')];
      await enfileirar([aviso('meta_batida', t1)], T0);
      await enfileirar([aviso('meta_batida', w1)], depois(1000));
      await enfileirar([aviso('meta_batida', t2)], depois(2000));
      await enfileirar([aviso('meta_batida', w2)], depois(3000));

      // Limite de 1: sai um do WhatsApp (o mais antigo) e todos do Telegram.
      expect(resumo(await enviarLote(1, T0)).sort()).toEqual(
        [`meta_batida:${w1}`, `meta_batida:${t1}`, `meta_batida:${t2}`].sort(),
      );

      // W2 continua esperando a cota, e o Telegram de novo sai na hora.
      await enfileirar([aviso('conferencia', t1, 'promessa-1')], depois(HORA));
      expect(resumo(await reservar(1, depois(2 * HORA)))).toEqual([`conferencia:${t1}`]);
    });

    it('envio pelo Telegram não conta nas 24h da Meta, mesmo que a pessoa perca o chat depois', async () => {
      const t = await estudante('telegram');
      await enfileirar([aviso('meta_batida', t)], T0);
      await enviarLote(1, T0);
      // Bloqueou o bot: o chat sai, e o próximo aviso dela iria pelo WhatsApp.
      await db.delete(chatsTelegram);

      const w = await estudante();
      await enfileirar([aviso('meta_batida', w)], depois(HORA));

      // Se o envio de T pelo Telegram contasse como alcançado, a única vaga estaria ocupada.
      expect(resumo(await reservar(1, depois(2 * HORA)))).toEqual([`meta_batida:${w}`]);
    });

    it('envio pelo WhatsApp conta nas 24h, mesmo que a pessoa ligue um chat depois', async () => {
      const a = await estudante();
      await enfileirar([aviso('meta_batida', a)], T0);
      await enviarLote(1, T0);
      await db.insert(chatsTelegram).values({
        chatHmac: 'chat-novo',
        chatCifrado: 'chat-cifrado-novo',
        telefoneHmac: (await db.select().from(estudantes).where(eq(estudantes.id, a)))[0]
          ?.telefoneHmac,
        telefoneCifrado: 'x',
      });

      const w = await estudante();
      await enfileirar([aviso('meta_batida', w)], depois(HORA));

      // A vaga de A continua ocupada até as 24h passarem.
      expect(resumo(await reservar(1, depois(2 * HORA)))).toEqual([]);
    });

    it('disparo de antes da coluna (canal nulo) conta como WhatsApp', async () => {
      const a = await estudante();
      await enfileirar([aviso('meta_batida', a)], T0);
      await enviarLote(1, T0);
      await db.update(disparos).set({ canal: null });

      const w = await estudante();
      await enfileirar([aviso('meta_batida', w)], depois(HORA));
      expect(resumo(await reservar(1, depois(2 * HORA)))).toEqual([]);
    });

    it('limite zerado não segura o Telegram', async () => {
      const t = await estudante('telegram');
      await enfileirar([aviso('conferencia', t)]);

      expect(resumo(await reservar(0, T0))).toEqual([`conferencia:${t}`]);
    });

    it('só reserva os canais pedidos; o resto espera sem reserva', async () => {
      const [w, t] = [await estudante(), await estudante('telegram')];
      await enfileirar([aviso('meta_batida', w), aviso('meta_batida', t)]);

      const soTelegram = await db.transaction((tx) =>
        reservarLote(tx, { limite: 10, agora: T0, canais: ['telegram'] }),
      );
      expect(resumo(soTelegram)).toEqual([`meta_batida:${t}`]);
      const [doWhatsapp] = await db.select().from(disparos).where(eq(disparos.estudanteId, w));
      expect(doWhatsapp?.reservadoEm).toBeNull();

      const nenhum = await db.transaction((tx) =>
        reservarLote(tx, { limite: 10, agora: T0, canais: [] }),
      );
      expect(nenhum).toEqual([]);
      expect(resumo(await reservar(10, depois(MINUTO)))).toEqual([`meta_batida:${w}`]);
    });
  });

  describe('janela móvel de 24h', () => {
    it('a vaga só volta 24h depois de usada, não à meia-noite', async () => {
      const [a, b] = [await estudante(), await estudante()];
      await enfileirar([aviso('meta_batida', a)], T0);
      await enfileirar([aviso('meta_batida', b)], depois(1000));
      await enviarLote(1, T0);

      // 12h depois já é outro dia em qualquer fuso do Brasil, e B ainda espera.
      expect(await reservar(1, depois(12 * HORA))).toEqual([]);
      expect(await reservar(1, depois(24 * HORA - MINUTO))).toEqual([]);

      const lote = await reservar(1, depois(24 * HORA + MINUTO));
      expect(resumo(lote)).toEqual([`meta_batida:${b}`]);
    });

    it('as 24h contam do envio quando ele sai depois da reserva', async () => {
      // Regressão: só a reserva contava. A reservada às 12h e aceita pela Meta
      // às 12h05 liberava a vaga às 12h01 do dia seguinte, quatro minutos
      // antes de a Meta deixar de contá-la.
      const [a, b] = [await estudante(), await estudante()];
      await enfileirar([aviso('meta_batida', a)], T0);
      await enfileirar([aviso('meta_batida', b)], depois(1000));
      const [reservado] = await reservar(1, T0);
      await db.transaction((tx) =>
        registrarEnvio(tx, {
          id: reservado?.id ?? '',
          wamidHmac: 'w-a',
          agora: depois(5 * MINUTO),
        }),
      );

      expect(await reservar(1, depois(24 * HORA + MINUTO))).toEqual([]);

      const lote = await reservar(1, depois(24 * HORA + 6 * MINUTO));
      expect(resumo(lote)).toEqual([`meta_batida:${b}`]);
    });

    it('segundo aviso para quem já recebeu nas 24h sai mesmo com o limite cheio', async () => {
      const [a, b] = [await estudante(), await estudante()];
      await enfileirar([aviso('meta_batida', a)]);
      await enviarLote(1, T0);

      await enfileirar([
        aviso('conferencia', a, 'promessa-1'),
        aviso('conferencia', b, 'promessa-1'),
      ]);
      const lote = await reservar(1, depois(HORA));

      expect(resumo(lote)).toEqual([`conferencia:${a}`]);
    });
  });
});

describe('registro de entrega', () => {
  async function umEnviado() {
    const a = await estudante();
    await enfileirar([aviso('resposta_oficial', a)]);
    const [d] = await reservar(10, T0);
    if (d === undefined) throw new Error('nada reservado');
    return d.id;
  }

  it('registrarEnvio vale uma vez só', async () => {
    const id = await umEnviado();

    const primeiro = await db.transaction((tx) =>
      registrarEnvio(tx, { id, wamidHmac: 'w-1', agora: T0 }),
    );
    const segundo = await db.transaction((tx) =>
      registrarEnvio(tx, { id, wamidHmac: 'w-2', agora: depois(MINUTO) }),
    );

    expect([primeiro, segundo]).toEqual([true, false]);
    const [linha] = await db.select().from(disparos).where(eq(disparos.id, id));
    expect(linha?.wamidHmac).toBe('w-1');
  });

  it('a entrega casa pelo wamid e guarda quando chegou', async () => {
    const id = await umEnviado();
    await db.transaction((tx) => registrarEnvio(tx, { id, wamidHmac: 'w-1', agora: T0 }));

    const entregue = await db.transaction((tx) =>
      registrarEntrega(tx, { wamidHmac: 'w-1', agora: depois(MINUTO) }),
    );

    expect(entregue).toBe(true);
    const [linha] = await db.select().from(disparos).where(eq(disparos.id, id));
    expect(linha?.entregueEm).toEqual(depois(MINUTO));
  });

  it('`read` depois de `delivered` não muda o instante da entrega', async () => {
    const id = await umEnviado();
    await db.transaction((tx) => registrarEnvio(tx, { id, wamidHmac: 'w-1', agora: T0 }));
    await db.transaction((tx) => registrarEntrega(tx, { wamidHmac: 'w-1', agora: depois(MINUTO) }));

    const denovo = await db.transaction((tx) =>
      registrarEntrega(tx, { wamidHmac: 'w-1', agora: depois(HORA) }),
    );

    expect(denovo).toBe(false);
    const [linha] = await db.select().from(disparos).where(eq(disparos.id, id));
    expect(linha?.entregueEm).toEqual(depois(MINUTO));
  });

  it('status de um wamid que ainda não foi registrado devolve false', async () => {
    // A Meta pode mandar o status antes de registrarEnvio confirmar.
    expect(
      await db.transaction((tx) => registrarEntrega(tx, { wamidHmac: 'desconhecido', agora: T0 })),
    ).toBe(false);
  });

  it('falha não sobrescreve um envio já registrado', async () => {
    const id = await umEnviado();
    await db.transaction((tx) => registrarEnvio(tx, { id, wamidHmac: 'w-1', agora: T0 }));

    const falhou = await db.transaction((tx) =>
      registrarFalha(tx, { id, motivo: 'tarde demais', agora: depois(MINUTO) }),
    );

    expect(falhou).toBe(false);
  });
});

describe('o que sai da fila sem ir para a Meta', () => {
  const DIA = 24 * HORA;

  it('o lote leva o telefone cifrado de cada destinatário', async () => {
    const a = await estudante();
    await enfileirar([aviso('meta_batida', a)]);

    const [d] = await reservar(10, T0);

    const [linha] = await db.select().from(estudantes).where(eq(estudantes.id, a));
    expect(d?.telefoneCifrado).toBe(linha?.telefoneCifrado);
  });

  it('quem saiu do sistema não recebe, e o motivo fica registrado', async () => {
    const [a, b] = [await estudante(), await estudante()];
    await enfileirar([aviso('meta_batida', a), aviso('meta_batida', b)]);
    await db.update(estudantes).set({ saiuEm: T0 }).where(eq(estudantes.id, a));

    const lote = await reservar(10, depois(MINUTO));

    expect(resumo(lote)).toEqual([`meta_batida:${b}`]);
    const [linha] = await db.select().from(disparos).where(eq(disparos.estudanteId, a));
    expect(linha?.falha).toBe('estudante_saiu');
  });

  it('aviso parado há mais de sete dias expira; lembrete não', async () => {
    const [a, b] = [await estudante(), await estudante()];
    await enfileirar([aviso('meta_batida', a), aviso('lembrete', b)], T0);

    const lote = await reservar(10, depois(7 * DIA + MINUTO));

    expect(resumo(lote)).toEqual([`lembrete:${b}`]);
    const [linha] = await db.select().from(disparos).where(eq(disparos.estudanteId, a));
    expect(linha?.falha).toBe('expirado');
  });
});

describe('falha de entrega', () => {
  async function umEnviado(wamidHmac: string) {
    const a = await estudante();
    await enfileirar([aviso('resposta_oficial', a)]);
    const [d] = await reservar(10, T0);
    await db.transaction((tx) => registrarEnvio(tx, { id: d?.id ?? '', wamidHmac, agora: T0 }));
    return d?.id ?? '';
  }

  it('o envio aceito que não chegou ganha a falha e continua como enviado', async () => {
    const id = await umEnviado('w-falha');

    const falhou = await db.transaction((tx) =>
      registrarFalhaDeEntrega(tx, {
        wamidHmac: 'w-falha',
        motivo: 'meta:131026',
        agora: depois(MINUTO),
      }),
    );

    expect(falhou).toBe(true);
    const [linha] = await db.select().from(disparos).where(eq(disparos.id, id));
    expect(linha).toMatchObject({ falha: 'meta:131026', enviadoEm: T0, entregueEm: null });
  });

  it('não marca falha em quem já recebeu', async () => {
    await umEnviado('w-ok');
    await db.transaction((tx) => registrarEntrega(tx, { wamidHmac: 'w-ok', agora: T0 }));

    const falhou = await db.transaction((tx) =>
      registrarFalhaDeEntrega(tx, { wamidHmac: 'w-ok', motivo: 'meta:131026', agora: T0 }),
    );

    expect(falhou).toBe(false);
  });
});

describe('renovarReserva', () => {
  it('quem reservou renova; a reserva fica valendo a partir de agora', async () => {
    const a = await estudante();
    await enfileirar([aviso('meta_batida', a)]);
    const [d] = await reservar(10, T0);
    if (d === undefined) throw new Error('nada reservado');

    const nova = await db.transaction((tx) =>
      renovarReserva(tx, { id: d.id, reservadoEm: d.reservadoEm, agora: depois(9 * MINUTO) }),
    );

    expect(nova).toEqual(depois(9 * MINUTO));
    // Renovada às 12h09, ela não vence às 12h10 como venceria a original.
    expect(await reservar(10, depois(RESERVA_EXPIRA_MS + MINUTO))).toEqual([]);
  });

  it('reserva vencida e tomada por outra instância não é mais de quem reservou primeiro', async () => {
    const a = await estudante();
    await enfileirar([aviso('meta_batida', a)]);
    const [primeira] = await reservar(10, T0);
    const [segunda] = await reservar(10, depois(RESERVA_EXPIRA_MS + MINUTO));
    if (primeira === undefined || segunda === undefined) throw new Error('nada reservado');

    const agora = depois(RESERVA_EXPIRA_MS + 2 * MINUTO);
    const daPrimeira = await db.transaction((tx) =>
      renovarReserva(tx, { id: primeira.id, reservadoEm: primeira.reservadoEm, agora }),
    );
    const daSegunda = await db.transaction((tx) =>
      renovarReserva(tx, { id: segunda.id, reservadoEm: segunda.reservadoEm, agora }),
    );

    expect([daPrimeira, daSegunda]).toEqual([null, agora]);
  });

  it('disparo que já saiu não é renovado', async () => {
    const a = await estudante();
    await enfileirar([aviso('meta_batida', a)]);
    const [d] = await reservar(10, T0);
    if (d === undefined) throw new Error('nada reservado');
    await db.transaction((tx) => registrarEnvio(tx, { id: d.id, wamidHmac: 'w', agora: T0 }));

    expect(
      await db.transaction((tx) =>
        renovarReserva(tx, { id: d.id, reservadoEm: d.reservadoEm, agora: depois(MINUTO) }),
      ),
    ).toBeNull();
  });
});
