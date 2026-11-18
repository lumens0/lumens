/**
 * Roteiro 3 de ponta a ponta (SCRUM-119 / SCRUM-347): a resposta oficial chega, vira promessa, os
 * apoiadores conferem e a pauta vira conquista.
 *
 * Continua a pauta do roteiro 2, mas roda sozinho: a fixture monta pelo domínio o estado do fim
 * dele (pauta criada pela responsável e aprovada pela curadoria, apoiadores verificados até a
 * meta, protocolo do Fala.BR registrado e dois relatos pendentes). Daí em diante, cada passo entra por onde entra em
 * produção: o bot pelo webhook simulado da Meta, a curadoria pelas funções que o painel chama, o
 * agendador por `rodarGatilhos` com o `agora` adiantado, e os avisos pelo worker de envio com um
 * sender falso. Nada usa rede: o PDF é "baixado" de uma função falsa e vai para um storage em
 * memória.
 *
 * Banco Postgres temporário, com o login restrito da aplicação (`lumens_app`) e, na API de
 * leitura, o do site (`lumens_site`), como em produção.
 */
import {
  blocos,
  criarDb,
  criarPool,
  curadores,
  disparos,
  documentosResposta,
  eq,
  estudantes,
  eventos,
  pautas,
  promessas,
  relatos,
  respostasConferencia,
  type Db,
} from '@lumens/db';
import { criarBancoTemporario } from '@lumens/db/teste';
import {
  abrirCaminho,
  adicionarRelato,
  aprovarPauta,
  detalharPautaDaCuradoria,
  aprovarRelato,
  criarPauta,
  diaEmMaceio,
  formatarDia,
  listarLinhaDoTempo,
  recusarRelato,
  registrarApoio,
  registrarPromessa,
  registrarProtocolo,
  registrarRespostaConferencia,
} from '@lumens/dominio';
import type { FastifyInstance } from 'fastify';
import type { PgBoss } from 'pg-boss';
import { pino } from 'pino';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { rodarGatilhos } from './agendador/gatilhos';
import { buildApp } from './app';
import { RESPONSE_BUTTON_ID } from './bot/conversation/minhas-pautas';
import { hashPhone } from './bot/conversation/phone';
import { ASK_PDF_TEXT, PDF_RECEIVED_TEXT } from './bot/conversation/resposta-oficial';
import type { Resposta } from './bot/conversation/resposta';
import { ConversationStore } from './bot/conversation/store';
import type { AvisoRenderizado } from './bot/envio/aviso';
import type { AvisoSender } from './bot/envio/sender';
import { enviarLote } from './bot/envio/worker';
import { buildButtonReply, buildTextMessage, randomWamid, wrapPayload } from './bot/sim/payloads';
import { signPayload } from './bot/sim/send';
import type { MetaMessage } from './bot/whatsapp/types';
import { registerIncomingWorker, registerReplyWorker, respostasDoJob } from './bot/worker';
import { cifrar, decifrar, type Chaves } from './cripto/cifra';
import { criarServicoDeRespostas } from './fotos/resposta-pdf';
import type { Storage } from './fotos/storage';
import { criarPgBossRuntime } from './infra/pg-boss';
import { filaPgBoss } from './infra/queue';

const URL_TESTE = process.env.DATABASE_URL_TESTE;
const URL_APLICACAO = process.env.DATABASE_URL;
/** Login do site (`lumens_site`). Sem ele (só fora do CI), a API de leitura usa o da aplicação. */
const URL_LEITURA = process.env.DATABASE_URL_LEITURA;
if (!URL_TESTE && process.env.CI) throw new Error('No CI, defina DATABASE_URL_TESTE.');
if (!URL_APLICACAO && process.env.CI) throw new Error('No CI, defina DATABASE_URL.');
if (!URL_LEITURA && process.env.CI) throw new Error('No CI, defina DATABASE_URL_LEITURA.');

const SEGREDO_DA_META = 'segredo-do-roteiro-3';
const chaves: Chaves = { cifra: Buffer.alloc(32, 5), hmac: Buffer.alloc(32, 6) };
const logger = pino({ level: 'silent' });
const MS_POR_DIA = 86_400_000;

/**
 * Um telefone por pessoa. A responsável criou a pauta; os três apoiadores são os que relatam e
 * respondem a conferência. Os outros apoios só completam a meta (30, o piso da RN04).
 */
const TELEFONE_DA_RESPONSAVEL = '5582977770001';
const TELEFONES_DOS_APOIADORES = ['5582977770011', '5582977770012', '5582977770013'] as const;

const PAUTA = {
  titulo: 'Iluminação no estacionamento do CECA',
  descricao: 'Trocar as lâmpadas queimadas do estacionamento e manter a manutenção em dia.',
};
const RELATO_APROVADO = 'Saio da aula às 22h e o estacionamento fica todo escuro.';
const RELATO_RECUSADO = 'Liga pra mim no 82 98888-1234 que eu conto tudo.';
const FONTE = 'Superintendência de Infraestrutura';
const PDF = Buffer.from('%PDF-1.7\n1 0 obj\n<<>>\nendobj\n%%EOF', 'ascii');

let db: Db;

/** O que o formulário de aprovação manda: a foto de cada relato pendente que a tela mostra. */
async function fotosDaTela(banco: Db, pautaId: string) {
  const detalhe = await detalharPautaDaCuradoria(banco, pautaId);
  return Object.fromEntries(
    (detalhe?.relatos ?? [])
      .filter(({ moderacao }) => moderacao === 'pendente')
      .map(({ id, fotoChave }) => [id, fotoChave]),
  );
}
// Opcionais: se o beforeAll falhar no meio, o afterAll fecha só o que chegou a abrir.
let pool: ReturnType<typeof criarPool> | undefined;
let poolLeitura: ReturnType<typeof criarPool> | undefined;
let boss: PgBoss | undefined;
let app: FastifyInstance;
let apagarBanco: (() => Promise<void>) | undefined;
/** Conexão de administrador do banco temporário: só para montar a fixture e conferir. */
let admin: Db;
let poolAdmin: ReturnType<typeof criarPool> | undefined;

let pautaId: string;
/** Slug e meta vêm de `criarPauta`: o slug leva o id da pauta, a meta sai do bloco. */
let slug: string;
let meta: number;
let curadorId: string;
let responsavelId: string;
const apoiadoresIds: string[] = [];
let caminhoId: string;
let relatoDaCriacao: string;
let relatoParaAprovar: string;
let relatoParaRecusar: string;
let promessaId: string;
let abreEm: Date;
let fechaEm: Date;
/** Botões do "Foi feito?" que o aviso levou a cada apoiador, como o sender falso recebeu. */
const botoesDaConferencia = new Map<string, AvisoRenderizado['botoes']>();
/** A data prometida é hoje (Maceió): a conferência já está na janela para quem responde agora. */
const dataEntrega = diaEmMaceio(new Date());
/** Sem a data de propósito: ela tem de chegar aos apoiadores pelo aviso, não pelo que a curadoria escreve. */
const RESUMO = 'A reitoria vai trocar as lâmpadas e revisar a fiação do estacionamento.';

/** O que o bot respondeu na conversa, com o telefone de quem recebeu. */
const enviadas: { telefone: string; resposta: Resposta }[] = [];
/** Avisos da fila de disparos que o worker de envio entregou ao sender falso. */
const avisos: { destino: string; aviso: AvisoRenderizado }[] = [];
/** PDFs que chegaram ao storage falso. */
const guardados: { chave: string; contentType: string; bytes: Buffer }[] = [];
const midiasBaixadas: string[] = [];

const storage: Storage = {
  guardar: (chave, bytes, contentType) => {
    guardados.push({ chave, contentType, bytes });
    return Promise.resolve();
  },
  remover: () => Promise.resolve(),
};

const avisoSender: AvisoSender = {
  enviar: (aviso, destino) => {
    avisos.push({ destino, aviso });
    return Promise.resolve({ id: `wamid.aviso.${String(avisos.length)}`, entregue: false });
  },
};

/** Um lote do worker de envio, com o relógio do passo. */
const lote = (agora: Date) =>
  enviarLote({ db, sender: avisoSender, chaves, logger, limite: 250 }, agora);

async function esperarAte(condicao: () => boolean, limiteMs = 20_000) {
  const fim = Date.now() + limiteMs;
  while (!condicao()) {
    if (Date.now() > fim) throw new Error('tempo esgotado esperando a resposta do bot');
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
}

const doTelefone = (telefone: string) =>
  enviadas.filter((e) => e.telefone === telefone).map((e) => e.resposta);

/** Manda pelo webhook, como a Meta faria, e espera as `n` respostas que a mensagem gera. */
async function mandar(payload: unknown, telefone: string, n: number): Promise<Resposta[]> {
  const antes = doTelefone(telefone).length;
  const { body, signature } = signPayload(payload, SEGREDO_DA_META);
  const resposta = await app.inject({
    method: 'POST',
    url: '/webhook',
    headers: { 'content-type': 'application/json', 'x-hub-signature-256': signature },
    payload: body,
  });
  expect(resposta.statusCode).toBe(200);
  await esperarAte(() => doTelefone(telefone).length >= antes + n);
  return doTelefone(telefone).slice(antes);
}

/**
 * Mensagens que o simulador ainda não monta: o documento (PDF) e o toque num botão de mensagem
 * modelo (`type: button`). O formato é o da Cloud API.
 */
function mensagemCrua(from: string, conteudo: Record<string, unknown>) {
  const mensagem = {
    id: randomWamid(),
    from,
    timestamp: String(Math.floor(Date.now() / 1000)),
    ...conteudo,
  } as unknown as MetaMessage;
  return wrapPayload({ messages: [mensagem] }, { from });
}

/** Ids das opções de uma resposta com botões ou lista. */
function opcoesDe(resposta: Resposta | undefined): string[] {
  if (typeof resposta !== 'object') return [];
  if (resposta.tipo === 'botoes') return resposta.botoes.map((b) => b.id);
  if (resposta.tipo === 'lista') return resposta.linhas.map((l) => l.id);
  return [];
}

async function lerPauta() {
  const r = await app.inject({ method: 'GET', url: `/pautas/${slug}` });
  expect(r.statusCode).toBe(200);
  return r.json<{
    status: string;
    relatos: unknown[];
    linha_do_tempo: { tipo: string; dados: Record<string, unknown> }[];
  }>();
}

async function criarEstudante(telefone: string) {
  const [estudante] = await admin
    .insert(estudantes)
    .values({
      telefoneHmac: hashPhone(telefone, chaves.hmac),
      telefoneCifrado: cifrar(telefone, chaves.cifra),
      curso: 'Agronomia',
      verificadoEm: new Date(Date.now() - 20 * MS_POR_DIA),
    })
    .returning({ id: estudantes.id });
  if (estudante === undefined) throw new Error('estudante não criado');
  return estudante.id;
}

/**
 * O fim do roteiro 2, montado pelo domínio com datas no passado: as mesmas funções que o bot e o
 * painel chamam. Insert direto só no que não tem função (bloco, curador e estudantes verificados).
 */
async function montarFimDoRoteiro2() {
  const diasAtras = (n: number) => new Date(Date.now() - n * MS_POR_DIA);
  // 10% de 300 estudantes, no piso de 30 (RN04).
  const [bloco] = await admin
    .insert(blocos)
    .values({ slug: 'ceca', nome: 'CECA', baseEstudantes: 300 })
    .returning({ id: blocos.id });
  if (bloco === undefined) throw new Error('bloco não criado');
  const [curador] = await admin
    .insert(curadores)
    .values({ emailHmac: 'curadoria-r3', emailCifrado: 'cifrado-r3', nome: 'Curadoria' })
    .returning({ id: curadores.id });
  if (curador === undefined) throw new Error('curador não criado');
  curadorId = curador.id;

  // A responsável cria pelo bot (owner, relato inicial e eventos de criação) e não conta como
  // apoio (SCRUM-344); a curadoria aprova como o painel.
  responsavelId = await criarEstudante(TELEFONE_DA_RESPONSAVEL);
  const criada = await admin.transaction((tx) =>
    criarPauta(tx, {
      estudanteId: responsavelId,
      titulo: PAUTA.titulo,
      descricao: PAUTA.descricao,
      blocoId: bloco.id,
      agora: diasAtras(16),
    }),
  );
  if (!criada.criada) throw new Error(`pauta não criada: ${criada.motivo}`);
  pautaId = criada.pautaId;
  slug = criada.slug;
  meta = criada.meta;
  const fotosVistas = await fotosDaTela(admin, pautaId);
  const aprovada = await admin.transaction((tx) =>
    aprovarPauta(tx, {
      pautaId,
      curadorId,
      categoria: 'infraestrutura',
      fotosVistas,
      agora: diasAtras(15),
    }),
  );
  expect(aprovada).toEqual({ decidida: true });

  // Os três apoiadores e mais quantos faltarem para a meta; o último apoio a bate. Quem criou a
  // pauta já conta como o primeiro apoio (SCRUM-344), então falta um a menos.
  const extras = Array.from(
    { length: meta - TELEFONES_DOS_APOIADORES.length - 1 },
    (_, i) => `55829777710${String(i).padStart(2, '0')}`,
  );
  for (const telefone of [...TELEFONES_DOS_APOIADORES, ...extras]) {
    const id = await criarEstudante(telefone);
    if ((TELEFONES_DOS_APOIADORES as readonly string[]).includes(telefone)) apoiadoresIds.push(id);
    const apoio = await admin.transaction((tx) =>
      registrarApoio(tx, { pautaId, estudanteId: id, origem: 'bot', agora: diasAtras(12) }),
    );
    expect(apoio).toMatchObject({ registrado: true });
  }

  const caminho = await admin.transaction((tx) =>
    abrirCaminho(tx, {
      pautaId,
      tipo: 'falabr',
      porEstudanteId: responsavelId,
      agora: diasAtras(10),
    }),
  );
  if (!caminho.aberto) throw new Error('caminho não aberto');
  caminhoId = caminho.caminhoId;
  const protocolo = await admin.transaction((tx) =>
    registrarProtocolo(tx, {
      caminhoId: caminho.caminhoId,
      protocolo: '23546.012345/2026-11',
      abertoEm: diaEmMaceio(diasAtras(10)),
    }),
  );
  expect(protocolo).toMatchObject({ registrado: true });

  // Os dois relatos que os apoiadores mandaram junto com o apoio, esperando a curadoria. Pela
  // mesma função que o bot chama no fim do apoio.
  const relatar = async (estudanteId: string, texto: string) => {
    const r = await admin.transaction((tx) => adicionarRelato(tx, { pautaId, estudanteId, texto }));
    if (!r.registrado) throw new Error(`relato não registrado: ${r.motivo}`);
    return r.relatoId;
  };
  relatoParaAprovar = await relatar(apoiadoresIds[0] ?? '', RELATO_APROVADO);
  relatoParaRecusar = await relatar(apoiadoresIds[1] ?? '', RELATO_RECUSADO);

  // O relato que `criarPauta` gravou com a descrição, também pendente.
  const [daCriacao] = await admin
    .select({ id: relatos.id })
    .from(relatos)
    .where(eq(relatos.estudanteId, responsavelId));
  if (daCriacao === undefined) throw new Error('relato da criação não gravado');
  relatoDaCriacao = daCriacao.id;
}

beforeAll(async () => {
  if (!URL_TESTE || !URL_APLICACAO) return;
  const banco = await criarBancoTemporario(URL_TESTE);
  apagarBanco = banco.apagar;
  poolAdmin = criarPool(banco.url, { conexaoMs: 5000, consultaMs: 15_000 }, () => undefined);
  admin = criarDb(poolAdmin);
  await montarFimDoRoteiro2();

  const comLogin = (urlDoLogin: string) => {
    const url = new URL(banco.url);
    const credenciais = new URL(urlDoLogin);
    url.username = credenciais.username;
    url.password = credenciais.password;
    return url.toString();
  };
  const url = comLogin(URL_APLICACAO);
  pool = criarPool(url, { conexaoMs: 5000, consultaMs: 15_000 }, () => undefined);
  db = criarDb(pool);
  if (URL_LEITURA) {
    poolLeitura = criarPool(
      comLogin(URL_LEITURA),
      { conexaoMs: 5000, consultaMs: 15_000 },
      () => undefined,
    );
  }

  boss = criarPgBossRuntime(url, { supervise: false, schedule: false });
  boss.on('error', () => undefined);
  await boss.start();
  const queue = filaPgBoss(boss);
  await registerIncomingWorker(boss, {
    db,
    store: new ConversationStore(db),
    queue,
    logger,
    chaves,
    // Como no main.ts, mas a "Meta" é uma função que devolve o PDF e o storage fica em memória.
    respostas: criarServicoDeRespostas({
      baixar: (id) => {
        midiasBaixadas.push(id);
        return Promise.resolve({ bytes: PDF, mimeType: 'application/pdf' });
      },
      storage,
    }),
  });
  await registerReplyWorker(
    boss,
    {
      send: (mensagem) => {
        const telefone = decifrar(mensagem.phoneCifrado, chaves.cifra);
        for (const resposta of respostasDoJob(mensagem, chaves)) {
          enviadas.push({ telefone, resposta });
        }
        return Promise.resolve();
      },
    },
    logger,
  );
  app = await buildApp({
    config: { verifyToken: 'token', appSecret: SEGREDO_DA_META },
    db,
    queue,
    logger,
    chaves,
    leitura: { db: poolLeitura ? criarDb(poolLeitura) : db, origensCors: [] },
  });
}, 60_000);

afterAll(async () => {
  if (!URL_TESTE || !URL_APLICACAO) return;
  // O banco temporário sai mesmo se o beforeAll falhou no meio ou se fechar algo falhar.
  try {
    // `app` é o último a ser montado: pode não existir.
    await (app as FastifyInstance | undefined)?.close();
    await boss?.stop({ graceful: false });
    await pool?.end();
    await poolLeitura?.end();
    await poolAdmin?.end();
  } finally {
    await apagarBanco?.();
  }
}, 30_000);

describe.skipIf(!URL_TESTE || !URL_APLICACAO)(
  'roteiro 3: resposta oficial, promessa e conferência',
  { timeout: 30_000 },
  () => {
    it('a curadoria modera os relatos e só o aprovado vai ao site, sem nome', async () => {
      // Como o painel: uma transação por decisão, com o curador da sessão.
      expect(
        await db.transaction((tx) =>
          aprovarRelato(tx, { relatoId: relatoParaAprovar, curadorId, fotoVista: null }),
        ),
      ).toEqual({ moderado: true });
      expect(
        await db.transaction((tx) => recusarRelato(tx, { relatoId: relatoParaRecusar, curadorId })),
      ).toEqual({ moderado: true });

      const pauta = await lerPauta();
      // Só texto, foto, curso e data: nada de quem relatou.
      expect(pauta.relatos).toEqual([
        // O relato da criação sai junto com a aprovação da pauta (#144).
        {
          texto: PAUTA.descricao,
          foto_chave: null,
          curso: 'Agronomia',
          moderado_em: expect.any(String) as string,
        },
        {
          texto: RELATO_APROVADO,
          foto_chave: null,
          curso: 'Agronomia',
          moderado_em: expect.any(String) as string,
        },
      ]);
      expect(JSON.stringify(pauta)).not.toContain(RELATO_RECUSADO);
      expect(JSON.stringify(pauta)).not.toContain(apoiadoresIds[0]);
      // O relato da criação foi aprovado com a pauta.
      const [daCriacao] = await admin
        .select({ moderacao: relatos.moderacao })
        .from(relatos)
        .where(eq(relatos.id, relatoDaCriacao));
      expect(daCriacao?.moderacao).toBe('aprovado');
    });

    it('a responsável envia o PDF da resposta em 4 · Minhas pautas, e o bot confirma', async () => {
      const texto = (body: string, n: number) =>
        mandar(
          buildTextMessage({ body, from: TELEFONE_DA_RESPONSAVEL }),
          TELEFONE_DA_RESPONSAVEL,
          n,
        );
      // Quem já tem cadastro recebe a saudação curta e o menu (SCRUM-333).
      await texto('oi', 2);

      // Uma pauta só: o "4" vai direto ao estado dos caminhos, com o botão do PDF.
      const [caminhos] = await texto('4', 1);
      expect(opcoesDe(caminhos)).toContain(RESPONSE_BUTTON_ID);

      expect(
        await mandar(
          buildButtonReply({
            id: RESPONSE_BUTTON_ID,
            title: 'Enviar resposta (PDF)',
            from: TELEFONE_DA_RESPONSAVEL,
          }),
          TELEFONE_DA_RESPONSAVEL,
          1,
        ),
      ).toEqual([ASK_PDF_TEXT]);

      const aposPdf = await mandar(
        mensagemCrua(TELEFONE_DA_RESPONSAVEL, {
          type: 'document',
          document: {
            id: 'midia-resposta-ouvidoria',
            mime_type: 'application/pdf',
            sha256: 'cmVzcG9zdGEtZGEtb3V2aWRvcmlh',
            filename: 'resposta.pdf',
          },
        }),
        TELEFONE_DA_RESPONSAVEL,
        2,
      );
      expect(aposPdf[0]).toBe(PDF_RECEIVED_TEXT);

      // O arquivo foi baixado pelo id da mídia, guardado e registrado em nome da responsável.
      expect(midiasBaixadas).toEqual(['midia-resposta-ouvidoria']);
      expect(guardados).toHaveLength(1);
      expect(guardados[0]).toMatchObject({ contentType: 'application/pdf', bytes: PDF });
      const documentos = await admin
        .select()
        .from(documentosResposta)
        .where(eq(documentosResposta.pautaId, pautaId));
      expect(documentos).toEqual([
        expect.objectContaining({
          arquivoChave: guardados[0]?.chave,
          enviadoPor: responsavelId,
          promessaId: null,
        }),
      ]);
    });

    it('a curadoria registra a resposta e a promessa, e a pauta vai para "prometido"', async () => {
      const registro = await db.transaction((tx) =>
        registrarPromessa(tx, {
          pautaId,
          resumo: RESUMO,
          dataEntrega,
          fonte: FONTE,
          registradaPor: curadorId,
        }),
      );
      promessaId = registro.promessaId;
      abreEm = registro.conferenciaAbreEm;
      fechaEm = registro.conferenciaFechaEm;
      // O PDF da responsável fica ligado à promessa escrita a partir dele.
      expect(registro.documentosLigados).toBe(1);
      expect(registro.avisados).toBeGreaterThanOrEqual(apoiadoresIds.length);

      const [pauta] = await admin.select().from(pautas).where(eq(pautas.id, pautaId));
      expect(pauta?.status).toBe('prometido');
      expect(fechaEm.getTime() - abreEm.getTime()).toBe(7 * MS_POR_DIA);
    });

    it('os apoiadores recebem a resposta oficial pelo bot, e o site mostra a promessa', async () => {
      const naFila = await admin
        .select()
        .from(disparos)
        .where(eq(disparos.tipo, 'resposta_oficial'));
      expect(naFila.map((d) => d.estudanteId)).toEqual(expect.arrayContaining(apoiadoresIds));
      expect(naFila.every((d) => d.aviso === promessaId)).toBe(true);

      await lote(new Date());

      for (const telefone of TELEFONES_DOS_APOIADORES) {
        const recebidos = avisos.filter(
          (a) => a.destino === telefone && a.aviso.modelo.nome === 'lumens_resposta_oficial',
        );
        expect(recebidos).toHaveLength(1);
        expect(recebidos[0]?.aviso.texto).toContain(PAUTA.titulo);
        expect(recebidos[0]?.aviso.texto).toContain(FONTE);
        expect(recebidos[0]?.aviso.texto).toContain(RESUMO);
      }

      const pauta = await lerPauta();
      expect(pauta.status).toBe('prometido');
      expect(pauta.linha_do_tempo).toContainEqual(
        expect.objectContaining({
          tipo: 'promessa_registrada',
          dados: { data_entrega: dataEntrega, resumo: RESUMO, fonte: FONTE },
        }),
      );
    });

    // O roteiro 3 (passo 4) pede o resumo E a data prometida no aviso. Hoje a mensagem modelo
    // `lumens_resposta_oficial` só leva título, fonte, resumo e slug (`registrarPromessa`, em
    // packages/dominio/src/caminhos/promessa.ts): a data só chega se a curadoria a escrever no
    // resumo. Quando a mensagem ganhar a data, este passo passa e o `it.fails` acusa.
    it.fails('o aviso da resposta oficial traz a data prometida', () => {
      const recebidos = avisos.filter((a) => a.aviso.modelo.nome === 'lumens_resposta_oficial');
      expect(recebidos.length).toBeGreaterThan(0);
      for (const recebido of recebidos) {
        expect(recebido.aviso.texto).toContain(formatarDia(dataEntrega));
      }
    });

    it('na data prometida a conferência abre e cada apoiador recebe "Foi feito?"', async () => {
      // Um milissegundo antes ainda não abre; em `abreEm`, abre.
      const antes = await rodarGatilhos(db, logger, new Date(abreEm.getTime() - 1));
      expect(antes.conferenciasAbertas).toBe(0);
      const rodada = await rodarGatilhos(db, logger, abreEm);
      expect(rodada.conferenciasAbertas).toBe(1);

      await lote(abreEm);

      for (const telefone of TELEFONES_DOS_APOIADORES) {
        const recebidos = avisos.filter(
          (a) => a.destino === telefone && a.aviso.modelo.nome === 'lumens_conferencia',
        );
        expect(recebidos).toHaveLength(1);
        expect(recebidos[0]?.aviso.texto).toContain('Foi feito?');
        expect(recebidos[0]?.aviso.botoes).toEqual([
          expect.objectContaining({ tipo: 'QUICK_REPLY', texto: 'Sim' }),
          expect.objectContaining({ tipo: 'QUICK_REPLY', texto: 'Em parte' }),
          expect.objectContaining({ tipo: 'QUICK_REPLY', texto: 'Não' }),
        ]);
        botoesDaConferencia.set(telefone, recebidos[0]?.aviso.botoes ?? []);
      }
    });

    // SCRUM-288: o bot trata o toque nos botões do "Foi feito?" e registra uma resposta por pessoa.
    it('os apoiadores respondem pelo bot, uma resposta por pessoa (SCRUM-288)', async () => {
      // O toque leva o payload que o aviso daquela pessoa de fato levou; espera a resposta do bot,
      // seja qual for, antes do próximo toque.
      const toque = (telefone: string, texto: string) => {
        const botao = botoesDaConferencia
          .get(telefone)
          ?.find((b) => b.tipo === 'QUICK_REPLY' && b.texto === texto);
        if (botao?.tipo !== 'QUICK_REPLY') throw new Error(`sem o botão "${texto}" no aviso`);
        return mandar(
          mensagemCrua(telefone, {
            type: 'button',
            button: { text: texto, payload: botao.payload },
          }),
          telefone,
          1,
        );
      };
      const [primeiro, segundo, terceiro] = TELEFONES_DOS_APOIADORES;
      await toque(primeiro, 'Sim');
      await toque(segundo, 'Sim');
      await toque(terceiro, 'Em parte');
      // Tocar de novo não vira um segundo voto.
      await toque(primeiro, 'Sim');

      const registradas = await admin
        .select()
        .from(respostasConferencia)
        .where(eq(respostasConferencia.promessaId, promessaId));
      expect(registradas).toHaveLength(3);
      expect(registradas.map((r) => [r.estudanteId, r.resposta])).toEqual(
        expect.arrayContaining([
          [apoiadoresIds[0], 'sim'],
          [apoiadoresIds[1], 'sim'],
          [apoiadoresIds[2], 'em_parte'],
        ]),
      );
    });

    // As demais respostas vão pelo domínio (a mesma função que o bot chama), para a apuração ter o
    // que contar.
    it('as respostas ficam registradas pelo domínio, uma por pessoa', async () => {
      const dentroDaJanela = new Date(abreEm.getTime() + 3_600_000);
      const responder = (estudanteId: string, resposta: 'sim' | 'em_parte') =>
        db.transaction((tx) =>
          registrarRespostaConferencia(tx, {
            promessaId,
            estudanteId,
            resposta,
            agora: dentroDaJanela,
          }),
        );
      const [primeiro = '', segundo = '', terceiro = ''] = apoiadoresIds;
      expect(await responder(primeiro, 'sim')).toMatchObject({ registrada: true });
      expect(await responder(segundo, 'sim')).toMatchObject({ registrada: true });
      expect(await responder(terceiro, 'em_parte')).toMatchObject({ registrada: true });
      expect(await responder(primeiro, 'sim')).toEqual({
        registrada: true,
        alterouResposta: false,
      });

      const registradas = await admin
        .select()
        .from(respostasConferencia)
        .where(eq(respostasConferencia.promessaId, promessaId));
      expect(registradas).toHaveLength(3);
    });

    it('ao fim dos 7 dias o agendador apura e, com maioria "Sim", a pauta vira conquista', async () => {
      const rodada = await rodarGatilhos(db, logger, fechaEm);
      expect(rodada.conferenciasApuradas).toBe(1);

      const [promessa] = await admin.select().from(promessas).where(eq(promessas.id, promessaId));
      expect(promessa?.resultado).toBe('conquistada');
      const [pauta] = await admin.select().from(pautas).where(eq(pautas.id, pautaId));
      expect(pauta?.status).toBe('conquistada');
    });

    it('o card de vitória vai aos apoiadores, e a pauta aparece nas conquistas e na atividade', async () => {
      const naFila = await admin.select().from(disparos).where(eq(disparos.tipo, 'vitoria'));
      expect(naFila.map((d) => d.estudanteId)).toEqual(expect.arrayContaining(apoiadoresIds));

      await lote(fechaEm);

      for (const telefone of TELEFONES_DOS_APOIADORES) {
        const recebidos = avisos.filter(
          (a) => a.destino === telefone && a.aviso.modelo.nome === 'lumens_conquista',
        );
        expect(recebidos).toHaveLength(1);
        expect(recebidos[0]?.aviso.imagem).toEqual({
          caminho: `/p/${slug}/card.png?status=conquistada`,
        });
      }

      const conquistas = await app.inject({ method: 'GET', url: '/conquistas' });
      expect(conquistas.statusCode).toBe(200);
      expect(conquistas.json<{ itens: { pauta_slug: string }[] }>().itens).toContainEqual(
        expect.objectContaining({ pauta_slug: slug, titulo: PAUTA.titulo }),
      );

      const atividade = await app.inject({ method: 'GET', url: '/atividade' });
      expect(atividade.statusCode).toBe(200);
      expect(
        atividade.json<{ itens: { pauta_slug: string; tipo: string }[] }>().itens,
      ).toContainEqual(expect.objectContaining({ pauta_slug: slug, tipo: 'conferencia_apurada' }));
    });

    it('a curadoria vê a linha do tempo completa, em ordem, e o login da aplicação não a apaga', async () => {
      const linha = await listarLinhaDoTempo(db, pautaId);
      expect(linha.map((e) => [e.tipo, e.dados])).toEqual([
        // Fim do roteiro 2 (fixture): criação, aprovação e o apoio que bate a meta.
        ['pauta_criada', { status: 'em_curadoria' }],
        ['owner_entrou', { papel: 'owner' }],
        ['status_alterado', { de: 'em_curadoria', para: 'juntando_apoios' }],
        ['pauta_aprovada', {}],
        ['relato_aprovado', { relato_id: relatoDaCriacao }],
        ['meta_batida', { meta, apoios: meta }],
        ['status_alterado', { de: 'juntando_apoios', para: 'meta_batida' }],
        ['caminho_aberto', { caminho_id: caminhoId, tipo: 'falabr' }],
        [
          'protocolo_registrado',
          { caminho_id: caminhoId, protocolo: '23546.012345/2026-11', prorrogado: false },
        ],
        ['status_alterado', { de: 'meta_batida', para: 'cobrando' }],
        // Passo 1: só a aprovação vira evento; a recusa fica no relato.
        ['relato_aprovado', { relato_id: relatoParaAprovar }],
        // Passo 3.
        ['status_alterado', { de: 'cobrando', para: 'prometido' }],
        ['resposta_oficial_recebida', { caminho_id: caminhoId }],
        [
          'promessa_registrada',
          { promessa_id: promessaId, data_entrega: dataEntrega, resumo: RESUMO, fonte: FONTE },
        ],
        // Passo 5.
        ['conferencia_aberta', { promessa_id: promessaId, fecha_em: fechaEm.toISOString() }],
        // Passo 7.
        ['status_alterado', { de: 'prometido', para: 'conquistada' }],
        [
          'conferencia_apurada',
          { promessa_id: promessaId, resultado: 'conquistada', total_respostas: 3 },
        ],
      ]);

      // O banco recusa UPDATE e DELETE em `evento` para o login da aplicação.
      // Recusa pelo REVOKE da migração 0003 (o gatilho da 0002 nem chega a rodar). O Drizzle
      // embrulha o erro do Postgres em `cause`.
      const erroDoBanco = (consulta: Promise<unknown>) =>
        consulta.then(
          () => 'a consulta passou',
          (e: unknown) => (e instanceof Error ? e.cause : e),
        );
      const semPermissao = { code: '42501', message: 'permission denied for table evento' };
      expect(
        await erroDoBanco(
          db.update(eventos).set({ tipo: 'apagado' }).where(eq(eventos.pautaId, pautaId)),
        ),
      ).toMatchObject(semPermissao);
      expect(
        await erroDoBanco(db.delete(eventos).where(eq(eventos.pautaId, pautaId))),
      ).toMatchObject(semPermissao);
      expect(await listarLinhaDoTempo(db, pautaId)).toEqual(linha);
    });
  },
);
