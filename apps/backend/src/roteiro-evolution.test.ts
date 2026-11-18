/**
 * Roteiro 1 pela entrada da Evolution (SCRUM-347 / SCRUM-275): o canal em uso na demonstração.
 * Os roteiros 1 a 3 simulam o webhook assinado da Meta; este passa pelo webhook da Evolution
 * (`Bearer`, payload `messages.upsert`), com os menus numerados ("2" em vez de tocar numa linha).
 *
 * A conversa é a de verdade (handlers padrão, banco em memória): oi → verificar o e-mail → código →
 * curso → relatar um problema. Só o HTTP da Evolution e o e-mail são falsos.
 */
import { criarBancoEmMemoria } from '@lumens/db/teste';
import type { FastifyInstance } from 'fastify';
import { pino } from 'pino';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from './app';
import { defaultHandlers } from './bot/conversation/handlers';
import { GREETING_TEXT, MENU_PRINCIPAL } from './bot/conversation/handlers';
import { REPORT_PROMPT_TEXT } from './bot/conversation/relato';
import { PRIVACY_NOTICE_TEXT } from './bot/conversation/privacidade';
import { PHOTO_ASK_TEXT } from './bot/conversation/nova-pauta';
import { NEW_TITLE_TEXT } from './bot/conversation/texto';
import { ConversationStore } from './bot/conversation/store';
import {
  CODE_OK_TEXT,
  CODE_SENT_TEXT,
  EMAIL_QUESTION_TEXT,
  VERIFIED_TEXT,
} from './bot/conversation/verificacao';
import { criarCliente } from './bot/canais/evolution/cliente';
import { respostasPelaEvolution } from './bot/canais/evolution/respostas';
import { ROTA_DO_WEBHOOK } from './bot/canais/evolution/webhook';
import { evolutionTexto } from './bot/sim/evolution';
import { renderizarEmTexto } from './bot/canais/menu-em-texto';
import { processIncomingJob } from './bot/worker';
import type { Chaves } from './cripto/cifra';
import type { ServicoDeEmail } from './email/codigo';
import { FakeQueue, mensagensNaFila, prepararFilaFalsa, respostasNaFila } from './infra/queue.fake';

const SEGREDO = 'e'.repeat(40);
const chaves: Chaves = { cifra: Buffer.alloc(32, 5), hmac: Buffer.alloc(32, 6) };
const TELEFONE = '5582988884444';
const EMAIL = 'dani.evolution@ufal.br';

describe('roteiro 1 pela entrada da Evolution', () => {
  let app: FastifyInstance;
  let db: Awaited<ReturnType<typeof criarBancoEmMemoria>>;
  let queue: FakeQueue;
  const enviados: { number: string; text: string }[] = [];
  const codigos = new Map<string, string>();
  const email: ServicoDeEmail = {
    enviarCodigo(para, codigo) {
      codigos.set(para, codigo);
      return Promise.resolve(true);
    },
  };
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

  /** A pessoa escreve pelo webhook da Evolution; devolve os textos que o bot mandou de volta. */
  async function escrever(texto: string): Promise<string[]> {
    const jobsAntes = (await mensagensNaFila(db)).length;
    const respostasAntes = (await respostasNaFila(db)).length;
    const res = await app.inject({
      method: 'POST',
      url: ROTA_DO_WEBHOOK,
      payload: evolutionTexto({ body: texto, from: TELEFONE }),
      headers: { authorization: `Bearer ${SEGREDO}` },
    });
    expect(res.statusCode).toBe(200);
    const job = (await mensagensNaFila(db))[jobsAntes];
    if (!job) throw new Error('a mensagem não entrou na fila');
    await processIncomingJob(
      { id: `job-${String(jobsAntes)}`, retryCount: 0, data: job.data },
      {
        db,
        store: new ConversationStore(db),
        queue,
        logger: pino({ level: 'silent' }),
        chaves,
        handlers: defaultHandlers,
        email,
        menusEmTexto: true,
      },
    );
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
    for (const saida of (await respostasNaFila(db)).slice(respostasAntes)) {
      await sender.send(saida.data);
    }
    const novos = enviados.slice(de);
    expect(novos.every((e) => e.number === TELEFONE)).toBe(true);
    return novos.map((e) => e.text);
  }

  it('oi, verificação por e-mail e relato, tudo por mensagens numeradas', async () => {
    expect(await escrever('oi')).toEqual([
      GREETING_TEXT,
      PRIVACY_NOTICE_TEXT,
      renderizarEmTexto(MENU_PRINCIPAL),
    ]);

    expect(await escrever('3')).toEqual([EMAIL_QUESTION_TEXT]);
    expect(await escrever(EMAIL)).toEqual([CODE_SENT_TEXT]);
    const codigo = codigos.get(EMAIL);
    expect(codigo).toMatch(/^\d+$/);

    const aposCodigo = await escrever(codigo ?? '');
    expect(aposCodigo[0]).toBe(CODE_OK_TEXT);
    // A lista de cursos sai como menu numerado, só com os primeiros; a pessoa responde com o número.
    const menuDeCursos = aposCodigo.at(-1) ?? '';
    const numeroDoCurso = /\*(\d+)\.\* Administração/.exec(menuDeCursos)?.[1];
    expect(numeroDoCurso).toBeDefined();
    expect(await escrever(numeroDoCurso ?? '')).toEqual([
      VERIFIED_TEXT,
      renderizarEmTexto(MENU_PRINCIPAL),
    ]);

    expect(await escrever('1')).toEqual([REPORT_PROMPT_TEXT]);
    const [semParecida] = await escrever('o bebedouro do bloco 18 está quebrado');
    expect(semParecida).toContain('Responda *sim* para criar uma pauta nova');
    expect(await escrever('sim')).toEqual([
      'Certo, vamos criar uma pauta nova com o seu relato.',
      NEW_TITLE_TEXT,
    ]);
    // SCRUM-365: o relato fala de bebedouro, então o bot sugere a categoria antes da foto.
    const [sugestao] = await escrever('Bebedouro quebrado no bloco 18');
    expect(sugestao).toContain('Parece ser Infraestrutura. Confirma?');
    expect(await escrever('1')).toEqual([
      'Vou usar o seu relato como descrição da pauta.',
      PHOTO_ASK_TEXT,
    ]);
  });
});
