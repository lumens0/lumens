/**
 * RF-B03 · RN06 · Criar pauta nova (história 2.6).
 *
 * Uma chamada, uma transação, quatro gravações:
 *
 *   1. a pauta, em `em_curadoria`, com a meta já calculada pelo bloco (RN04) e congelada;
 *   2. o criador como `owner` (RN06), que é quem a pauta avisa e quem pode chamar co-owners;
 *   3. o primeiro relato da pauta, com a foto, se houver: é por ele que a curadoria vê a foto
 *      (a tabela `pauta` não tem coluna de foto) e o texto original de quem relatou;
 *   4. os eventos `pauta_criada` e `owner_entrou`. Nenhum dos dois aparece no site enquanto a
 *      pauta está em curadoria: as views públicas só mostram pautas aprovadas.
 *
 * Recusas voltam como resultado, sem exceção, como em `registrarApoio`: o bot transforma cada
 * motivo numa mensagem para a pessoa.
 */
import { randomUUID } from 'node:crypto';
import { blocos, eq, estudantes, papeisPauta, pautas, relatos, type Tx } from '@lumens/db';
import { registrarEvento } from './eventos';
import { calcularMeta } from './meta';

/** Limite do título (RF-B03): cabe numa linha do site e numa notificação do WhatsApp. */
export const TITULO_MAXIMO = 80;

/** Limite da descrição: o suficiente para explicar o problema sem virar um texto de várias telas. */
export const DESCRICAO_MAXIMA = 2000;

/**
 * Categoria de toda pauta nova. O bot não pergunta a categoria (a lista de perguntas da 2.6 é
 * título, local, descrição e foto): quem classifica é a curadoria, ao aprovar.
 */
export const CATEGORIA_A_CLASSIFICAR = 'a_classificar';

export interface NovaPautaDoEstudante {
  estudanteId: string;
  titulo: string;
  descricao: string;
  /** `null` = pauta do campus inteiro (meta máxima, RN04). */
  blocoId: string | null;
  /**
   * Texto original de quem relatou, quando a pauta nasce de um relato (2.5). Vira o primeiro
   * relato da pauta; sem ele, o primeiro relato é a própria descrição.
   */
  relato?: string;
  /** Chave da foto já sem metadados no storage. */
  fotoChave?: string | null;
  agora?: Date;
}

export type ResultadoCriacao =
  | { criada: true; pautaId: string; slug: string; meta: number }
  | {
      criada: false;
      motivo:
        | 'estudante_nao_verificado'
        | 'bloco_inexistente'
        | 'titulo_vazio'
        | 'titulo_longo'
        | 'descricao_vazia'
        | 'descricao_longa';
    };

/** Tamanho em caracteres como a pessoa conta: emoji e letra acentuada valem um. */
const tamanho = (texto: string) => Array.from(texto).length;

/**
 * "Bebedouro quebrado no Bloco 18!" → "bebedouro-quebrado-no-bloco-18-1a2b3c4d".
 *
 * O final vem do id da pauta: dois estudantes podem dar o mesmo título, e o slug é único.
 */
export function gerarSlug(titulo: string, id: string): string {
  const base = titulo
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
    .replace(/-+$/, '');
  return `${base === '' ? 'pauta' : base}-${id.slice(0, 8)}`;
}

/** Cria a pauta na transação de quem chama. Recusas voltam como resultado, sem exceção. */
export async function criarPauta(
  tx: Tx,
  {
    estudanteId,
    titulo,
    descricao,
    blocoId,
    relato,
    fotoChave = null,
    agora = new Date(),
  }: NovaPautaDoEstudante,
): Promise<ResultadoCriacao> {
  const tituloLimpo = titulo.trim();
  const descricaoLimpa = descricao.trim();
  if (tituloLimpo === '') return { criada: false, motivo: 'titulo_vazio' };
  if (tamanho(tituloLimpo) > TITULO_MAXIMO) return { criada: false, motivo: 'titulo_longo' };
  if (descricaoLimpa === '') return { criada: false, motivo: 'descricao_vazia' };
  if (tamanho(descricaoLimpa) > DESCRICAO_MAXIMA) {
    return { criada: false, motivo: 'descricao_longa' };
  }

  // RN01 vale para criar também: só quem é estudante verificado, e não saiu, abre pauta.
  // FOR UPDATE serializa com sairDoLumens para impedir pauta criada por estudante em processo de saída.
  const [estudante] = await tx
    .select({ verificadoEm: estudantes.verificadoEm, saiuEm: estudantes.saiuEm })
    .from(estudantes)
    .where(eq(estudantes.id, estudanteId))
    .for('update');
  if (estudante?.verificadoEm == null || estudante.saiuEm !== null) {
    return { criada: false, motivo: 'estudante_nao_verificado' };
  }

  let bloco: { baseEstudantes: number } | null = null;
  if (blocoId !== null) {
    const [achado] = await tx
      .select({ baseEstudantes: blocos.baseEstudantes })
      .from(blocos)
      .where(eq(blocos.id, blocoId));
    if (achado === undefined) return { criada: false, motivo: 'bloco_inexistente' };
    bloco = achado;
  }

  // A meta é calculada agora e não muda mais, mesmo se a base do bloco mudar depois (RN04).
  const meta = calcularMeta(bloco);
  const pautaId = randomUUID();
  const slug = gerarSlug(tituloLimpo, pautaId);

  await tx.insert(pautas).values({
    id: pautaId,
    slug,
    titulo: tituloLimpo,
    descricao: descricaoLimpa,
    blocoId,
    categoria: CATEGORIA_A_CLASSIFICAR,
    status: 'em_curadoria',
    meta,
    criadaEm: agora,
  });

  await tx.insert(papeisPauta).values({
    pautaId,
    estudanteId,
    papel: 'owner',
    ultimaAtividadeEm: agora,
  });

  const textoDoRelato = relato?.trim();
  await tx.insert(relatos).values({
    pautaId,
    estudanteId,
    texto: textoDoRelato === undefined || textoDoRelato === '' ? descricaoLimpa : textoDoRelato,
    fotoChave,
  });

  await registrarEvento(tx, {
    pautaId,
    tipo: 'pauta_criada',
    dados: { status: 'em_curadoria' },
    origem: 'bot',
  });
  await registrarEvento(tx, {
    pautaId,
    tipo: 'owner_entrou',
    dados: { papel: 'owner' },
    origem: 'bot',
  });

  return { criada: true, pautaId, slug, meta };
}
