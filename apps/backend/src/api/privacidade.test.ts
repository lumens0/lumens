import { apoios, eq, estudantes, papeisPauta, pautas, relatos, sql, type Db } from '@lumens/db';
import { executarSeed } from '@lumens/db/seed';
import { criarBancoEmMemoria } from '@lumens/db/teste';
import Fastify, { type FastifyInstance } from 'fastify';
import { pino } from 'pino';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../app';
import { FakeQueue } from '../infra/queue.fake';

// Varredura de identidade (SCRUM-89): rede de segurança da RNF01 e da RN03. Diferente do
// `api.test.ts`, que confere o contrato rota a rota, aqui NINGUÉM lista as rotas à mão: as
// rotas GET saem do próprio Fastify, então uma rota nova (ou um campo novo numa view) entra
// na varredura sem editar este arquivo.
//
// Se este teste falhar: NÃO desative e não relaxe os padrões abaixo — corrija a rota. Um
// campo de identidade que chega ao site não volta atrás: ele já foi servido e cacheado.

/**
 * Estudante sentinela, inserido só por este teste. O seed guarda telefone e e-mail como HMAC
 * e placeholder (`seed:v1:telefone:…`), então nenhum valor de identidade plausível circula nele;
 * sem sentinela, a busca por VALOR não teria o que achar e passaria vazia para sempre.
 */
const SENTINELA = {
  id: '5e971e1a-0000-4000-8000-000000000001',
  telefone: '+5582999990001',
  email: 'teste.sentinela@ufal.br',
  /** Curso é público de propósito (`relatos[].curso`), então vai um curso real do seed. */
  curso: 'Enfermagem',
  /** Texto público: prova que os dados da sentinela chegaram mesmo às respostas. */
  relato: 'Relato da sentinela da varredura de identidade.',
} as const;
/** Pauta pública à qual a sentinela é ligada (apoio, relato aprovado e papel de co-owner). */
const PAUTA_SENTINELA = 'bebedouros-no-bloco-18';
/**
 * Cada rota é chamada uma vez de cada jeito: sem query e com `?limit=100`, para as rotas
 * paginadas devolverem todas as linhas (e não só as 20 do padrão). Query que a rota não
 * conhece é ignorada ou recusada com `{ erro }` — os dois corpos também são varridos.
 */
const VARIANTES = ['', '?limit=100'];
/** Rotas que precisam existir na varredura: se o parser do `printRoutes` quebrar, isto acusa. */
const ROTAS_ESPERADAS = ['/webhook', '/resumo', '/pautas', '/pautas/:slug'];
/** Única rota que não responde 200 por padrão: o handshake da Meta recusa sem o token. */
const ROTA_SEM_200 = '/webhook';

/** Nome de campo que nunca pode sair numa resposta pública (RNF01). */
const CAMPO_PROIBIDO = /telefone|e-?mail|hmac|cifr|estudante_?id|(^|_)id$/i;
/**
 * Padrões de identidade em QUALQUER valor, não só nos campos conhecidos. O telefone não exige
 * o 55 do país — o vazamento mais provável é alguém escrever o próprio número num relato, e
 * quase ninguém escreve "+55". O que segura o falso positivo é o **9 do celular ser
 * obrigatório**: com ele, uuid, instante ISO, epoch em ms e valor em reais passam limpos. Um
 * e-mail dentro de texto livre também é vazamento de verdade, então também falha.
 */
const PADROES: ReadonlyArray<readonly [string, RegExp]> = [
  ['telefone brasileiro', /\(?\d{2}\)?[\s-]?9\d{4}[-\s]?\d{4}/],
  ['e-mail', /[\w.+-]+@[\w-]+\.[\w.-]{2,}/],
];

interface Achado {
  /** Caminho do campo no JSON, como `$.relatos[0].texto`. */
  caminho: string;
  motivo: string;
}

/**
 * Varre um JSON inteiro atrás de identidade: nome de campo proibido, valor sentinela e padrão
 * de telefone/e-mail. Função separada do `expect` de propósito — é ela que o "teste do teste"
 * no fim do arquivo exercita com uma rota que vaza.
 */
function varrer(valor: unknown, caminho = '$'): Achado[] {
  if (Array.isArray(valor)) {
    return valor.flatMap((item, i) => varrer(item, `${caminho}[${String(i)}]`));
  }
  if (valor !== null && typeof valor === 'object') {
    return Object.entries(valor).flatMap(([campo, filho]) => {
      const dentro = `${caminho}.${campo}`;
      const achados = CAMPO_PROIBIDO.test(campo)
        ? [{ caminho: dentro, motivo: `campo proibido: ${campo}` }]
        : [];
      return [...achados, ...varrer(filho, dentro)];
    });
  }
  // Número também: um telefone serializado como número escaparia de uma varredura só de texto.
  if (typeof valor !== 'string' && typeof valor !== 'number') return [];
  const texto = String(valor);
  const achados: Achado[] = [];
  if (texto.includes(SENTINELA.telefone)) {
    achados.push({ caminho, motivo: 'telefone da sentinela' });
  }
  if (texto.includes(SENTINELA.email)) achados.push({ caminho, motivo: 'e-mail da sentinela' });
  if (texto.includes(SENTINELA.id)) achados.push({ caminho, motivo: 'estudante_id da sentinela' });
  for (const [nome, padrao] of PADROES) {
    const casa = padrao.exec(texto);
    if (casa) achados.push({ caminho, motivo: `padrão de ${nome}: ${casa[0]}` });
  }
  return achados;
}

/**
 * Caminhos das rotas GET registradas, lidos do `printRoutes` do próprio Fastify (o router não
 * é exposto de outro jeito). Com `commonPrefix: false` cada linha é
 * `<indentação de 4 em 4>├── /segmento (MÉTODOS)`, e um nó filho completa o caminho do pai.
 */
function rotasGet(app: FastifyInstance): string[] {
  const ancestrais: string[] = [];
  const rotas: string[] = [];
  for (const linha of app.printRoutes({ commonPrefix: false }).split('\n')) {
    const marca = linha.search(/[├└]/);
    if (marca < 0) continue;
    const profundidade = Math.floor(marca / 4);
    const resto = linha.slice(marca + 4);
    const [, segmento = '', metodos] = /^(.*?)(?: \(([^)]*)\))?$/.exec(resto) ?? [];
    ancestrais.length = profundidade;
    ancestrais.push(segmento);
    const caminho = ancestrais.join('');
    if (metodos?.split(', ').includes('GET')) rotas.push(caminho);
  }
  return rotas;
}

/**
 * URLs de uma rota: uma para cada valor conhecido de cada parâmetro. Parâmetro sem valor
 * cadastrado e rota curinga derrubam o teste — o `printRoutes` não mostra o caminho inteiro de
 * um curinga, então chamá-lo adivinhando daria 404 e a rota passaria sem ser varrida.
 */
function urlsDe(rota: string, valores: Record<string, readonly string[]>): string[] {
  expect(
    rota.includes('*'),
    `rota curinga "${rota}": a varredura de identidade não sabe que URL chamar nela. ` +
      'Troque por um parâmetro nomeado ou varra-a à parte.',
  ).toBe(false);
  const parametro = /:([^/]+)/.exec(rota);
  if (!parametro) return [rota];
  const [marcador, nome = ''] = parametro;
  const opcoes = valores[nome];
  expect(
    opcoes,
    `rota nova com o parâmetro ":${nome}": cadastre os valores em VALORES_DO_PARAMETRO ` +
      'para ela entrar na varredura de identidade',
  ).toBeDefined();
  return (opcoes ?? []).flatMap((valor) => urlsDe(rota.replace(marcador, valor), valores));
}

/**
 * Chama todas as rotas GET do app e devolve o que a varredura achou. É por aqui que passam
 * tanto a API de verdade quanto a rota de prova do "teste do teste", para o encanamento inteiro
 * (enumerar → montar a URL → chamar → varrer) ficar coberto, e não só a função `varrer`.
 */
async function varrerApp(
  app: FastifyInstance,
  valores: Record<string, readonly string[]>,
): Promise<Array<{ rota: string } & Achado>> {
  const achados: Array<{ rota: string } & Achado> = [];
  for (const rota of rotasGet(app)) {
    for (const url of urlsDe(rota, valores)) {
      for (const variante of VARIANTES) {
        const alvo = url + variante;
        const res = await app.inject({ method: 'GET', url: alvo });
        // Sem isto, uma rota que passasse a responder 500 ou 404 seria "varrida" com o corpo
        // `{ erro }` e o teste ficaria verde sem ter olhado resposta nenhuma.
        if (rota !== ROTA_SEM_200) expect(res.statusCode, alvo).toBe(200);
        let corpo: unknown = res.payload;
        try {
          corpo = res.json();
        } catch {
          // Resposta sem JSON (o 403 do handshake da Meta, por exemplo): varre o texto cru.
        }
        achados.push(...varrer(corpo).map((achado) => ({ rota: alvo, ...achado })));
      }
    }
  }
  return achados;
}

describe('nenhuma rota pública devolve identidade (SCRUM-89)', () => {
  let app: FastifyInstance;
  let db: Db;
  /** Slugs lidos da própria API: todas as pautas públicas entram na varredura do detalhe. */
  let valores: Record<string, readonly string[]> = {};

  beforeAll(async () => {
    db = await criarBancoEmMemoria();
    await executarSeed(db);
    const [pauta] = await db
      .select({ id: pautas.id })
      .from(pautas)
      .where(eq(pautas.slug, PAUTA_SENTINELA));
    expect(pauta, `o seed precisa ter a pauta ${PAUTA_SENTINELA}`).toBeDefined();
    const pautaId = pauta?.id ?? '';
    // Identidade em claro de propósito, só aqui: é o que a varredura procura nas respostas.
    await db.insert(estudantes).values({
      id: SENTINELA.id,
      telefoneHmac: `sentinela:${SENTINELA.telefone}`,
      telefoneCifrado: SENTINELA.telefone,
      emailHmac: `sentinela:${SENTINELA.email}`,
      emailCifrado: SENTINELA.email,
      curso: SENTINELA.curso,
    });
    await db.insert(apoios).values({ pautaId, estudanteId: SENTINELA.id, origem: 'bot' });
    await db.insert(papeisPauta).values({ pautaId, estudanteId: SENTINELA.id, papel: 'co_owner' });
    await db.insert(relatos).values({
      pautaId,
      estudanteId: SENTINELA.id,
      texto: SENTINELA.relato,
      moderacao: 'aprovado',
      moderadoEm: new Date(),
    });
    // Só depois de inserir: como `lumens_site`, as tabelas ficam inacessíveis.
    await db.execute(sql.raw('SET ROLE "lumens_site"'));
    app = await buildApp({
      config: { verifyToken: 'verify', appSecret: 'segredo' },
      db,
      queue: new FakeQueue(),
      logger: pino({ level: 'silent' }),
      chaves: { cifra: Buffer.alloc(32, 1), hmac: Buffer.alloc(32, 2) },
      leitura: { db, origensCors: ['https://lumens-ufal.vercel.app'] },
    });
    const lista = await app.inject({ method: 'GET', url: '/pautas?limit=100' });
    const { itens } = lista.json<{ itens: Array<{ slug: string }> }>();
    valores = { slug: itens.map((item) => item.slug) };
  }, 60_000);

  afterAll(async () => {
    await app.close();
  });

  it('enxerga todas as rotas GET registradas, inclusive as futuras', () => {
    expect(rotasGet(app)).toEqual(expect.arrayContaining(ROTAS_ESPERADAS));
  });

  it('varre o detalhe de todas as pautas públicas, não de uma só', () => {
    // O check que existia no `api.test.ts` cobria as sete com uma lista à mão; aqui os slugs
    // vêm da própria API, então uma pauta nova no seed entra sozinha.
    expect(valores.slug?.length).toBeGreaterThanOrEqual(7);
    expect(valores.slug).toContain(PAUTA_SENTINELA);
  });

  it('os dados da sentinela chegam mesmo às respostas públicas', async () => {
    const res = await app.inject({ method: 'GET', url: `/pautas/${PAUTA_SENTINELA}` });

    // Sem isto a varredura passaria limpa só porque não encontrou dado nenhum.
    expect(res.statusCode).toBe(200);
    expect(res.payload).toContain(SENTINELA.relato);
    expect(res.payload).toContain(SENTINELA.curso);
  });

  it('nenhuma resposta tem telefone, e-mail ou estudante_id', async () => {
    expect(await varrerApp(app, valores)).toEqual([]);
  });
});

// O teste do teste: se a varredura acima parar de enxergar, ela passa calada. O que vem abaixo
// prova que ela ainda acusa — e que não acusa o que é público.
describe('a varredura acusa uma rota que vaza', () => {
  /** Fastify descartável com uma rota que vaza os três tipos de dado. */
  function appQueVaza(): FastifyInstance {
    const app = Fastify();
    app.get('/vazando', () => ({
      itens: [
        {
          slug: 'pauta-ficticia',
          estudante_id: SENTINELA.id,
          relatos: [
            { texto: 'Me chama no (82) 99999-0001', contato: SENTINELA.email },
            { texto: `Ou no ${SENTINELA.telefone}` },
          ],
        },
      ],
    }));
    return app;
  }

  it('aponta o caminho do campo e o que encontrou', async () => {
    const app = appQueVaza();
    const res = await app.inject({ method: 'GET', url: '/vazando' });

    expect(varrer(res.json())).toEqual([
      { caminho: '$.itens[0].estudante_id', motivo: 'campo proibido: estudante_id' },
      { caminho: '$.itens[0].estudante_id', motivo: 'estudante_id da sentinela' },
      {
        caminho: '$.itens[0].relatos[0].texto',
        motivo: 'padrão de telefone brasileiro: (82) 99999-0001',
      },
      { caminho: '$.itens[0].relatos[0].contato', motivo: 'e-mail da sentinela' },
      { caminho: '$.itens[0].relatos[0].contato', motivo: `padrão de e-mail: ${SENTINELA.email}` },
      { caminho: '$.itens[0].relatos[1].texto', motivo: 'telefone da sentinela' },
      {
        caminho: '$.itens[0].relatos[1].texto',
        motivo: 'padrão de telefone brasileiro: 82999990001',
      },
    ]);
    await app.close();
  });

  it('acusa pelo mesmo caminho que varre a API de verdade', async () => {
    // Pelo encanamento inteiro: enumerar as rotas, montar a URL, chamar e varrer.
    const app = appQueVaza();

    const achados = await varrerApp(app, {});

    expect(new Set(achados.map((achado) => achado.rota))).toEqual(
      new Set(['/vazando', '/vazando?limit=100']),
    );
    expect(new Set(achados.map((achado) => `${achado.caminho} → ${achado.motivo}`))).toEqual(
      new Set([
        '$.itens[0].estudante_id → campo proibido: estudante_id',
        '$.itens[0].estudante_id → estudante_id da sentinela',
        '$.itens[0].relatos[0].texto → padrão de telefone brasileiro: (82) 99999-0001',
        '$.itens[0].relatos[0].contato → e-mail da sentinela',
        `$.itens[0].relatos[0].contato → padrão de e-mail: ${SENTINELA.email}`,
        '$.itens[0].relatos[1].texto → telefone da sentinela',
        '$.itens[0].relatos[1].texto → padrão de telefone brasileiro: 82999990001',
      ]),
    );
    await app.close();
  });

  it('derruba o teste numa rota curinga, em vez de pulá-la', () => {
    const app = Fastify();
    app.get('/arquivos/*', () => ({ ok: true }));

    expect(() => urlsDe(rotasGet(app)[0] ?? '', {})).toThrow();
  });

  it('não acusa uma resposta pública legítima', () => {
    expect(
      varrer({
        itens: [
          {
            slug: 'bebedouros-no-bloco-18',
            titulo: 'Bebedouros',
            curso: 'Enfermagem',
            criada_em: '2026-02-10T12:00:00.000Z',
            meta: 300,
            apoios: 124,
            dados: { de: 'prometido', para: 'conquistada' },
            bloco_slug: null,
          },
        ],
      }),
    ).toEqual([]);
  });
});
