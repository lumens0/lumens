/**
 * "O que foi feito" de uma pauta conquistada (SCRUM-394): o texto curto e a foto que a curadoria
 * escreve e que o site mostra na página da pauta, em /conquistas e no card de conquista.
 *
 * Só pauta `conquistada` aceita. O texto passa pela mesma barra de e-mail e telefone dos relatos
 * (`conferirAnonimato`); a foto já chega aqui guardada no storage e sem metadados (o painel faz isso
 * antes), então esta função só cuida da linha, da foto antiga (vai para a fila de remoção na mesma
 * transação) e do evento na linha do tempo da curadoria.
 */
import { eq, conquistasDaCuradoria, fotosARemover, pautas, type Db, type Tx } from '@lumens/db';
import { conferirAnonimato } from '../compartilhado/anonimato';
import { registrarEvento } from '../compartilhado/eventos';

export const O_QUE_FOI_FEITO_MAXIMO = 160;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** O mesmo formato que o banco confere e que a rota pública de foto serve. */
const CHAVE_DE_FOTO = /^fotos\/\d{4}\/\d{2}\/[A-Za-z0-9_-]+\.[a-z0-9]{1,5}$/;

export type MotivoDaConquista =
  | 'pauta_inexistente'
  | 'pauta_nao_conquistada'
  | 'texto_longo'
  | 'texto_com_dado_pessoal'
  | 'sem_conteudo'
  | 'foto_invalida';

/**
 * Confere o texto sem tocar no banco: o painel chama antes de guardar a foto, para não deixar
 * arquivo órfão quando o texto vai ser recusado. Texto vazio vale (a conquista fica só com a foto).
 */
export function conferirOQueFoiFeito(
  bruto: string,
):
  | { ok: true; texto: string | null }
  | { ok: false; motivo: 'texto_longo' | 'texto_com_dado_pessoal' } {
  const texto = bruto.replace(/\s+/g, ' ').trim();
  if (Array.from(texto).length > O_QUE_FOI_FEITO_MAXIMO)
    return { ok: false, motivo: 'texto_longo' };
  if (conferirAnonimato(texto).achados.some((achado) => achado.severidade === 'bloqueio')) {
    return { ok: false, motivo: 'texto_com_dado_pessoal' };
  }
  return { ok: true, texto: texto === '' ? null : texto };
}

export type ResultadoDaConquista =
  { salva: true; fotoSubstituida: string | null } | { salva: false; motivo: MotivoDaConquista };

export interface NovaConquista {
  pautaId: string;
  curadorId: string;
  /** Texto do formulário; vazio apaga o texto. */
  texto: string;
  /** Chave da foto nova, já no storage. Sem ela, a foto que existe fica como está. */
  fotoChave?: string | undefined;
  /** Tira a foto atual (sem foto nova). */
  removerFoto?: boolean | undefined;
}

/**
 * Grava o texto e a foto. A foto que sai (trocada ou removida) entra na fila de remoção do storage
 * na mesma transação: se a gravação desfaz, o arquivo antigo continua valendo.
 */
export async function salvarConquistaDaCuradoria(
  tx: Tx,
  { pautaId, curadorId, texto: bruto, fotoChave, removerFoto = false }: NovaConquista,
  agora: Date = new Date(),
): Promise<ResultadoDaConquista> {
  if (!UUID.test(pautaId)) return { salva: false, motivo: 'pauta_inexistente' };
  const conferido = conferirOQueFoiFeito(bruto);
  if (!conferido.ok) return { salva: false, motivo: conferido.motivo };
  if (fotoChave !== undefined && !CHAVE_DE_FOTO.test(fotoChave)) {
    return { salva: false, motivo: 'foto_invalida' };
  }

  // FOR UPDATE: a pauta não muda de status no meio da gravação.
  const [pauta] = await tx
    .select({ status: pautas.status })
    .from(pautas)
    .where(eq(pautas.id, pautaId))
    .for('update');
  if (pauta === undefined) return { salva: false, motivo: 'pauta_inexistente' };
  if (pauta.status !== 'conquistada') return { salva: false, motivo: 'pauta_nao_conquistada' };

  const [atual] = await tx
    .select({ fotoChave: conquistasDaCuradoria.fotoChave })
    .from(conquistasDaCuradoria)
    .where(eq(conquistasDaCuradoria.pautaId, pautaId))
    .for('update');
  const fotoAntes = atual?.fotoChave ?? null;
  const fotoDepois = fotoChave ?? (removerFoto ? null : fotoAntes);

  if (conferido.texto === null && fotoDepois === null) {
    return { salva: false, motivo: 'sem_conteudo' };
  }

  await tx
    .insert(conquistasDaCuradoria)
    .values({
      pautaId,
      oQueFoiFeito: conferido.texto,
      fotoChave: fotoDepois,
      atualizadoPor: curadorId,
      atualizadoEm: agora,
    })
    .onConflictDoUpdate({
      target: conquistasDaCuradoria.pautaId,
      set: {
        oQueFoiFeito: conferido.texto,
        fotoChave: fotoDepois,
        atualizadoPor: curadorId,
        atualizadoEm: agora,
      },
    });

  const fotoSubstituida = fotoAntes !== null && fotoAntes !== fotoDepois ? fotoAntes : null;
  if (fotoSubstituida !== null) {
    await tx
      .insert(fotosARemover)
      .values({ chave: fotoSubstituida })
      .onConflictDoNothing({ target: fotosARemover.chave });
  }
  await registrarEvento(tx, {
    pautaId,
    tipo: 'conquista_atualizada',
    dados: { texto: conferido.texto !== null, foto: fotoDepois !== null },
    origem: 'curadoria',
  });
  return { salva: true, fotoSubstituida };
}

export interface ConquistaDaCuradoria {
  /** Endereço público da pauta, para a curadoria abrir o card. */
  slug: string;
  texto: string | null;
  fotoChave: string | null;
  atualizadoEm: Date | null;
}

/** O que está salvo (nulo enquanto ninguém escreveu), para a tela da curadoria preencher o formulário. */
export async function lerConquistaDaCuradoria(
  db: Db,
  pautaId: string,
): Promise<ConquistaDaCuradoria | undefined> {
  if (!UUID.test(pautaId)) return undefined;
  const [linha] = await db
    .select({
      slug: pautas.slug,
      texto: conquistasDaCuradoria.oQueFoiFeito,
      fotoChave: conquistasDaCuradoria.fotoChave,
      atualizadoEm: conquistasDaCuradoria.atualizadoEm,
    })
    .from(pautas)
    .leftJoin(conquistasDaCuradoria, eq(conquistasDaCuradoria.pautaId, pautas.id))
    .where(eq(pautas.id, pautaId));
  return linha;
}
