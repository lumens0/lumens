import { blocos, pautas, type Db, type StatusPauta } from '@lumens/db';
import { criarBancoEmMemoria } from '@lumens/db/teste';
import { beforeAll, describe, expect, it } from 'vitest';
import {
  LIMITE_PARECIDAS,
  buscarPautasParecidas,
  listarBlocos,
  palavrasDe,
  termosDaBusca,
} from './pautas-parecidas';

/**
 * Massa de calibração da 2.5. Os relatos imitam o jeito de escrever no WhatsApp: sem acento, com
 * gíria, erro de digitação e a sala no meio. Os limiares de `pautas-parecidas.ts` saíram daqui.
 *
 * Para calibrar com relatos reais, acrescente casos em RELATOS (e a pauta em PAUTAS, se faltar):
 * o teste diz qual relato deixou de achar a pauta certa.
 */
const BLOCOS = {
  'bloco-18': 'Bloco 18',
  'biblioteca-central': 'Biblioteca Central',
  engenharias: 'Bloco das Engenharias',
  saude: 'Bloco da Saúde',
  artes: 'Bloco de Artes',
  'residencia-universitaria': 'Residência Universitária',
} as const;
type SlugBloco = keyof typeof BLOCOS;

const PAUTAS: [string, SlugBloco | null, StatusPauta, string, string][] = [
  [
    'bebedouros-bloco-18',
    'bloco-18',
    'juntando_apoios',
    'Bebedouros funcionando no Bloco 18',
    'Consertar os bebedouros existentes e publicar um calendário de manutenção preventiva.',
  ],
  [
    'ar-condicionado-bloco-18',
    'bloco-18',
    'juntando_apoios',
    'Ar-condicionado nas salas do Bloco 18',
    'As salas de aula ficam muito quentes à tarde e os aparelhos de ar-condicionado estão quebrados.',
  ],
  [
    'banheiros-bloco-18',
    'bloco-18',
    'cobrando',
    'Banheiros limpos e com papel no Bloco 18',
    'Falta papel higiênico, sabonete e limpeza frequente nos banheiros do térreo e do primeiro andar.',
  ],
  [
    'acessibilidade-bloco-18',
    'bloco-18',
    'entregue_em_parte',
    'Acessibilidade nas entradas do Bloco 18',
    'Corrigir rampas, sinalização e corrimãos nas entradas de maior circulação.',
  ],
  [
    'biblioteca-sabados',
    'biblioteca-central',
    'meta_batida',
    'Biblioteca aberta aos sábados',
    'Ampliar o horário da biblioteca durante o período letivo e de provas.',
  ],
  [
    'tomadas-biblioteca',
    'biblioteca-central',
    'juntando_apoios',
    'Tomadas nas mesas da biblioteca',
    'Instalar pontos de energia nas mesas de estudo para carregar notebook e celular.',
  ],
  [
    'wifi-biblioteca',
    'biblioteca-central',
    'em_curadoria',
    'Wi-Fi que funcione na biblioteca',
    'A rede sem fio cai o tempo todo no segundo andar da biblioteca.',
  ],
  [
    'laboratorio-engenharias',
    'engenharias',
    'cobrando',
    'Computadores novos no laboratório das Engenharias',
    'Os computadores do laboratório são lentos e não rodam os programas usados nas disciplinas.',
  ],
  [
    'goteiras-engenharias',
    'engenharias',
    'juntando_apoios',
    'Consertar goteiras nas salas das Engenharias',
    'Quando chove, entra água pelo teto das salas e dos corredores.',
  ],
  [
    'sala-descanso-saude',
    'saude',
    'prometido',
    'Sala de descanso para estudantes da Saúde',
    'Adaptar uma sala ociosa para intervalos entre estágios e aulas em turnos extensos.',
  ],
  [
    'iluminacao-artes',
    'artes',
    'cobrando',
    'Iluminação no entorno do Bloco de Artes',
    'Trocar luminárias apagadas e iluminar o trajeto até o ponto de ônibus.',
  ],
  [
    'internet-residencia',
    'residencia-universitaria',
    'juntando_apoios',
    'Internet estável na residência universitária',
    'Restabelecer a cobertura Wi-Fi nos quartos e áreas coletivas da residência.',
  ],
  [
    'onibus-campus',
    null,
    'juntando_apoios',
    'Mais horários do ônibus interno',
    'O circular do campus passa de hora em hora e lota no horário de pico.',
  ],
  [
    'restaurante-fila',
    null,
    'juntando_apoios',
    'Fila menor no Restaurante Universitário',
    'Abrir mais um caixa e uma segunda linha de serviço no almoço do RU.',
  ],
  [
    'arvores-campus',
    null,
    'em_curadoria',
    'Mais árvores e sombra nas áreas de convivência',
    'Criar novas áreas sombreadas nos caminhos mais usados do campus.',
  ],
  [
    'laboratorios-contraturno',
    'engenharias',
    'conquistada',
    'Laboratórios de informática abertos no contraturno',
    'Garantir acesso monitorado aos laboratórios para trabalhos e projetos de extensão.',
  ],
];

/** Relato, bloco escolhido (`null` = todo o campus) e a pauta que tem de vir primeiro. */
const RELATOS: [string, SlugBloco | null, string][] = [
  ['o bebedouro do bloco 18 ta quebrado faz semanas', 'bloco-18', 'bebedouros-bloco-18'],
  ['nao tem agua gelada em nenhum bebedor do 18', 'bloco-18', 'bebedouros-bloco-18'],
  ['a sala 12 ta um forno, o ar nao liga', 'bloco-18', 'ar-condicionado-bloco-18'],
  [
    'ar condicionado quebrado de novo, impossivel assistir aula a tarde',
    'bloco-18',
    'ar-condicionado-bloco-18',
  ],
  ['banheiro masculino do terreo sem papel e sem sabonete', 'bloco-18', 'banheiros-bloco-18'],
  ['o banheiro ta imundo', 'bloco-18', 'banheiros-bloco-18'],
  [
    'bibloteca devia abrir no sabado, semana de prova nao tem onde estudar',
    'biblioteca-central',
    'biblioteca-sabados',
  ],
  [
    'nao tem tomada pra carregar o notebook na biblioteca',
    'biblioteca-central',
    'tomadas-biblioteca',
  ],
  ['poucas tomadas nas mesas de estudo', 'biblioteca-central', 'tomadas-biblioteca'],
  [
    'os pcs do laboratorio sao muito lentos, nao roda nem o autocad',
    'engenharias',
    'laboratorio-engenharias',
  ],
  [
    'ta chovendo dentro da sala, goteira em cima das carteiras',
    'engenharias',
    'goteiras-engenharias',
  ],
  ['o teto do corredor ta pingando agua', 'engenharias', 'goteiras-engenharias'],
  [
    'a gente sai do estagio e nao tem onde descansar entre as aulas',
    'saude',
    'sala-descanso-saude',
  ],
  [
    'muito escuro perto do ponto de onibus do bloco de artes, da medo a noite',
    'artes',
    'iluminacao-artes',
  ],
  ['postes apagados no caminho das artes', 'artes', 'iluminacao-artes'],
  ['wifi da residencia nao pega no meu quarto', 'residencia-universitaria', 'internet-residencia'],
  ['o circular demora demais e vem lotado', null, 'onibus-campus'],
  ['fila do RU gigante, perdi a aula esperando o almoço', null, 'restaurante-fila'],
];

/** Problemas que não têm pauta aberta: o bot tem de oferecer pauta nova. */
const SEM_PAUTA: [string, SlugBloco | null][] = [
  ['a porta da sala 3 ta emperrada', 'bloco-18'],
  ['faltam cadeiras para canhotos nas salas', 'engenharias'],
  ['o elevador da saude ta parado', 'saude'],
  ['queria mais aulas de libras no curso', null],
  // A pauta do Wi-Fi da biblioteca existe, mas ainda está em curadoria.
  ['o wifi da biblioteca cai toda hora', 'biblioteca-central'],
];

let db: Db;
const idDoBloco = new Map<string, string>();

beforeAll(async () => {
  db = await criarBancoEmMemoria();
  const inseridos = await db
    .insert(blocos)
    .values(Object.entries(BLOCOS).map(([slug, nome]) => ({ slug, nome, baseEstudantes: 1000 })))
    .returning({ id: blocos.id, slug: blocos.slug });
  for (const { id, slug } of inseridos) idDoBloco.set(slug, id);
  await db.insert(pautas).values(
    PAUTAS.map(([slug, bloco, status, titulo, descricao], i) => ({
      slug,
      titulo,
      descricao,
      status,
      blocoId: bloco === null ? null : bloco_(bloco),
      categoria: 'infraestrutura',
      meta: 30,
      // Datas distintas: o desempate final é pela mais recente.
      criadaEm: new Date(Date.UTC(2026, 1, 1 + i)),
    })),
  );
}, 30_000);

function bloco_(slug: SlugBloco): string {
  const id = idDoBloco.get(slug);
  if (id === undefined) throw new Error(`bloco ${slug} não foi inserido`);
  return id;
}

const buscar = (relato: string, bloco: SlugBloco | null) =>
  buscarPautasParecidas(db, { relato, blocoId: bloco === null ? null : bloco_(bloco) });

describe('termosDaBusca', () => {
  it('tira acento, palavra comum, escrita de WhatsApp, número e repetição', () => {
    expect(termosDaBusca('O bebedouro do Bloco 18 tá QUEBRADO, quebrado pra vc ver')).toEqual([
      'bebedouro',
      'quebrado',
    ]);
  });

  it('tira as palavras do bloco escolhido', () => {
    expect(
      termosDaBusca('postes apagados no caminho das artes', palavrasDe('Bloco de Artes')),
    ).toEqual(['postes', 'apagados', 'caminho']);
  });

  it('só deixa sair [a-z0-9], que entra no to_tsquery sem escapar', () => {
    const termos = termosDaBusca(`a'b & c|d !e (f) "çã" <-> ganhar:* 'x' \\y`);
    expect(termos.every((t) => /^[a-z0-9]+$/.test(t))).toBe(true);
  });

  it('relato só com palavras comuns não tem termo', () => {
    expect(termosDaBusca('tá tudo ruim aqui, gente!!!')).toEqual(['ruim']);
    expect(termosDaBusca('a sala 3 do bloco')).toEqual([]);
  });

  it('limita os termos de um relato longo (mensagem encaminhada)', () => {
    const longo = Array.from({ length: 40 }, (_, i) => `termo${String(i)}x`).join(' ');
    expect(termosDaBusca(longo)).toHaveLength(12);
  });
});

describe('buscarPautasParecidas · relatos de calibração', () => {
  it.each(RELATOS)('"%s" (%s) acha %s primeiro', async (relato, bloco, esperada) => {
    const achadas = await buscar(relato, bloco);
    expect(achadas[0]?.slug).toBe(esperada);
    expect(achadas.length).toBeLessThanOrEqual(LIMITE_PARECIDAS);
  });

  it.each(SEM_PAUTA)('"%s" (%s) não acha pauta', async (relato, bloco) => {
    expect(await buscar(relato, bloco)).toEqual([]);
  });
});

describe('buscarPautasParecidas · regras', () => {
  it('nunca mostra pauta em curadoria, recusada ou encerrada', async () => {
    const slugs = (await buscar('laboratorio de informatica com computador lento', null)).map(
      (p) => p.slug,
    );
    expect(slugs).toContain('laboratorio-engenharias');
    expect(slugs).not.toContain('laboratorios-contraturno');
    const arvores = await buscar('mais arvores e sombra na convivencia', null);
    expect(arvores.map((p) => p.slug)).not.toContain('arvores-campus');
  });

  it('com bloco, procura no bloco e nas pautas do campus inteiro, nunca em outro bloco', async () => {
    const noBloco18 = await buscar('goteira e fila do RU', 'bloco-18');
    expect(noBloco18.map((p) => p.slug)).toEqual(['restaurante-fila']);
    const semBloco = await buscar('goteira e fila do RU', null);
    expect(semBloco.map((p) => p.slug).sort()).toEqual([
      'goteiras-engenharias',
      'restaurante-fila',
    ]);
  });

  it('no empate, a pauta do bloco vem antes da do campus inteiro', async () => {
    const achadas = await buscar('escuro no ponto de onibus', 'artes');
    expect(achadas.map((p) => p.slug)).toEqual(['iluminacao-artes', 'onibus-campus']);
    expect(achadas[0]?.pontos).toBe(achadas[1]?.pontos);
  });

  it('não mostra de enfeite pauta com menos da metade dos pontos da primeira', async () => {
    const achadas = await buscar('o bebedouro do bloco 18 ta quebrado faz semanas', 'bloco-18');
    // "quebrado" também está na descrição do ar-condicionado, mas 1 ponto contra 2 não aparece.
    expect(achadas.map((p) => p.slug)).toEqual(['bebedouros-bloco-18']);
  });

  it('devolve o necessário para montar a lista do WhatsApp', async () => {
    const [primeira] = await buscar('banheiro sem papel', 'bloco-18');
    expect(primeira).toMatchObject({
      slug: 'banheiros-bloco-18',
      titulo: 'Banheiros limpos e com papel no Bloco 18',
      blocoId: bloco_('bloco-18'),
    });
    expect(primeira?.descricao).toMatch(/^Falta papel/);
    expect(primeira?.pontos).toBeGreaterThanOrEqual(4);
  });

  it('relato sem nada em comum com as pautas, ou sem termo útil, não acha nada', async () => {
    expect(await buscar('oi, tudo bem?', null)).toEqual([]);
    expect(await buscar('a sala 3 do bloco', null)).toEqual([]);
  });
});

describe('listarBlocos', () => {
  it('lista os blocos pelo nome', async () => {
    const lista = await listarBlocos(db);
    expect(lista.map((b) => b.nome).sort()).toEqual(Object.values(BLOCOS).sort());
    expect(lista[0]).toEqual({
      id: bloco_('biblioteca-central'),
      slug: 'biblioteca-central',
      nome: 'Biblioteca Central',
    });
  });
});
