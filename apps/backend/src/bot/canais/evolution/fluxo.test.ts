import type { Db } from '@lumens/db';
import { criarBancoEmMemoria } from '@lumens/db/teste';
import type { FastifyInstance } from 'fastify';
import { pino } from 'pino';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from '../../../app';
import type { Chaves } from '../../../cripto/cifra';
import {
  FakeQueue,
  mensagensNaFila,
  prepararFilaFalsa,
  respostasNaFila,
} from '../../../infra/queue.fake';
import { defaultHandlers, type HandlerRegistry } from '../../conversation/handlers';
import { PRIVACY_NOTICE_TEXT } from '../../conversation/privacidade';
import { lista } from '../../conversation/resposta';
import { ConversationStore } from '../../conversation/store';
import { evolutionTexto } from '../../sim/evolution';
import { processIncomingJob } from '../../worker';
import { criarCliente } from './cliente';
import { respostasPelaEvolution } from './respostas';
import { ROTA_DO_WEBHOOK } from './webhook';

/**
 * O caminho inteiro do canal da Evolution, com a conversa de verdade e o banco em memória: webhook
 * → fila de entrada → conversa → fila de saída → envio pela Evolution (só o HTTP é falso).
 */
const SEGREDO = 'f'.repeat(40);
const chaves: Chaves = { cifra: Buffer.alloc(32, 5), hmac: Buffer.alloc(32, 6) };
const PHONE = '5582977776666';

// A saudação manda uma lista; no menu, o handler devolve o que recebeu.
const handlers: HandlerRegistry = {
  ...defaultHandlers,
  GREETING: () => ({
    next: 'MENU',
    replies: [
      lista({
        corpo: 'Escolha:',
        botao: 'Opções',
        linhas: [
          { id: 'pauta:1', titulo: 'Bebedouro' },
          { id: 'pauta:2', titulo: 'Iluminação' },
        ],
      }),
    ],
  }),
  MENU: (ctx) => ({ next: 'MENU', replies: [`escolheu:${ctx.input.text}`] }),
};

describe('canal da Evolution de ponta a ponta (SCRUM-275)', () => {
  let app: FastifyInstance;
  let db: Db;
  let queue: FakeQueue;
  const enviados: { number: string; text: string }[] = [];
  const fetchDaEvolution: typeof fetch = (_url, init) => {
    enviados.push(JSON.parse(init?.body as string) as { number: string; text: string });
    return Promise.resolve(
      new Response(JSON.stringify({ key: { id: '3EB0OUT' } }), { status: 201 }),
    );
  };

  beforeEach(async () => {
    db = await criarBancoEmMemoria();
    await prepararFilaFalsa(db);
    queue = new FakeQueue();
    enviados.length = 0;
    app = await buildApp({
      db,
      queue,
      logger: pino({ level: 'silent' }),
      chaves,
      leitura: { origensCors: [], db },
      evolution: { segredo: SEGREDO },
    });
  }, 20_000);
  afterEach(async () => {
    await app.close();
  });

  /** A pessoa escreve; o bot processa e responde pela Evolution. */
  async function conversa(texto: string) {
    const antes = (await mensagensNaFila(db)).length;
    const res = await app.inject({
      method: 'POST',
      url: ROTA_DO_WEBHOOK,
      payload: evolutionTexto({ body: texto, from: PHONE }),
      headers: { authorization: `Bearer ${SEGREDO}` },
    });
    expect(res.statusCode).toBe(200);
    const job = (await mensagensNaFila(db))[antes];
    if (!job) throw new Error('a mensagem não entrou na fila');
    await processIncomingJob(
      { id: `job-${String(antes)}`, retryCount: 0, data: job.data },
      {
        db,
        store: new ConversationStore(db),
        queue,
        logger: pino({ level: 'silent' }),
        chaves,
        handlers,
        menusEmTexto: true,
      },
    );
    const saida = (await respostasNaFila(db)).at(-1);
    if (!saida) throw new Error('o bot não respondeu');
    const sender = respostasPelaEvolution(
      criarCliente({
        url: 'http://evolution:8080',
        apiKey: 'k',
        instancia: 'lumens',
        fetch: fetchDaEvolution,
      }),
      chaves,
    );
    const de = enviados.length;
    await sender.send(saida.data);
    return enviados.slice(de);
  }

  it('o menu sai numerado para o número de quem escreveu, e "2" escolhe a segunda opção', async () => {
    const primeiras = await conversa('oi');

    expect(primeiras.map((e) => e.number)).toEqual([PHONE, PHONE]);
    expect(primeiras[0]?.text).toBe(PRIVACY_NOTICE_TEXT);
    expect(primeiras[1]?.text).toContain('*2.* Iluminação');

    const escolha = await conversa('2');
    expect(escolha.map((e) => e.text)).toEqual(['escolheu:pauta:2']);
  });
});
