/**
 * Roteiro 2 de ponta a ponta (SCRUM-119 / SCRUM-347): a responsável cria a pauta pelo WhatsApp e a
 * leva adiante: curadoria, apoios, meta batida, Fala.BR, protocolo e proposta da comunidade.
 *
 * Mesmo molde do roteiro 1: o simulador de webhook monta e assina o payload da Meta, o Fastify
 * recebe no POST /webhook, o pg-boss de verdade leva a mensagem ao worker, os handlers padrão
 * respondem e as respostas saem pela fila de saída. Banco Postgres temporário, com o login restrito
 * da aplicação (`lumens_app`). Fica fora do bot só o que não passa por ele: a aprovação da
 * curadoria (a função que o painel chama) e os apoios que levam a pauta até um antes da meta.
 *
 * Nada usa rede: e-mail falso, sender falso para as respostas e para os avisos da fila `disparo`.
 */
import {
  and,
  blocos,
  criarDb,
  criarPool,
  curadores,
  eq,
  estudantes,
  isNull,
  papeisPauta,
  pautas,
  relatos,
  type Db,
} from '@lumens/db';
import { aprovarPauta, diaEmMaceio, registrarApoio } from '@lumens/dominio';
import { criarBancoTemporario } from '@lumens/db/teste';
import type { FastifyInstance } from 'fastify';
import type { PgBoss } from 'pg-boss';
import { pino } from 'pino';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { avisarMetasBatidas } from './agendador/aviso-meta-batida';
import { buildApp } from './app';
import {
  ASK_WRITE_REPORT_TEXT,
  cardDaPauta,
  goalReachedText,
  REPORT_SENT_TEXT,
  SUPPORT_DONE_TEXT,
  SUPPORT_PHOTO_ASK_TEXT,
  SUPPORT_VERIFY_FIRST_TEXT,
  supportedText,
} from './bot/conversation/apoio';
import { COOWNER_INVITE_TEXT, coOwnerText } from './bot/conversation/co-owner';
import { GREETING_TEXT, MENU_TEXT } from './bot/conversation/handlers';
import { FALABR_TEXT_INTRO, OPENED_TEXT } from './bot/conversation/minhas-pautas';
import {
  DESCRIPTION_QUESTION_TEXT,
  NO_PHOTO_TEXT,
  PHOTO_ASK_TEXT,
  VERIFY_FIRST_TEXT,
} from './bot/conversation/nova-pauta';
import { hashPhone } from './bot/conversation/phone';
import { PRIVACY_NOTICE_TEXT } from './bot/conversation/privacidade';
import {
  confirmVolunteerText,
  DONE_TEXT,
  PEOPLE_ASK_TEXT,
  PROPOSAL_ASK_TEXT,
  PUBLISHED_TEXT,
  volunteerText,
} from './bot/conversation/proposta';
import {
  ASK_DATE_TEXT,
  ASK_PROTOCOL_TEXT,
  protocolSavedText,
} from './bot/conversation/protocolo-falabr';
import type { Resposta } from './bot/conversation/resposta';
import { ConversationStore } from './bot/conversation/store';
import { NEW_TITLE_TEXT } from './bot/conversation/texto';
import { CODE_OK_TEXT, CODE_SENT_TEXT, VERIFIED_TEXT } from './bot/conversation/verificacao';
import type { AvisoRenderizado } from './bot/envio/aviso';
import { enviarLote } from './bot/envio/worker';
import { buildButtonReply, buildListReply, buildTextMessage } from './bot/sim/payloads';
import { signPayload } from './bot/sim/send';
import { registerIncomingWorker, registerReplyWorker, respostasDoJob } from './bot/worker';
import { cifrar, decifrar, type Chaves } from './cripto/cifra';
import type { ServicoDeEmail } from './email/codigo';
import { criarPgBossRuntime } from './infra/pg-boss';
import { filaPgBoss } from './infra/queue';

const URL_TESTE = process.env.DATABASE_URL_TESTE;
const URL_APLICACAO = process.env.DATABASE_URL;
/** Login do site (`lumens_site`). Sem ele (só fora do CI), a API de leitura usa o da aplicação. */
const URL_LEITURA = process.env.DATABASE_URL_LEITURA;
if (!URL_TESTE && process.env.CI) throw new Error('No CI, defina DATABASE_URL_TESTE.');
if (!URL_APLICACAO && process.env.CI) throw new Error('No CI, defina DATABASE_URL.');
if (!URL_LEITURA && process.env.CI) throw new Error('No CI, defina DATABASE_URL_LEITURA.');

const SEGREDO_DA_META = 'segredo-do-roteiro-2';
const chaves: Chaves = { cifra: Buffer.alloc(32, 5), hmac: Buffer.alloc(32, 6) };
const logger = pino({ level: 'silent' });

interface Pessoa {
  telefone: string;
  /** Nome do perfil do WhatsApp: vem no payload da Meta e não pode sair no texto do Fala.BR. */
  nome: string;
  email: string;
}
/** Quem cria a pauta e cuida dela. */
const RESPONSAVEL: Pessoa = {
  telefone: '5582988881111',
  nome: 'Ana Responsavel',
  email: 'ana.roteiro2@ufal.br',
};
/** Apoia pelo botão do site, vira corresponsável e se voluntaria na proposta. */
const APOIADOR: Pessoa = {
  telefone: '5582988882222',
  nome: 'Bruno Apoiador',
  email: 'bruno.roteiro2@ufal.br',
};
/** Já verificado (fixture): o apoio dele, pelo bot, é o que cruza a meta. */
const TERCEIRO: Pessoa = {
  telefone: '5582988883333',
  nome: 'Carla Terceira',
  email: 'carla.roteiro2@ufal.br',
};

const BLOCO = { slug: 'bloco-7', nome: 'Bloco 7', baseEstudantes: 300 };
/** 10% de 300 estudantes, no piso de 30 (RN04). */
const META = 30;
const TITULO = 'Iluminacao no estacionamento do Bloco 7';
const DESCRICAO =
  'Metade dos postes do estacionamento estão apagados há dois meses, e à noite fica escuro demais.';
const PROTOCOLO = '00106.000123/2026-11';
const PROPOSTA = 'Mutirão para mapear os postes apagados e levar a lista à prefeitura do campus.';
const PESSOAS = 5;

let db: Db;
// Opcionais: se o beforeAll falhar no meio, o afterAll fecha só o que chegou a abrir.
let pool: ReturnType<typeof criarPool> | undefined;
let poolLeitura: ReturnType<typeof criarPool> | undefined;
let boss: PgBoss | undefined;
let app: FastifyInstance;
let apagarBanco: (() => Promise<void>) | undefined;
/** Conexão de administrador do banco temporário: só para montar a fixture e conferir. */
let admin: Db;
let poolAdmin: ReturnType<typeof criarPool> | undefined;
let curadorId: string;

/** A pauta criada no passo 1; os passos seguintes dependem dela. */
let pautaId: string;
let slug: string;
/** O id da proposta, tirado do botão "Proposta feita" que o bot mostrou. */
let propostaId: string;

/** O que o bot mandou, na ordem em que saiu da fila, com o telefone de quem recebeu. */
const enviadas: { telefone: string; resposta: Resposta }[] = [];
/** Último código "enviado" para cada e-mail. */
const codigos = new Map<string, string>();
const email: ServicoDeEmail = {
  enviarCodigo(para, novo) {
    codigos.set(para, novo);
    return Promise.resolve(true);
  },
};

async function esperarAte(condicao: () => boolean, limiteMs = 20_000) {
  const fim = Date.now() + limiteMs;
  while (!condicao()) {
    if (Date.now() > fim) throw new Error('tempo esgotado esperando a resposta do bot');
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
}

const doTelefone = (telefone: string) =>
  enviadas.filter((e) => e.telefone === telefone).map((e) => e.resposta);

/**
 * Manda pelo webhook, como a Meta faria, e espera as respostas que vão para quem mandou: `n` delas
 * ou, quando o número varia, até a condição valer.
 */
async function mandar(
  payload: unknown,
  telefone: string,
  n: number | ((novas: Resposta[]) => boolean),
): Promise<Resposta[]> {
  const antes = doTelefone(telefone).length;
  const { body, signature } = signPayload(payload, SEGREDO_DA_META);
  const resposta = await app.inject({
    method: 'POST',
    url: '/webhook',
    headers: { 'content-type': 'application/json', 'x-hub-signature-256': signature },
    payload: body,
  });
  expect(resposta.statusCode).toBe(200);
  const novas = () => doTelefone(telefone).slice(antes);
  await esperarAte(typeof n === 'number' ? () => novas().length >= n : () => n(novas()));
  return novas();
}

const texto = (p: Pessoa, body: string, n: number) =>
  mandar(buildTextMessage({ body, from: p.telefone, name: p.nome }), p.telefone, n);
const botao = (p: Pessoa, id: string, n: number | ((novas: Resposta[]) => boolean)) =>
  mandar(
    buildButtonReply({ id, title: id.slice(0, 20), from: p.telefone, name: p.nome }),
    p.telefone,
    n,
  );
const linha = (p: Pessoa, id: string, n: number) =>
  mandar(
    buildListReply({ id, title: id.slice(0, 24), from: p.telefone, name: p.nome }),
    p.telefone,
    n,
  );

/** Ids dos botões ou das linhas de uma resposta interativa. */
function opcoes(r: Resposta | undefined): string[] {
  if (typeof r !== 'object') return [];
  if (r.tipo === 'botoes') return r.botoes.map((b) => b.id);
  if (r.tipo === 'lista') return r.linhas.map((l) => l.id);
  return [];
}

/** O estado dos caminhos (botões ou lista) é sempre a última resposta do owner. */
const terminaComOpcoes = (novas: Resposta[]) => opcoes(novas.at(-1)).length > 0;

/** E-mail, código e curso, como no roteiro 1. Devolve o que vem depois do curso. */
async function verificar(p: Pessoa, n: number): Promise<Resposta[]> {
  expect(await texto(p, p.email, 1)).toEqual([CODE_SENT_TEXT]);
  const codigo = codigos.get(p.email);
  expect(codigo).toMatch(/^\d+$/);
  const aposCodigo = await texto(p, codigo ?? '', 2);
  expect(aposCodigo[0]).toBe(CODE_OK_TEXT);
  return linha(p, 'curso:Direito', n);
}

/** A pauta como o site lê: GET na API de leitura pública. */
async function pautaNaApi() {
  const r = await app.inject({ method: 'GET', url: `/pautas/${slug}` });
  expect(r.statusCode).toBe(200);
  return r.json<{
    status: string;
    apoios: number;
    meta: number;
    titulo: string;
    meta_batida_em: string | null;
    caminhos: {
      tipo: string;
      status: string;
      protocolo: string | null;
      prazo: string | null;
      descricao: string | null;
      pessoas_necessarias: number | null;
      voluntarios: number | null;
    }[];
    linha_do_tempo: { tipo: string; dados: Record<string, unknown> }[];
  }>();
}

const estudanteDe = async (p: Pessoa) => {
  const [e] = await admin
    .select({ id: estudantes.id })
    .from(estudantes)
    .where(eq(estudantes.telefoneHmac, hashPhone(p.telefone, chaves.hmac)));
  return e?.id;
};

/** Estudante verificado direto no banco, com o telefone cifrado como o webhook guarda. */
async function estudanteVerificadoNaFixture(telefone: string): Promise<string> {
  const [e] = await admin
    .insert(estudantes)
    .values({
      telefoneHmac: hashPhone(telefone, chaves.hmac),
      telefoneCifrado: cifrar(telefone, chaves.cifra),
      curso: 'Direito',
      verificadoEm: new Date(),
    })
    .returning({ id: estudantes.id });
  if (e === undefined) throw new Error('estudante não criado');
  return e.id;
}

/** Apoiadores da fixture: os que levam a pauta até um antes da meta, junto com o APOIADOR. */
const TELEFONES_DA_FIXTURE = Array.from(
  { length: META - 2 },
  (_, i) => `55829900${String(i).padStart(5, '0')}`,
);

beforeAll(async () => {
  if (!URL_TESTE || !URL_APLICACAO) return;
  const banco = await criarBancoTemporario(URL_TESTE);
  apagarBanco = banco.apagar;
  poolAdmin = criarPool(banco.url, { conexaoMs: 5000, consultaMs: 15_000 }, () => undefined);
  admin = criarDb(poolAdmin);
  await admin.insert(blocos).values(BLOCO);
  const [curador] = await admin
    .insert(curadores)
    .values({ emailHmac: 'curadoria-roteiro-2', emailCifrado: 'cifrado', nome: 'Curadoria' })
    .returning({ id: curadores.id });
  if (curador === undefined) throw new Error('fixture não criada');
  curadorId = curador.id;

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
    email,
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

// Cada passo tem várias idas e voltas pela fila (webhook → worker → resposta).
describe.skipIf(!URL_TESTE || !URL_APLICACAO)(
  'roteiro 2: a responsável leva a pauta adiante',
  { timeout: 60_000 },
  () => {
    it('1. cria a pauta pelo menu e o bot confirma o envio à curadoria, com a meta', async () => {
      expect(await texto(RESPONSAVEL, 'oi', 3)).toEqual([
        GREETING_TEXT,
        PRIVACY_NOTICE_TEXT,
        MENU_TEXT,
      ]);
      // Sem verificação, a pauta nova passa por ela antes e retoma no título.
      expect(await texto(RESPONSAVEL, '2', 1)).toEqual([VERIFY_FIRST_TEXT]);
      expect(await verificar(RESPONSAVEL, 2)).toEqual([VERIFIED_TEXT, NEW_TITLE_TEXT]);

      const [listaDeBlocos] = await texto(RESPONSAVEL, TITULO, 1);
      const doBloco = opcoes(listaDeBlocos).find((id) => id !== 'bloco:campus');
      if (doBloco === undefined) throw new Error('esperava a lista de blocos');
      expect(await linha(RESPONSAVEL, doBloco, 1)).toEqual([DESCRIPTION_QUESTION_TEXT]);
      expect(await texto(RESPONSAVEL, DESCRICAO, 1)).toEqual([PHOTO_ASK_TEXT]);

      const [semFoto, resumo, menu] = await texto(RESPONSAVEL, 'pular', 3);
      expect(semFoto).toBe(NO_PHOTO_TEXT);
      expect(resumo).toContain('Pauta enviada para a curadoria!');
      expect(resumo).toContain(`*Título:* ${TITULO}`);
      expect(resumo).toContain(`*Local:* ${BLOCO.nome}`);
      expect(resumo).toContain(`*Meta:* ${String(META)} apoios`);
      expect(menu).toBe(MENU_TEXT);

      const [pauta] = await admin
        .select({ id: pautas.id, slug: pautas.slug, status: pautas.status })
        .from(pautas)
        .where(eq(pautas.titulo, TITULO));
      if (pauta === undefined) throw new Error('a pauta não foi gravada');
      expect(pauta.status).toBe('em_curadoria');
      pautaId = pauta.id;
      slug = pauta.slug;
    });

    it('2. a curadoria aprova e a pauta aparece na API juntando apoios, com 0 apoios', async () => {
      // Como o painel faz (apps/painel/src/app/pautas/[id]/acoes.ts).
      const decisao = await db.transaction((tx) => aprovarPauta(tx, { pautaId, curadorId }));
      expect(decisao).toEqual({ decidida: true });

      expect(await pautaNaApi()).toMatchObject({
        titulo: TITULO,
        status: 'juntando_apoios',
        apoios: 0,
        meta: META,
      });
    });

    it('3. o segundo estudante apoia pelo botão do site, se verifica, relata e vira corresponsável', async () => {
      expect(await texto(APOIADOR, `apoiar ${slug}`, 2)).toEqual([
        PRIVACY_NOTICE_TEXT,
        SUPPORT_VERIFY_FIRST_TEXT,
      ]);
      // Verificado, o apoio pedido pelo site é retomado e conta na hora.
      expect(await verificar(APOIADOR, 4)).toEqual([
        VERIFIED_TEXT,
        supportedText(TITULO, 1, META),
        cardDaPauta(slug, 1),
        ASK_WRITE_REPORT_TEXT,
      ]);
      const relato = 'Ontem caí no estacionamento por causa do escuro.';
      expect(await texto(APOIADOR, relato, 1)).toEqual([SUPPORT_PHOTO_ASK_TEXT]);
      expect(await texto(APOIADOR, 'pular', 3)).toEqual([
        REPORT_SENT_TEXT,
        {
          tipo: 'botoes',
          corpo: COOWNER_INVITE_TEXT,
          botoes: [{ id: `cuidar ${pautaId}`, titulo: 'Quero cuidar' }],
        },
        MENU_TEXT,
      ]);
      // O relato ficou gravado nesta pauta, em nome dele, esperando a curadoria.
      const doApoiador = await admin
        .select({ texto: relatos.texto, moderacao: relatos.moderacao })
        .from(relatos)
        .where(
          and(
            eq(relatos.pautaId, pautaId),
            eq(relatos.estudanteId, (await estudanteDe(APOIADOR)) ?? ''),
          ),
        );
      expect(doApoiador).toEqual([{ texto: relato, moderacao: 'pendente' }]);

      expect(await botao(APOIADOR, `cuidar ${pautaId}`, 2)).toEqual([
        coOwnerText(TITULO),
        MENU_TEXT,
      ]);
      const owners = await admin
        .select({ estudanteId: papeisPauta.estudanteId })
        .from(papeisPauta)
        .where(and(eq(papeisPauta.pautaId, pautaId), isNull(papeisPauta.ate)));
      expect(owners).toHaveLength(2);
      expect(owners.map((o) => o.estudanteId)).toEqual(
        expect.arrayContaining([await estudanteDe(RESPONSAVEL), await estudanteDe(APOIADOR)]),
      );
    });

    it('4. o apoio que cruza a meta muda o status e o aviso coletivo sai pela fila de envio', async () => {
      // Até um antes da meta, pelo domínio (o "Apoiar" do bot e do site passam por aqui).
      for (const telefone of TELEFONES_DA_FIXTURE) {
        const estudanteId = await estudanteVerificadoNaFixture(telefone);
        const r = await admin.transaction((tx) =>
          registrarApoio(tx, { pautaId, estudanteId, origem: 'bot' }),
        );
        expect(r).toMatchObject({ registrado: true, metaBatidaAgora: false });
      }
      expect(await pautaNaApi()).toMatchObject({ apoios: META - 1, status: 'juntando_apoios' });

      // O apoio que cruza a meta vem pelo bot, de um estudante já verificado.
      await estudanteVerificadoNaFixture(TERCEIRO.telefone);
      expect(await texto(TERCEIRO, `apoiar ${slug}`, 5)).toEqual([
        PRIVACY_NOTICE_TEXT,
        supportedText(TITULO, META, META),
        goalReachedText(META),
        cardDaPauta(slug, META),
        ASK_WRITE_REPORT_TEXT,
      ]);
      const fimDoApoio = await texto(TERCEIRO, 'pular', 3);
      expect(fimDoApoio[0]).toBe(SUPPORT_DONE_TEXT);
      expect(fimDoApoio.at(-1)).toBe(MENU_TEXT);

      const naApi = await pautaNaApi();
      expect(naApi).toMatchObject({ status: 'meta_batida', apoios: META });
      expect(naApi.meta_batida_em).not.toBeNull();
      expect(naApi.linha_do_tempo.map((e) => e.tipo)).toContain('meta_batida');

      // O bot já pôs o aviso na fila junto com o apoio: o gatilho do agendador não repete.
      expect(await avisarMetasBatidas(db, logger)).toMatchObject({ avisos: 0, falhas: 0 });

      // Um lote do worker de envio, com um sender que só guarda o que seria enviado.
      const saidas: { aviso: AvisoRenderizado; destino: string }[] = [];
      const lote = await enviarLote({
        db,
        chaves,
        logger,
        limite: 250,
        sender: {
          enviar: (aviso, destino) => {
            saidas.push({ aviso, destino });
            return Promise.resolve({ id: `wamid.${String(saidas.length)}`, entregue: false });
          },
        },
      });
      expect(lote).toMatchObject({ falhas: 0, adiados: 0 });

      const daMeta = saidas.filter((s) => s.aviso.modelo.nome === 'lumens_meta_batida');
      const destinos = daMeta.map((s) => s.destino);
      // Ninguém recebe duas vezes.
      expect(new Set(destinos).size).toBe(destinos.length);
      // Todos os apoiadores, e só eles. Sobre a responsável não se afirma nada: quem cria a pauta
      // não conta como apoio, e se ela recebe este aviso ainda está em aberto.
      const apoiadores = [...TELEFONES_DA_FIXTURE, APOIADOR.telefone, TERCEIRO.telefone];
      expect(destinos.filter((d) => d !== RESPONSAVEL.telefone).sort()).toEqual(apoiadores.sort());
      for (const { aviso } of daMeta) {
        expect(aviso.texto).toContain(
          `A pauta "${TITULO}", que você apoiou, chegou à meta de ${String(META)} apoios.`,
        );
        expect(aviso.botoes).toContainEqual(
          expect.objectContaining({ tipo: 'URL', caminho: `/p/${slug}` }),
        );
      }
    });

    it('5. em Minhas pautas, abre o Fala.BR e recebe o texto da manifestação sem dado pessoal', async () => {
      const [caminhos] = await texto(RESPONSAVEL, '4', 1);
      expect(opcoes(caminhos)).toContain('caminho:falabr');

      const aposAbrir = await botao(RESPONSAVEL, 'caminho:falabr', terminaComOpcoes);
      expect(aposAbrir[0]).toBe(OPENED_TEXT.falabr);
      const intro = aposAbrir.indexOf(FALABR_TEXT_INTRO);
      expect(intro).toBeGreaterThan(0);
      const manifestacao = aposAbrir[intro + 1];
      if (typeof manifestacao !== 'string') throw new Error('esperava o texto da manifestação');
      expect(manifestacao).toContain(TITULO);

      const pessoal = [RESPONSAVEL, APOIADOR, TERCEIRO].flatMap((p) => [
        p.telefone,
        p.email,
        p.nome,
        ...p.nome.split(' '),
      ]);
      for (const dado of pessoal) expect(manifestacao).not.toContain(dado);
      expect(manifestacao).not.toMatch(/@|\d{8,}/);
    });

    it('6. registra o protocolo e a data; o bot mostra o prazo e a API mostra a pauta em cobrança', async () => {
      expect(await linha(RESPONSAVEL, 'protocolo:falabr', 1)).toEqual([ASK_PROTOCOL_TEXT]);
      expect(await texto(RESPONSAVEL, PROTOCOLO, 1)).toEqual([ASK_DATE_TEXT]);

      // 30 dias a contar de hoje, no fuso de Maceió. O "hoje" é lido antes e depois da resposta:
      // se a meia-noite passar no meio, vale qualquer um dos dois.
      const prazoDe = (dia: string) =>
        new Date(Date.parse(`${dia}T00:00:00Z`) + 30 * 86_400_000).toISOString().slice(0, 10);
      const antes = diaEmMaceio(new Date());
      const [salvo, estado] = await texto(RESPONSAVEL, 'hoje', 2);
      const depois = diaEmMaceio(new Date());
      const prazos = [prazoDe(antes), prazoDe(depois)];
      expect(salvo).toBeOneOf(prazos.map((p) => protocolSavedText(PROTOCOLO, p)));
      const prazo = prazos.find((p) => salvo === protocolSavedText(PROTOCOLO, p));
      expect(opcoes(estado)).toContain('caminho:comunidade');

      const naApi = await pautaNaApi();
      expect(naApi.status).toBe('cobrando');
      expect(naApi.caminhos).toContainEqual(
        expect.objectContaining({ tipo: 'falabr', protocolo: PROTOCOLO, prazo }),
      );
    });

    it('7. abre o caminho comunidade e publica uma proposta, que aparece na API para "Vou ajudar"', async () => {
      const [aberto, estado] = await botao(RESPONSAVEL, 'caminho:comunidade', 2);
      expect(aberto).toBe(OPENED_TEXT.comunidade);
      expect(opcoes(estado)).toContain('proposta:nova');

      expect(await botao(RESPONSAVEL, 'proposta:nova', 1)).toEqual([PROPOSAL_ASK_TEXT]);
      expect(await texto(RESPONSAVEL, PROPOSTA, 1)).toEqual([PEOPLE_ASK_TEXT]);
      const [publicada, comProposta] = await texto(RESPONSAVEL, String(PESSOAS), 2);
      expect(publicada).toBe(PUBLISHED_TEXT);
      const feita = opcoes(comProposta).find((id) => id.startsWith('proposta:feita:'));
      if (feita === undefined) throw new Error('esperava o botão "Proposta feita"');
      propostaId = feita.slice('proposta:feita:'.length);

      // Proposta aberta: é nela que o site põe o botão "Vou ajudar".
      expect((await pautaNaApi()).caminhos).toContainEqual(
        expect.objectContaining({
          tipo: 'proposta',
          status: 'aberta',
          descricao: PROPOSTA,
          pessoas_necessarias: PESSOAS,
          voluntarios: 0,
        }),
      );
    });

    it('8. o segundo estudante toca em "Vou ajudar", confirma no bot e a contagem sobe', async () => {
      expect(await texto(APOIADOR, `ajudar ${slug}`, 2)).toEqual([
        {
          tipo: 'botoes',
          corpo: confirmVolunteerText({
            descricao: PROPOSTA,
            pessoasNecessarias: PESSOAS,
            voluntarios: 0,
          }),
          botoes: [
            { id: `ajudar ${propostaId}`, titulo: 'Vou ajudar' },
            { id: 'menu', titulo: 'Voltar ao menu' },
          ],
        },
        MENU_TEXT,
      ]);
      expect(await botao(APOIADOR, `ajudar ${propostaId}`, 2)).toEqual([
        volunteerText({ descricao: PROPOSTA, pessoasNecessarias: PESSOAS, voluntarios: 1 }),
        MENU_TEXT,
      ]);

      expect((await pautaNaApi()).caminhos).toContainEqual(
        expect.objectContaining({ tipo: 'proposta', voluntarios: 1 }),
      );
    });

    it('9. marca "Proposta feita": conquista parcial na linha do tempo e a pauta segue em cobrança', async () => {
      const [feita] = await botao(RESPONSAVEL, `proposta:feita:${propostaId}`, 2);
      expect(feita).toBe(DONE_TEXT);

      const naApi = await pautaNaApi();
      expect(naApi.status).toBe('cobrando');
      expect(naApi.caminhos).toContainEqual(
        expect.objectContaining({ tipo: 'proposta', status: 'executada' }),
      );
      const tipos = naApi.linha_do_tempo.map((e) => e.tipo);
      expect(tipos).toContain('proposta_executada');
      expect(tipos).toContain('protocolo_registrado');
      // A conquista parcial vem depois do protocolo, na ordem em que aconteceu.
      expect(tipos.indexOf('proposta_executada')).toBeGreaterThan(
        tipos.indexOf('protocolo_registrado'),
      );
    });
  },
);
