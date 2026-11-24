/**
 * Dados da apresentação: zera o banco local (menos `curador`) e cria pelo menos um exemplo de cada
 * fluxo do produto: os nove status de pauta, urgência, pedidos de edição nos três estados, relatos
 * nos três estados, os três tipos de caminho (Fala.BR no prazo, vencido e prorrogado), propostas,
 * promessa com conferência fechada, aberta e remarcada, e os três resultados da conferência.
 *
 * Tudo é fictício (estudantes `@demo.invalid`, nenhum número de telefone real) e as datas são
 * relativas a hoje, então "prazo em 12 dias" e "conferência aberta agora" continuam verdadeiros
 * no dia da apresentação, desde que o script rode perto dela.
 *
 * Fotos de relato, foto de conquista e PDF de resposta oficial só são gravados quando quem chama
 * informa `guardarArquivo` (o script do backend usa o storage S3 local); sem ele, ficam de fora.
 */
import { createHmac, randomUUID } from 'node:crypto';
import { sql } from 'drizzle-orm';
import type { Db } from '../src/client';
import {
  apoios,
  blocos,
  caminhos,
  conquistasDaCuradoria,
  curadores,
  disparos,
  documentosResposta,
  estudantes,
  eventos,
  fotosARemover,
  papeisPauta,
  pautas,
  pedidosEdicao,
  promessas,
  propostas,
  relatoFotos,
  relatos,
  respostasConferencia,
  voluntarios,
} from '../src/schema';
import type {
  NovoApoio,
  NovoDisparo,
  NovoEstudante,
  NovoEvento,
  NovoPapelPauta,
  NovaPauta,
  NovaPromessa,
  NovaProposta,
  NovoRelato,
  NovaRespostaConferencia,
  NovoVoluntario,
  StatusPauta,
} from '../src/types';
import { blocosUfal, cadastrarBlocosUfal } from './blocos-ufal';

const DIA = 86_400_000;
const QUANTIDADE_ESTUDANTES = 320;
const CURSOS = [
  'Administração',
  'Arquitetura e Urbanismo',
  'Ciência da Computação',
  'Direito',
  'Enfermagem',
  'Engenharia Civil',
  'Jornalismo',
  'Medicina',
  'Pedagogia',
  'Psicologia',
] as const;

/** Tabelas zeradas. `curador` e `curador_auditoria` ficam de fora, de propósito. */
const TABELAS_ZERADAS = [
  'apoio',
  'bloco',
  'caminho',
  'codigo_verificacao',
  'conquista_curadoria',
  'conversa',
  'disparo',
  'documento_resposta',
  'estudante',
  'evento',
  'foto_a_remover',
  'mensagem_processada',
  'papel_pauta',
  'pauta',
  'pedido_edicao',
  'pedido_link_login',
  'promessa',
  'proposta',
  'registro_verificacao',
  'relato',
  'relato_foto',
  'resposta_conferencia',
  'verificacao_login',
  'voluntario',
] as const;

export async function zerarBanco(db: Db): Promise<void> {
  await db.transaction(async (tx) => {
    // `evento` recusa UPDATE, DELETE e TRUNCATE por gatilho (migração 0002): só o dono do banco, e
    // só aqui, no banco local, desliga o do TRUNCATE.
    await tx.execute(sql`ALTER TABLE evento DISABLE TRIGGER evento_bloquear_truncate`);
    await tx.execute(
      sql.raw(`TRUNCATE ${TABELAS_ZERADAS.map((t) => `"${t}"`).join(', ')} RESTART IDENTITY`),
    );
    await tx.execute(sql`ALTER TABLE evento ENABLE TRIGGER evento_bloquear_truncate`);
    // Fila de jobs do pg-boss: não deixa tarefa antiga disparar contra a base nova.
    await tx.execute(sql`
      DO $$ BEGIN
        IF to_regclass('pgboss.job') IS NOT NULL THEN TRUNCATE pgboss.job CASCADE; END IF;
      END $$`);
  });
}

function hmac(valor: string): string {
  return createHmac('sha256', 'lumens-demo-v1').update(valor).digest('hex');
}

function cifra(tipo: 'telefone' | 'email', valor: string): string {
  return `seed:v1:${tipo}:${Buffer.from(valor).toString('base64url')}`;
}

/** `YYYY-MM-DD` de um instante, em UTC. */
function diaCivil(instante: Date): string {
  return instante.toISOString().slice(0, 10);
}

function metaDoBloco(base: number | null): number {
  return base === null ? 300 : Math.min(300, Math.max(30, Math.ceil(base * 0.1)));
}

type Pub = (dados: Record<string, unknown>) => boolean;
const PUBLICO: Record<string, boolean | Pub> = {
  pauta_criada: false,
  pauta_aprovada: true,
  pauta_recusada: false,
  meta_batida: true,
  caminho_aberto: true,
  protocolo_registrado: true,
  prazo_prorrogado: true,
  proposta_publicada: true,
  proposta_executada: true,
  resposta_oficial_recebida: true,
  promessa_registrada: true,
  promessa_remarcada: true,
  conferencia_aberta: true,
  conferencia_apurada: true,
  status_alterado: (d) => d.para !== 'recusada',
  owner_entrou: true,
  relato_aprovado: true,
  owner_removido: true,
  protocolo_corrigido: true,
  pauta_urgente: true,
  bloco_corrigido: true,
  meta_ajustada: true,
  categoria_alterada: true,
  pauta_editada: false,
  conquista_atualizada: false,
};

interface Marcos {
  /** Dias atrás. */
  criada: number;
  aprovada?: number;
  metaBatida?: number;
  cobrando?: number;
  prometido?: number;
  resultado?: number;
}

interface Especificacao {
  slug: string;
  titulo: string;
  descricao: string;
  bloco: string | null;
  categoria: string;
  status: StatusPauta;
  marcos: Marcos;
  /** Total de apoios; os primeiros são de quem cuida da pauta. */
  apoios: number;
  /** Quantas pessoas cuidam da pauta (1 owner + co-owners). */
  responsaveis: number;
  motivoRecusa?: string;
  urgente?: { diasAtras: number; motivo: string };
}

const ESPECIFICACOES: Especificacao[] = [
  // — Em curadoria: a fila do painel —
  {
    slug: 'mais-arvores-e-sombra-no-campus',
    titulo: 'Mais árvores e sombra nas áreas de convivência',
    descricao: 'Plantar árvores e criar áreas sombreadas nos caminhos mais usados do campus.',
    bloco: null,
    categoria: 'infraestrutura',
    status: 'em_curadoria',
    marcos: { criada: 1 },
    apoios: 0,
    responsaveis: 1,
  },
  {
    slug: 'bebedouros-quebrados-no-ctec',
    titulo: 'Bebedouros quebrados no Centro de Tecnologia',
    descricao:
      'Os bebedouros do CTEC estão sem refrigeração. Pedimos o conserto e uma manutenção periódica.',
    bloco: 'ctec',
    categoria: 'infraestrutura',
    status: 'em_curadoria',
    marcos: { criada: 0 },
    apoios: 0,
    responsaveis: 1,
  },
  {
    slug: 'tomadas-nas-salas-do-ic',
    titulo: 'Tomadas funcionando nas salas do Instituto de Computação',
    descricao:
      'Boa parte das tomadas das salas de aula do IC não funciona; quem usa notebook sofre.',
    bloco: 'ic',
    categoria: 'infraestrutura',
    status: 'em_curadoria',
    marcos: { criada: 2 },
    apoios: 0,
    responsaveis: 2,
  },
  // — Recusada —
  {
    slug: 'ar-condicionado-em-todas-as-salas',
    titulo: 'Ar-condicionado em todas as salas do CEDU',
    descricao: 'Instalar ar-condicionado em todas as salas do Centro de Educação.',
    bloco: 'cedu',
    categoria: 'infraestrutura',
    status: 'recusada',
    marcos: { criada: 20 },
    apoios: 0,
    responsaveis: 1,
    motivoRecusa:
      'A pauta pede uma obra de grande porte sem apontar o problema concreto. Reenvie dizendo quais salas e qual o desconforto, que a gente publica.',
  },
  // — Juntando apoios —
  {
    slug: 'bebedouros-funcionando-no-bloco-18',
    titulo: 'Bebedouros funcionando no Bloco 18',
    descricao: 'Consertar os bebedouros e publicar um calendário de manutenção preventiva.',
    bloco: 'bloco-18',
    categoria: 'infraestrutura',
    status: 'juntando_apoios',
    marcos: { criada: 12, aprovada: 11 },
    apoios: 96,
    responsaveis: 2,
  },
  {
    slug: 'iluminacao-na-passarela-do-csau',
    titulo: 'Iluminação na passarela do Centro de Ciências da Saúde',
    descricao:
      'A passarela entre o CSAU e o ponto de ônibus fica no escuro à noite. Pedimos a troca das lâmpadas.',
    bloco: 'csau',
    categoria: 'seguranca',
    status: 'juntando_apoios',
    marcos: { criada: 9, aprovada: 8 },
    apoios: 118,
    responsaveis: 3,
    urgente: {
      diasAtras: 2,
      motivo: 'Duas ocorrências de assalto no trecho na última semana.',
    },
  },
  {
    slug: 'onibus-interno-a-noite',
    titulo: 'Ônibus interno até mais tarde',
    descricao: 'Estender o horário do circular do campus até 22h30 nos dias de aula.',
    bloco: null,
    categoria: 'servicos',
    status: 'juntando_apoios',
    marcos: { criada: 25, aprovada: 24 },
    apoios: 287,
    responsaveis: 2,
  },
  {
    slug: 'cadeiras-adequadas-no-ic',
    titulo: 'Cadeiras adequadas nas salas do IC',
    descricao: 'Trocar as cadeiras quebradas e incluir cadeiras para canhotos e pessoas altas.',
    bloco: 'ic',
    categoria: 'infraestrutura',
    status: 'juntando_apoios',
    marcos: { criada: 15, aprovada: 14 },
    apoios: 41,
    responsaveis: 1,
  },
  {
    slug: 'interprete-de-libras-na-fale',
    titulo: 'Intérprete de Libras nas aulas da FALE',
    descricao: 'Garantir intérprete de Libras para os estudantes surdos em todas as disciplinas.',
    bloco: 'fale',
    categoria: 'acessibilidade',
    status: 'juntando_apoios',
    marcos: { criada: 4, aprovada: 3 },
    apoios: 12,
    responsaveis: 1,
  },
  // — Meta batida —
  {
    slug: 'bicicletario-na-edge-academy',
    titulo: 'Bicicletário coberto na EDGE Academy',
    descricao: 'Instalar bicicletário coberto e seguro na entrada da EDGE Academy.',
    bloco: 'edge-academy',
    categoria: 'infraestrutura',
    status: 'meta_batida',
    marcos: { criada: 18, aprovada: 17, metaBatida: 5 },
    apoios: 31,
    responsaveis: 2,
  },
  {
    slug: 'recarga-de-celular-no-ru',
    titulo: 'Pontos de recarga de celular no Restaurante Universitário',
    descricao: 'Colocar tomadas e carregadores no salão do RU para quem espera na fila.',
    bloco: 'ru',
    categoria: 'servicos',
    status: 'meta_batida',
    marcos: { criada: 40, aprovada: 39, metaBatida: 2 },
    apoios: 302,
    responsaveis: 2,
  },
  // — Cobrando —
  {
    slug: 'ventilacao-nas-salas-do-icbs',
    titulo: 'Ventilação nas salas do ICBS',
    descricao: 'Consertar os ventiladores e abrir as janelas travadas das salas do ICBS.',
    bloco: 'icbs',
    categoria: 'infraestrutura',
    status: 'cobrando',
    marcos: { criada: 40, aprovada: 39, metaBatida: 30, cobrando: 18 },
    apoios: 70,
    responsaveis: 2,
  },
  {
    slug: 'chuveiros-na-residencia',
    titulo: 'Chuveiros funcionando na residência universitária',
    descricao: 'Consertar os chuveiros elétricos das alas B e C da residência.',
    bloco: 'residencia-universitaria',
    categoria: 'permanencia',
    status: 'cobrando',
    marcos: { criada: 70, aprovada: 69, metaBatida: 60, cobrando: 40 },
    apoios: 41,
    responsaveis: 2,
  },
  {
    slug: 'rampa-de-acesso-ao-ctec',
    titulo: 'Rampa de acesso à entrada principal do CTEC',
    descricao: 'Reformar a rampa, que tem inclinação acima do permitido e sem corrimão.',
    bloco: 'ctec',
    categoria: 'acessibilidade',
    status: 'cobrando',
    marcos: { criada: 55, aprovada: 54, metaBatida: 45, cobrando: 35 },
    apoios: 112,
    responsaveis: 2,
  },
  {
    slug: 'banheiros-sem-manutencao-no-cedu',
    titulo: 'Manutenção dos banheiros do CEDU',
    descricao: 'Mapear os banheiros sem descarga, sem porta ou sem sabão e cobrar o reparo.',
    bloco: 'cedu',
    categoria: 'infraestrutura',
    status: 'cobrando',
    marcos: { criada: 33, aprovada: 32, metaBatida: 24, cobrando: 20 },
    apoios: 120,
    responsaveis: 2,
  },
  {
    slug: 'xerox-no-bloco-18',
    titulo: 'Reabertura do ponto de cópias do Bloco 18',
    descricao: 'O único ponto de cópias do bloco fechou e não foi substituído.',
    bloco: 'bloco-18',
    categoria: 'servicos',
    status: 'cobrando',
    marcos: { criada: 48, aprovada: 47, metaBatida: 38, cobrando: 28 },
    apoios: 205,
    responsaveis: 1,
  },
  {
    slug: 'armarios-para-a-medicina',
    titulo: 'Armários para estudantes de Medicina',
    descricao: 'Disponibilizar armários com chave para guardar jalecos e material de estágio.',
    bloco: 'famed',
    categoria: 'permanencia',
    status: 'cobrando',
    marcos: { criada: 36, aprovada: 35, metaBatida: 27, cobrando: 12 },
    apoios: 58,
    responsaveis: 2,
  },
  // — Prometido —
  {
    slug: 'bebedouros-no-ginasio',
    titulo: 'Água potável no Ginásio',
    descricao: 'Instalar bebedouros no Ginásio, que hoje não tem nenhum.',
    bloco: 'ginasio',
    categoria: 'infraestrutura',
    status: 'prometido',
    marcos: { criada: 60, aprovada: 59, metaBatida: 50, cobrando: 40, prometido: 8 },
    apoios: 104,
    responsaveis: 2,
  },
  {
    slug: 'sala-de-estudos-no-ic',
    titulo: 'Sala de estudos aberta até mais tarde no IC',
    descricao: 'Manter uma sala de estudos aberta até as 22h no Instituto de Computação.',
    bloco: 'ic',
    categoria: 'ensino',
    status: 'prometido',
    marcos: { criada: 62, aprovada: 61, metaBatida: 52, cobrando: 42, prometido: 14 },
    apoios: 63,
    responsaveis: 2,
  },
  {
    slug: 'troca-das-lampadas-do-ctec',
    titulo: 'Troca das lâmpadas dos corredores do CTEC',
    descricao: 'Trocar as lâmpadas queimadas dos corredores do segundo e terceiro andares.',
    bloco: 'ctec',
    categoria: 'seguranca',
    status: 'prometido',
    marcos: { criada: 75, aprovada: 74, metaBatida: 64, cobrando: 54, prometido: 30 },
    apoios: 105,
    responsaveis: 2,
  },
  // — Resultados da conferência —
  {
    slug: 'banheiros-acessiveis-na-fale',
    titulo: 'Banheiros acessíveis na FALE',
    descricao: 'Adaptar um banheiro por andar para cadeirantes.',
    bloco: 'fale',
    categoria: 'acessibilidade',
    status: 'entregue_em_parte',
    marcos: {
      criada: 90,
      aprovada: 89,
      metaBatida: 80,
      cobrando: 70,
      prometido: 50,
      resultado: 12,
    },
    apoios: 92,
    responsaveis: 2,
  },
  {
    slug: 'wifi-nos-quartos-da-residencia',
    titulo: 'Wi-Fi nos quartos da residência universitária',
    descricao: 'Restabelecer a cobertura de Wi-Fi nos quartos e áreas coletivas.',
    bloco: 'residencia-universitaria',
    categoria: 'tecnologia',
    status: 'descumprida',
    marcos: {
      criada: 100,
      aprovada: 99,
      metaBatida: 90,
      cobrando: 80,
      prometido: 60,
      resultado: 20,
    },
    apoios: 33,
    responsaveis: 2,
  },
  {
    slug: 'laboratorios-abertos-no-contraturno',
    titulo: 'Laboratórios de informática abertos no contraturno',
    descricao: 'Garantir acesso monitorado aos laboratórios para trabalhos e projetos de extensão.',
    bloco: 'ic',
    categoria: 'ensino',
    status: 'conquistada',
    marcos: {
      criada: 110,
      aprovada: 109,
      metaBatida: 100,
      cobrando: 90,
      prometido: 70,
      resultado: 25,
    },
    apoios: 68,
    responsaveis: 3,
  },
  {
    slug: 'onibus-interno-aos-sabados',
    titulo: 'Ônibus interno aos sábados',
    descricao: 'Manter o circular do campus funcionando nos sábados de aula e de prova.',
    bloco: null,
    categoria: 'servicos',
    status: 'conquistada',
    marcos: {
      criada: 130,
      aprovada: 129,
      metaBatida: 115,
      cobrando: 100,
      prometido: 80,
      resultado: 40,
    },
    apoios: 305,
    responsaveis: 2,
  },
];

/** Grava no storage um arquivo de exemplo para a chave (foto JPEG ou PDF). */
export type GuardarArquivo = (chave: string, tipo: 'foto' | 'pdf') => Promise<void>;

export interface OpcoesDoDemo {
  agora?: Date;
  /** Sem ele, o demo sai sem fotos nem PDF (não há storage para guardá-los). */
  guardarArquivo?: GuardarArquivo;
}

export interface ResumoDoDemo {
  fotos: number;
  documentos: number;
  estudantes: number;
  pautas: number;
  apoios: number;
  eventos: number;
}

export async function criarDados(db: Db, opcoes: OpcoesDoDemo = {}): Promise<ResumoDoDemo> {
  const agora = opcoes.agora ?? new Date();
  const { guardarArquivo } = opcoes;
  const pastaDoMes = `${String(agora.getUTCFullYear())}/${String(agora.getUTCMonth() + 1).padStart(2, '0')}`;
  const novaChave = (tipo: 'foto' | 'pdf'): string =>
    tipo === 'foto'
      ? `fotos/${pastaDoMes}/${randomUUID()}.jpg`
      : `respostas/${pastaDoMes}/${randomUUID()}.pdf`;
  await cadastrarBlocosUfal(db);
  const linhasBloco = await db.select().from(blocos);
  const blocoPorSlug = new Map(linhasBloco.map((b) => [b.slug, b]));
  const baseDoSlug = new Map(blocosUfal.map((b) => [b.slug as string, b.baseEstudantes]));

  const curadoresDoBanco = await db.select().from(curadores);
  const curador = curadoresDoBanco.find((c) => c.ativo);
  if (!curador)
    throw new Error('Nenhum curador ativo cadastrado: cadastre um antes de criar o demo.');
  const outroCurador = curadoresDoBanco.find((c) => c.ativo && c.id !== curador.id) ?? curador;

  const atras = (dias: number, hora = 14): Date => {
    const d = new Date(agora.getTime() - dias * DIA);
    d.setUTCHours(hora, 0, 0, 0);
    return d;
  };

  // — Estudantes —
  const pessoas: NovoEstudante[] = Array.from({ length: QUANTIDADE_ESTUDANTES }, (_, i) => {
    const n = String(i + 1).padStart(3, '0');
    return {
      id: randomUUID(),
      telefoneHmac: hmac(`telefone:${n}`),
      telefoneCifrado: cifra('telefone', `demo-${n}`),
      emailHmac: hmac(`email:${n}`),
      emailCifrado: cifra('email', `estudante.${n}@demo.invalid`),
      curso: CURSOS[i % CURSOS.length] ?? null,
      verificadoEm: atras(150),
    };
  });
  await db.insert(estudantes).values([
    ...pessoas,
    // Cadastro que não terminou a verificação do e-mail (2.4).
    {
      id: randomUUID(),
      telefoneHmac: hmac('telefone:sem-verificar'),
      telefoneCifrado: cifra('telefone', 'demo-sem-verificar'),
    },
    // Quem usou o `sair`: o telefone vira lápide e o e-mail cifrado some (3.x).
    {
      id: randomUUID(),
      telefoneHmac: hmac('telefone:saiu'),
      telefoneCifrado: 'lapide',
      emailHmac: hmac('email:saiu'),
      curso: 'Direito',
      verificadoEm: atras(120),
      saiuEm: atras(10),
    },
  ]);
  const ids = pessoas.map((p) => p.id as string);
  const estudanteDe = (i: number): string =>
    ids[((i % ids.length) + ids.length) % ids.length] as string;

  const listaPautas: NovaPauta[] = [];
  const listaPapeis: NovoPapelPauta[] = [];
  const listaApoios: NovoApoio[] = [];
  const listaEventos: NovoEvento[] = [];
  const idDaPauta = new Map<string, string>();
  /** Quem apoia cada pauta, na ordem; os primeiros cuidam dela. */
  const apoiadoresDa = new Map<string, string[]>();
  const metaDaPauta = new Map<string, number>();

  const evento = (
    slug: string,
    tipo: string,
    dados: Record<string, unknown>,
    origem: NovoEvento['origem'],
    quando: Date,
  ): void => {
    const regra = PUBLICO[tipo];
    if (regra === undefined) throw new Error(`Tipo de evento fora do catálogo: ${tipo}`);
    listaEventos.push({
      pautaId: idDaPauta.get(slug) as string,
      tipo,
      dados,
      origem,
      publico: typeof regra === 'function' ? regra(dados) : regra,
      criadoEm: quando,
    });
  };

  ESPECIFICACOES.forEach((spec, indice) => {
    const id = randomUUID();
    idDaPauta.set(spec.slug, id);
    const bloco = spec.bloco === null ? null : blocoPorSlug.get(spec.bloco);
    if (spec.bloco !== null && !bloco) throw new Error(`Bloco inexistente: ${spec.bloco}`);
    const meta = metaDoBloco(spec.bloco === null ? null : (baseDoSlug.get(spec.bloco) ?? 0));
    metaDaPauta.set(spec.slug, meta);
    const m = spec.marcos;

    const pauta: NovaPauta = {
      id,
      slug: spec.slug,
      titulo: spec.titulo,
      descricao: spec.descricao,
      blocoId: bloco?.id ?? null,
      categoria: spec.categoria,
      status: spec.status,
      meta,
      criadaEm: atras(m.criada, 10),
    };
    if (m.aprovada !== undefined) {
      pauta.aprovadaEm = atras(m.aprovada, 11);
      pauta.decididaPor = indice % 2 === 0 ? curador.id : outroCurador.id;
    }
    if (spec.status === 'recusada') {
      pauta.motivoRecusa = spec.motivoRecusa ?? null;
      pauta.decididaPor = curador.id;
    }
    if (m.metaBatida !== undefined) pauta.metaBatidaEm = atras(m.metaBatida, 9);
    if (spec.urgente) {
      pauta.urgente = true;
      pauta.urgenteDesde = atras(spec.urgente.diasAtras, 8);
      pauta.urgentePor = curador.id;
      pauta.urgenteMotivo = spec.urgente.motivo;
    }
    listaPautas.push(pauta);

    // Responsáveis e apoiadores: janelas diferentes de estudantes por pauta.
    const inicio = indice * 11;
    const apoiadores = Array.from({ length: spec.apoios }, (_, i) => estudanteDe(inicio + i));
    apoiadoresDa.set(spec.slug, apoiadores);
    const donos = Array.from({ length: spec.responsaveis }, (_, i) => estudanteDe(inicio + i));
    donos.forEach((estudanteId, i) => {
      listaPapeis.push({
        pautaId: id,
        estudanteId,
        papel: i === 0 ? 'owner' : 'co_owner',
        desde: atras(m.criada, 10 + i).toISOString(),
        ultimaAtividadeEm: atras(Math.min(m.criada, 3), 10),
      });
    });
    // Apoios: depois da aprovação e, quando a meta foi batida, antes dela.
    if (m.aprovada !== undefined && spec.apoios > 0) {
      const de = atras(m.aprovada, 12).getTime();
      const ate =
        m.metaBatida !== undefined ? atras(m.metaBatida, 8).getTime() : agora.getTime() - 3_600_000;
      apoiadores.forEach((estudanteId, i) => {
        listaApoios.push({
          pautaId: id,
          estudanteId,
          origem: i % 3 === 0 ? 'site' : 'bot',
          criadoEm: new Date(de + ((ate - de) * (i + 1)) / (spec.apoios + 1)),
        });
      });
    }

    // Linha do tempo.
    evento(spec.slug, 'pauta_criada', { status: 'em_curadoria' }, 'bot', atras(m.criada, 10));
    donos.slice(1).forEach((_, i) => {
      evento(spec.slug, 'owner_entrou', { papel: 'co_owner' }, 'bot', atras(m.criada, 11 + i));
    });
    if (spec.status === 'recusada') {
      evento(
        spec.slug,
        'status_alterado',
        { de: 'em_curadoria', para: 'recusada' },
        'curadoria',
        atras(m.criada - 1, 9),
      );
      evento(spec.slug, 'pauta_recusada', {}, 'curadoria', atras(m.criada - 1, 9));
      return;
    }
    if (m.aprovada === undefined) return;
    evento(
      spec.slug,
      'status_alterado',
      { de: 'em_curadoria', para: 'juntando_apoios' },
      'curadoria',
      atras(m.aprovada, 11),
    );
    evento(spec.slug, 'pauta_aprovada', {}, 'curadoria', atras(m.aprovada, 11));
    let anterior: StatusPauta = 'juntando_apoios';
    const passar = (para: StatusPauta, quando: Date, origem: NovoEvento['origem']): void => {
      evento(spec.slug, 'status_alterado', { de: anterior, para }, origem, quando);
      anterior = para;
    };
    if (m.metaBatida !== undefined) {
      evento(spec.slug, 'meta_batida', { meta, apoios: meta }, 'bot', atras(m.metaBatida, 9));
      passar('meta_batida', atras(m.metaBatida, 9), 'bot');
    }
    if (m.cobrando !== undefined) passar('cobrando', atras(m.cobrando, 10), 'bot');
    if (m.prometido !== undefined) passar('prometido', atras(m.prometido, 10), 'curadoria');
    if (m.resultado !== undefined) passar(spec.status, atras(m.resultado, 12), 'agendador');
    if (spec.urgente) {
      evento(
        spec.slug,
        'pauta_urgente',
        { urgente: true },
        'curadoria',
        atras(spec.urgente.diasAtras, 8),
      );
    }
  });

  const pautaId = (slug: string): string => idDaPauta.get(slug) as string;
  const apoiadores = (slug: string): string[] => apoiadoresDa.get(slug) as string[];
  const spec = (slug: string): Especificacao =>
    ESPECIFICACOES.find((s) => s.slug === slug) as Especificacao;
  const marcos = (slug: string): Marcos => spec(slug).marcos;

  // — Relatos: pendente, aprovado e recusado, em pautas diferentes —
  const listaRelatos: NovoRelato[] = [];
  const relatoDe = new Map<string, string>();
  const relatar = (
    slug: string,
    quem: number,
    texto: string,
    moderacao: 'pendente' | 'aprovado' | 'recusado',
    diasAtras: number,
  ): void => {
    const id = randomUUID();
    relatoDe.set(`${slug}:${String(quem)}`, id);
    const moderadoEm = moderacao === 'pendente' ? null : atras(diasAtras - 1, 16);
    listaRelatos.push({
      id,
      pautaId: pautaId(slug),
      estudanteId: apoiadores(slug)[quem] as string,
      texto,
      moderacao,
      moderadoEm,
      moderadoPor: moderacao === 'pendente' ? null : curador.id,
    });
    if (moderacao === 'aprovado') {
      evento(slug, 'relato_aprovado', { relato_id: id }, 'curadoria', moderadoEm as Date);
    }
  };
  relatar(
    'bebedouros-funcionando-no-bloco-18',
    3,
    'O bebedouro do segundo andar está sem refrigeração há semanas.',
    'aprovado',
    9,
  );
  relatar(
    'bebedouros-funcionando-no-bloco-18',
    5,
    'No térreo a água sai com gosto de ferrugem.',
    'pendente',
    1,
  );
  relatar(
    'iluminacao-na-passarela-do-csau',
    4,
    'Saio da aula às 21h40 e o trecho até o ponto é todo escuro.',
    'aprovado',
    6,
  );
  relatar(
    'iluminacao-na-passarela-do-csau',
    8,
    'Ontem quase fui atropelada por uma moto porque não dava para ver o meio-fio.',
    'pendente',
    0,
  );
  relatar(
    'onibus-interno-a-noite',
    6,
    'Moro no Benedito Bentes e o último circular sai quando a aula ainda não acabou.',
    'aprovado',
    15,
  );
  relatar(
    'cadeiras-adequadas-no-ic',
    2,
    'Relato recusado: continha o nome de um professor e uma acusação sem prova.',
    'recusado',
    8,
  );
  relatar(
    'ventilacao-nas-salas-do-icbs',
    7,
    'Na sala 4 a temperatura passa dos 32 graus em dia de prova.',
    'aprovado',
    20,
  );
  relatar(
    'rampa-de-acesso-ao-ctec',
    3,
    'Sou cadeirante e preciso de ajuda de duas pessoas para subir a rampa.',
    'aprovado',
    30,
  );
  relatar(
    'chuveiros-na-residencia',
    2,
    'Estamos há duas semanas tomando banho frio na ala B.',
    'pendente',
    2,
  );
  relatar(
    'laboratorios-abertos-no-contraturno',
    5,
    'Agora consigo terminar o trabalho de projeto depois do almoço.',
    'aprovado',
    24,
  );
  relatar(
    'onibus-interno-aos-sabados',
    9,
    'Voltei a poder ir à biblioteca nos sábados de prova.',
    'aprovado',
    39,
  );

  // — Fotos dos relatos (cada uma é moderada sozinha) e fotos abandonadas na fila de remoção —
  const listaFotos: Array<typeof relatoFotos.$inferInsert> = [];
  const fotografar = async (
    slug: string,
    quem: number,
    fotos: Array<{ moderacao: 'pendente' | 'aprovado' | 'recusado'; motivo?: string }>,
  ): Promise<void> => {
    if (!guardarArquivo) return;
    const relatoId = relatoDe.get(`${slug}:${String(quem)}`) as string;
    for (const [i, foto] of fotos.entries()) {
      const chave = novaChave('foto');
      await guardarArquivo(chave, 'foto');
      const decidida = foto.moderacao !== 'pendente';
      listaFotos.push({
        relatoId,
        chave,
        ordem: i + 1,
        moderacao: foto.moderacao,
        motivoRecusa: foto.motivo ?? null,
        moderadoEm: decidida ? atras(1, 17) : null,
        moderadoPor: decidida ? curador.id : null,
        criadaEm: atras(2, 9),
      });
    }
  };
  await fotografar('bebedouros-funcionando-no-bloco-18', 3, [
    { moderacao: 'aprovado' },
    { moderacao: 'aprovado' },
    {
      moderacao: 'recusado',
      motivo: 'A foto mostra o rosto de uma pessoa; tire outra sem ninguém.',
    },
  ]);
  await fotografar('bebedouros-funcionando-no-bloco-18', 5, [{ moderacao: 'pendente' }]);
  await fotografar('iluminacao-na-passarela-do-csau', 4, [
    { moderacao: 'aprovado' },
    { moderacao: 'aprovado' },
  ]);
  await fotografar('iluminacao-na-passarela-do-csau', 8, [{ moderacao: 'pendente' }]);
  await fotografar('rampa-de-acesso-ao-ctec', 3, [{ moderacao: 'aprovado' }]);
  await fotografar('chuveiros-na-residencia', 2, [
    { moderacao: 'pendente' },
    { moderacao: 'pendente' },
  ]);
  await fotografar('laboratorios-abertos-no-contraturno', 5, [{ moderacao: 'aprovado' }]);
  const fotosParaRemover = guardarArquivo
    ? [{ chave: novaChave('foto'), enfileiradaEm: atras(1), tentativas: 2 }]
    : [];

  // — Pedidos de edição: pendente, aprovado e recusado —
  const listaPedidos: Array<typeof pedidosEdicao.$inferInsert> = [];
  const novoTitulo = 'Iluminação na passarela entre o CSAU e o ponto de ônibus';
  listaPedidos.push({
    pautaId: pautaId('iluminacao-na-passarela-do-csau'),
    estudanteId: apoiadores('iluminacao-na-passarela-do-csau')[0] as string,
    campo: 'titulo',
    antes: spec('iluminacao-na-passarela-do-csau').titulo,
    depois: novoTitulo,
    status: 'pendente',
    criadoEm: atras(1, 15),
  });
  const descricaoNova =
    'Trocar as cadeiras quebradas e incluir cadeiras para canhotos e pessoas altas, começando pelas salas 1 a 4.';
  listaPedidos.push({
    pautaId: pautaId('cadeiras-adequadas-no-ic'),
    estudanteId: apoiadores('cadeiras-adequadas-no-ic')[0] as string,
    campo: 'descricao',
    antes: spec('cadeiras-adequadas-no-ic').descricao,
    depois: descricaoNova,
    status: 'aprovado',
    criadoEm: atras(6, 15),
    decididoEm: atras(5, 10),
    decididoPor: curador.id,
  });
  listaPedidos.push({
    pautaId: pautaId('cadeiras-adequadas-no-ic'),
    estudanteId: apoiadores('cadeiras-adequadas-no-ic')[0] as string,
    campo: 'titulo',
    antes: spec('cadeiras-adequadas-no-ic').titulo,
    depois: 'Cadeiras novas para todo o prédio do IC',
    status: 'recusado',
    motivoRecusa: 'O novo título promete mais do que a pauta pede: ela trata só das salas de aula.',
    criadoEm: atras(4, 15),
    decididoEm: atras(3, 10),
    decididoPor: outroCurador.id,
  });
  evento(
    'cadeiras-adequadas-no-ic',
    'pauta_editada',
    {
      campo: 'descricao',
      antes: spec('cadeiras-adequadas-no-ic').descricao,
      depois: descricaoNova,
    },
    'curadoria',
    atras(5, 10),
  );

  // — Responsáveis que saíram: por conta própria e removido por inatividade —
  const saiu = (slug: string, indice: number, motivo?: 'inatividade'): void => {
    const papel = listaPapeis.filter((p) => p.pautaId === pautaId(slug))[indice];
    if (!papel) throw new Error(`Sem responsável ${String(indice)} em ${slug}`);
    papel.ate = atras(4, 10);
    evento(
      slug,
      'owner_removido',
      motivo ? { papel: papel.papel, motivo } : { papel: papel.papel },
      motivo ? 'agendador' : 'bot',
      atras(4, 10),
    );
  };
  saiu('iluminacao-na-passarela-do-csau', 2);
  saiu('bebedouros-funcionando-no-bloco-18', 1, 'inatividade');
  evento(
    'cadeiras-adequadas-no-ic',
    'bloco_corrigido',
    {
      blocoAntes: null,
      blocoDepois: 'IC - Instituto de Computação',
      metaAntes: 300,
      metaDepois: 59,
      motivo: 'A pauta é só das salas do IC.',
    },
    'curadoria',
    atras(13, 10),
  );

  // — Outros ajustes da curadoria na linha do tempo —
  evento(
    'onibus-interno-a-noite',
    'categoria_alterada',
    { de: 'infraestrutura', para: 'servicos' },
    'curadoria',
    atras(23, 10),
  );
  evento(
    'rampa-de-acesso-ao-ctec',
    'meta_ajustada',
    { metaAntes: 60, metaDepois: 100, motivo: 'Conferência da base do bloco.' },
    'curadoria',
    atras(50, 10),
  );

  // — Caminhos, propostas, promessas e respostas —
  const listaCaminhos: Array<typeof caminhos.$inferInsert> = [];
  const listaPropostas: NovaProposta[] = [];
  const listaVoluntarios: NovoVoluntario[] = [];
  const listaPromessas: NovaPromessa[] = [];
  const listaRespostas: NovaRespostaConferencia[] = [];

  /** Fala.BR protocolado `protocoladoHa` dias atrás; o prazo é de 30 dias, ou 60 se prorrogado. */
  const falabr = (
    slug: string,
    protocoladoHa: number,
    opcoes: { prorrogado?: boolean; status?: string } = {},
  ): string => {
    const id = randomUUID();
    const protocoloEm = atras(protocoladoHa);
    const prazo = new Date(protocoloEm.getTime() + (opcoes.prorrogado ? 60 : 30) * DIA);
    const numero = `FALABR-DEMO-2026-${String(listaCaminhos.length + 1).padStart(4, '0')}`;
    listaCaminhos.push({
      id,
      pautaId: pautaId(slug),
      tipo: 'falabr',
      status: opcoes.status ?? 'aguardando resposta',
      protocolo: numero,
      protocoloEm: diaCivil(protocoloEm),
      prazo: diaCivil(prazo),
      prorrogado: opcoes.prorrogado ?? false,
      abertoEm: atras(protocoladoHa + 1),
    });
    evento(
      slug,
      'caminho_aberto',
      { caminho_id: id, tipo: 'falabr' },
      'bot',
      atras(protocoladoHa + 1),
    );
    evento(
      slug,
      'protocolo_registrado',
      { caminho_id: id, protocolo: numero, prorrogado: opcoes.prorrogado ?? false },
      'bot',
      protocoloEm,
    );
    return id;
  };

  const comunidade = (
    slug: string,
    aberto: number,
    tipo: 'comunidade' | 'representante',
    status: string,
  ): string => {
    const id = randomUUID();
    listaCaminhos.push({ id, pautaId: pautaId(slug), tipo, status, abertoEm: atras(aberto) });
    evento(slug, 'caminho_aberto', { caminho_id: id, tipo }, 'bot', atras(aberto));
    return id;
  };

  // Sem resposta ainda, em dias diferentes do prazo.
  falabr('ventilacao-nas-salas-do-icbs', 18); // vence em 12 dias
  falabr('chuveiros-na-residencia', 35); // venceu há 5 dias
  const caminhoProrrogado = falabr('rampa-de-acesso-ao-ctec', 40, { prorrogado: true });
  evento(
    'rampa-de-acesso-ao-ctec',
    'prazo_prorrogado',
    {
      caminho_id: caminhoProrrogado,
      data_antiga: diaCivil(atras(10)),
      data_nova: diaCivil(atras(-20)),
      motivo: 'A ouvidoria comunicou a prorrogação por mais 30 dias.',
      fonte: 'E-mail da ouvidoria',
    },
    'curadoria',
    atras(12),
  );

  // Caminho da comunidade, com proposta aberta e voluntários.
  comunidade('banheiros-sem-manutencao-no-cedu', 20, 'comunidade', 'mutirão de mapeamento');
  const propostaAberta = randomUUID();
  listaPropostas.push({
    id: propostaAberta,
    pautaId: pautaId('banheiros-sem-manutencao-no-cedu'),
    descricao: 'Mutirão para fotografar e listar cada banheiro com problema, andar por andar.',
    pessoasNecessarias: 4,
    status: 'aberta',
  });
  evento(
    'banheiros-sem-manutencao-no-cedu',
    'proposta_publicada',
    { proposta_id: propostaAberta, pessoas_necessarias: 4 },
    'bot',
    atras(14),
  );
  [10, 11].forEach((i, k) => {
    listaVoluntarios.push({
      propostaId: propostaAberta,
      estudanteId: apoiadores('banheiros-sem-manutencao-no-cedu')[i] as string,
      criadoEm: atras(13 - k),
    });
  });

  // Caminho do representante.
  comunidade('xerox-no-bloco-18', 28, 'representante', 'conversando com o centro acadêmico');

  // Fala.BR respondido, aguardando a curadoria registrar a promessa.
  const respondido = falabr('armarios-para-a-medicina', 14, { status: 'respondido' });
  evento(
    'armarios-para-a-medicina',
    'resposta_oficial_recebida',
    { caminho_id: respondido },
    'bot',
    atras(3),
  );

  /** Promessa para `entrega` (dias a partir de hoje; negativo = no passado). */
  const prometer = (
    slug: string,
    entregaEmDias: number,
    resumo: string,
    fonte: string,
    resultado: string | null,
    registradaHa: number,
  ): { id: string; abre: Date; fecha: Date } => {
    const id = randomUUID();
    const dia = diaCivil(atras(-entregaEmDias));
    const abre = new Date(`${dia}T03:00:00.000Z`); // meia-noite em Maceió
    const fecha = new Date(abre.getTime() + 7 * DIA);
    listaPromessas.push({
      id,
      pautaId: pautaId(slug),
      resumo,
      dataEntrega: dia,
      fonte,
      registradaPor: curador.id,
      conferenciaAbreEm: abre,
      conferenciaFechaEm: fecha,
      resultado,
    });
    evento(
      slug,
      'promessa_registrada',
      { promessa_id: id, data_entrega: dia, resumo, fonte },
      'curadoria',
      atras(registradaHa, 10),
    );
    return { id, abre, fecha };
  };

  /** Respostas de apoiadores (a partir do 5º, para não contar os responsáveis) dentro da janela. */
  const responder = (
    slug: string,
    promessaId: string,
    abre: Date,
    votos: Array<['sim' | 'em_parte' | 'nao', number]>,
  ): number => {
    const lista = votos.flatMap(([resposta, n]) => Array.from({ length: n }, () => resposta));
    lista.forEach((resposta, i) => {
      listaRespostas.push({
        promessaId,
        estudanteId: apoiadores(slug)[4 + i] as string,
        resposta,
        criadoEm: new Date(
          Math.min(abre.getTime() + (i + 1) * 3_600_000, agora.getTime() - 60_000),
        ),
      });
    });
    return lista.length;
  };

  // Prometido: conferência ainda fechada.
  prometer(
    'bebedouros-no-ginasio',
    10,
    'Instalar dois bebedouros na entrada principal do Ginásio.',
    'Ofício 112/2026 da Prefeitura do Campus',
    null,
    marcos('bebedouros-no-ginasio').prometido as number,
  );

  // Prometido: conferência aberta agora, com respostas chegando.
  const aberta = prometer(
    'sala-de-estudos-no-ic',
    -3,
    'Manter a sala 105 aberta das 8h às 22h, de segunda a sexta.',
    'Ata da reunião do colegiado do IC',
    null,
    marcos('sala-de-estudos-no-ic').prometido as number,
  );
  const abertaFecha = aberta.fecha;
  evento(
    'sala-de-estudos-no-ic',
    'conferencia_aberta',
    { promessa_id: aberta.id, fecha_em: abertaFecha.toISOString() },
    'agendador',
    aberta.abre,
  );
  responder('sala-de-estudos-no-ic', aberta.id, aberta.abre, [
    ['sim', 5],
    ['em_parte', 2],
    ['nao', 1],
  ]);

  // Prometido: promessa remarcada.
  const remarcada = prometer(
    'troca-das-lampadas-do-ctec',
    20,
    'Trocar as lâmpadas dos corredores até o fim do mês.',
    'Resposta ao protocolo no Fala.BR',
    null,
    marcos('troca-das-lampadas-do-ctec').prometido as number,
  );
  evento(
    'troca-das-lampadas-do-ctec',
    'promessa_remarcada',
    {
      promessa_id: remarcada.id,
      data_antiga: diaCivil(atras(5)),
      data_nova: diaCivil(atras(-20)),
      motivo: 'A compra das lâmpadas atrasou.',
      fonte: 'E-mail da Prefeitura do Campus',
    },
    'curadoria',
    atras(6, 10),
  );

  // Fala.BR respondido nas pautas que já têm promessa, e o PDF da resposta (3.6) em algumas.
  const listaDocumentos: Array<typeof documentosResposta.$inferInsert> = [];
  const documentar = async (
    slug: string,
    caminhoId: string,
    recebidoHa: number,
    promessaId: string | null,
  ): Promise<void> => {
    if (!guardarArquivo) return;
    const arquivoChave = novaChave('pdf');
    await guardarArquivo(arquivoChave, 'pdf');
    listaDocumentos.push({
      pautaId: pautaId(slug),
      caminhoId,
      enviadoPor: apoiadores(slug)[0] as string,
      arquivoChave,
      recebidoEm: atras(recebidoHa, 11),
      promessaId,
    });
  };
  const respostaOficial = (slug: string, protocoladoHa: number): string => {
    const caminho = falabr(slug, protocoladoHa, { status: 'respondido' });
    evento(
      slug,
      'resposta_oficial_recebida',
      { caminho_id: caminho },
      'bot',
      atras((marcos(slug).prometido as number) + 1, 11),
    );
    return caminho;
  };
  await documentar('armarios-para-a-medicina', respondido, 3, null);
  evento(
    'armarios-para-a-medicina',
    'protocolo_corrigido',
    {
      caminho_id: respondido,
      data_antiga: diaCivil(atras(15)),
      data_nova: diaCivil(atras(14)),
      motivo: 'O protocolo foi digitado com o dia errado.',
      fonte: 'Comprovante do Fala.BR',
    },
    'curadoria',
    atras(13, 10),
  );
  await documentar(
    'sala-de-estudos-no-ic',
    respostaOficial('sala-de-estudos-no-ic', 30),
    15,
    aberta.id,
  );
  respostaOficial('bebedouros-no-ginasio', 25);
  await documentar(
    'troca-das-lampadas-do-ctec',
    respostaOficial('troca-das-lampadas-do-ctec', 45),
    31,
    remarcada.id,
  );

  // Resultados apurados.
  const resolver = (
    slug: string,
    resultado: 'entregue_em_parte' | 'descumprida' | 'conquistada',
    entregaHa: number,
    resumo: string,
    fonte: string,
    votos: Array<['sim' | 'em_parte' | 'nao', number]>,
  ): string => {
    const m = marcos(slug);
    const p = prometer(slug, -entregaHa, resumo, fonte, resultado, m.prometido as number);
    evento(
      slug,
      'conferencia_aberta',
      { promessa_id: p.id, fecha_em: p.fecha.toISOString() },
      'agendador',
      p.abre,
    );
    const total = responder(slug, p.id, p.abre, votos);
    evento(
      slug,
      'conferencia_apurada',
      { promessa_id: p.id, resultado, total_respostas: total },
      'agendador',
      p.fecha,
    );
    return p.id;
  };
  resolver(
    'banheiros-acessiveis-na-fale',
    'entregue_em_parte',
    25,
    'Adaptar um banheiro por andar para cadeirantes.',
    'Ofício da direção da FALE',
    [
      ['em_parte', 6],
      ['sim', 4],
      ['nao', 3],
    ],
  );
  resolver(
    'wifi-nos-quartos-da-residencia',
    'descumprida',
    35,
    'Instalar pontos de acesso em todas as alas.',
    'Resposta ao protocolo no Fala.BR',
    [
      ['nao', 5],
      ['em_parte', 1],
    ],
  );
  resolver(
    'laboratorios-abertos-no-contraturno',
    'conquistada',
    35,
    'Abrir dois laboratórios no contraturno, de segunda a sexta.',
    'Portaria da unidade acadêmica',
    [
      ['sim', 10],
      ['em_parte', 2],
    ],
  );
  resolver(
    'onibus-interno-aos-sabados',
    'conquistada',
    50,
    'Colocar o circular para rodar aos sábados letivos.',
    'Portaria da Prefeitura do Campus',
    [
      ['sim', 40],
      ['em_parte', 6],
      ['nao', 4],
    ],
  );

  // Proposta da comunidade executada e "o que foi feito" da conquista.
  const propostaExecutada = randomUUID();
  listaPropostas.push({
    id: propostaExecutada,
    pautaId: pautaId('laboratorios-abertos-no-contraturno'),
    descricao: 'Levantar quantos estudantes usariam os laboratórios depois das 18h.',
    pessoasNecessarias: 3,
    status: 'executada',
    executadaEm: atras(80, 16),
  });
  [12, 13, 14].forEach((i) => {
    listaVoluntarios.push({
      propostaId: propostaExecutada,
      estudanteId: apoiadores('laboratorios-abertos-no-contraturno')[i] as string,
      criadoEm: atras(85),
    });
  });
  evento(
    'laboratorios-abertos-no-contraturno',
    'proposta_publicada',
    { proposta_id: propostaExecutada, pessoas_necessarias: 3 },
    'bot',
    atras(86),
  );
  evento(
    'laboratorios-abertos-no-contraturno',
    'proposta_executada',
    { proposta_id: propostaExecutada },
    'bot',
    atras(80, 16),
  );
  evento(
    'laboratorios-abertos-no-contraturno',
    'conquista_atualizada',
    { texto: true, foto: false },
    'curadoria',
    atras(24),
  );
  const fotoDaConquista = guardarArquivo ? novaChave('foto') : null;
  if (fotoDaConquista && guardarArquivo) await guardarArquivo(fotoDaConquista, 'foto');
  evento(
    'onibus-interno-aos-sabados',
    'conquista_atualizada',
    { texto: true, foto: fotoDaConquista !== null },
    'curadoria',
    atras(39),
  );

  // — Avisos já processados (nenhum pendente: o demo não deve mandar mensagem a ninguém) —
  const modelo = (
    tipo: NovoDisparo['tipo'],
    nome: string,
    slug: string,
    i: number,
    extra: Partial<NovoDisparo>,
    params: string[],
  ): NovoDisparo => ({
    tipo,
    aviso: pautaId(slug),
    // Pauta recusada não tem apoiador: o aviso vai a quem a criou (o primeiro dos responsáveis).
    estudanteId:
      apoiadores(slug)[i] ?? estudanteDe(ESPECIFICACOES.findIndex((s) => s.slug === slug) * 11),
    modelo: nome,
    parametros: params,
    enfileiradoEm: atras(3),
    reservadoEm: atras(3),
    enviadoEm: atras(3),
    wamidHmac: hmac(`wamid:${slug}:${tipo}:${String(i)}`),
    ...extra,
  });
  const listaDisparos: NovoDisparo[] = [
    modelo(
      'meta_batida',
      'lumens_meta_batida',
      'recarga-de-celular-no-ru',
      0,
      { entregueEm: atras(3) },
      [spec('recarga-de-celular-no-ru').titulo, '300'],
    ),
    modelo(
      'conferencia',
      'lumens_conferencia',
      'sala-de-estudos-no-ic',
      1,
      { entregueEm: atras(3) },
      [
        spec('sala-de-estudos-no-ic').titulo,
        diaCivil(aberta.abre),
        'manter a sala 105 aberta',
        diaCivil(abertaFecha),
      ],
    ),
    modelo(
      'vitoria',
      'lumens_conquista',
      'onibus-interno-aos-sabados',
      2,
      { entregueEm: atras(40) },
      [spec('onibus-interno-aos-sabados').titulo],
    ),
    modelo(
      'recusa',
      'lumens_pauta_recusada',
      'ar-condicionado-em-todas-as-salas',
      0,
      {
        falhouEm: atras(19),
        wamidHmac: null,
        falha: 'Fora da janela de 24h e sem modelo aprovado.',
      },
      [spec('ar-condicionado-em-todas-as-salas').titulo, 'Reenvie dizendo quais salas.'],
    ),
    modelo(
      'resposta_oficial',
      'lumens_resposta_oficial',
      'sala-de-estudos-no-ic',
      3,
      { entregueEm: atras(14) },
      [
        spec('sala-de-estudos-no-ic').titulo,
        'Prefeitura do Campus',
        'a sala 105 abre das 8h às 22h.',
      ],
    ),
    modelo(
      'lembrete',
      'lumens_lembrete_prazo',
      'chuveiros-na-residencia',
      0,
      { entregueEm: atras(6) },
      [spec('chuveiros-na-residencia').titulo, diaCivil(atras(5))],
    ),
    modelo(
      'aprovacao',
      'lumens_pauta_aprovada',
      'iluminacao-na-passarela-do-csau',
      0,
      { entregueEm: atras(8) },
      [spec('iluminacao-na-passarela-do-csau').titulo],
    ),
    modelo(
      'remarcacao',
      'lumens_promessa_remarcada',
      'troca-das-lampadas-do-ctec',
      4,
      { entregueEm: atras(6) },
      [spec('troca-das-lampadas-do-ctec').titulo, diaCivil(atras(5)), diaCivil(atras(-20))],
    ),
    modelo(
      'foto_recusada',
      'lumens_foto_recusada',
      'bebedouros-funcionando-no-bloco-18',
      3,
      { entregueEm: atras(1) },
      [spec('bebedouros-funcionando-no-bloco-18').titulo, 'A foto mostra o rosto de uma pessoa.'],
    ),
    modelo(
      'edicao_decidida',
      'lumens_edicao_aprovada',
      'cadeiras-adequadas-no-ic',
      0,
      { entregueEm: atras(5) },
      [spec('cadeiras-adequadas-no-ic').titulo],
    ),
  ];

  // — Gravação, com os eventos em ordem cronológica para a `seq` seguir a história —
  listaEventos.sort((a, b) => (a.criadoEm as Date).getTime() - (b.criadoEm as Date).getTime());
  await db.transaction(async (tx) => {
    await tx.insert(pautas).values(listaPautas);
    await tx.insert(papeisPauta).values(listaPapeis);
    for (let i = 0; i < listaApoios.length; i += 500) {
      await tx.insert(apoios).values(listaApoios.slice(i, i + 500));
    }
    await tx.insert(relatos).values(listaRelatos);
    await tx.insert(pedidosEdicao).values(listaPedidos);
    await tx.insert(caminhos).values(listaCaminhos);
    await tx.insert(propostas).values(listaPropostas);
    await tx.insert(voluntarios).values(listaVoluntarios);
    await tx.insert(promessas).values(listaPromessas);
    await tx.insert(respostasConferencia).values(listaRespostas);
    await tx.insert(conquistasDaCuradoria).values([
      {
        pautaId: pautaId('laboratorios-abertos-no-contraturno'),
        oQueFoiFeito:
          'Dois laboratórios do IC passaram a abrir das 18h às 22h, de segunda a sexta.',
        fotoChave: null,
        atualizadoPor: curador.id,
        atualizadoEm: atras(24),
      },
      {
        pautaId: pautaId('onibus-interno-aos-sabados'),
        oQueFoiFeito: 'O circular do campus voltou a rodar aos sábados letivos, das 7h às 19h.',
        fotoChave: fotoDaConquista,
        atualizadoPor: outroCurador.id,
        atualizadoEm: atras(39),
      },
    ]);
    if (listaFotos.length > 0) await tx.insert(relatoFotos).values(listaFotos);
    if (listaDocumentos.length > 0) await tx.insert(documentosResposta).values(listaDocumentos);
    if (fotosParaRemover.length > 0) await tx.insert(fotosARemover).values(fotosParaRemover);
    await tx.insert(disparos).values(listaDisparos);
    await tx.insert(eventos).values(listaEventos);
  });

  return {
    fotos: listaFotos.length + (fotoDaConquista ? 1 : 0),
    documentos: listaDocumentos.length,
    estudantes: pessoas.length + 2,
    pautas: listaPautas.length,
    apoios: listaApoios.length,
    eventos: listaEventos.length,
  };
}
