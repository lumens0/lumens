import {
  and,
  apoios,
  caminhos,
  eq,
  estudantes,
  isNull,
  pautas,
  promessas,
  type Tx,
} from '@lumens/db';
import { formatarDia } from '../compartilhado/datas';
import { registrarEvento } from '../compartilhado/eventos';
import { enfileirarDisparos } from '../avisos/fila';
import { calcularPrazo } from './prazo';
import { janelaDeConferencia } from './promessa';

export type MotivoRecusaAjusteDePrazo =
  | 'entrada_invalida'
  | 'caminho_inexistente'
  | 'caminho_sem_protocolo'
  | 'prazo_vencido'
  | 'ja_prorrogado'
  | 'data_invalida'
  | 'pauta_criada_depois'
  | 'promessa_inexistente'
  | 'conferencia_aberta'
  | 'data_no_passado';
export type ResultadoAjusteDePrazo =
  { feito: true } | { feito: false; motivo: MotivoRecusaAjusteDePrazo };

export const MODELO_PROMESSA_REMARCADA = 'lumens_promessa_remarcada';

function hojeEmMaceio(agora: Date): string {
  const partes = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Maceio',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(agora);
  const ano = partes.find((parte) => parte.type === 'year')?.value ?? '';
  const mes = partes.find((parte) => parte.type === 'month')?.value ?? '';
  const dia = partes.find((parte) => parte.type === 'day')?.value ?? '';
  return `${ano}-${mes}-${dia}`;
}

function diaValido(data: string): boolean {
  try {
    calcularPrazo({ abertoEm: data });
    return true;
  } catch {
    return false;
  }
}

function textoValido(valor: string, limite: number): boolean {
  return valor.trim().length > 0 && valor.length <= limite && !/[\r\n]/.test(valor);
}

export interface RegistrarProrrogacao {
  caminhoId: string;
  /** A pauta do formulário: se informada, o item tem de ser dela (o servidor não confia no redirect). */
  pautaId?: string;
  curadorId: string;
  motivo: string;
  fonte: string;
  agora?: Date;
}

/** Prorroga uma vez o prazo do Fala.BR, enquanto ainda está vigente. */
export async function registrarProrrogacao(
  tx: Tx,
  { caminhoId, pautaId, motivo, fonte, agora = new Date() }: RegistrarProrrogacao,
): Promise<ResultadoAjusteDePrazo> {
  if (!textoValido(motivo, 200) || !textoValido(fonte, 120)) {
    return { feito: false, motivo: 'entrada_invalida' };
  }
  const [caminho] = await tx
    .select({
      pautaId: caminhos.pautaId,
      tipo: caminhos.tipo,
      protocolo: caminhos.protocolo,
      prazo: caminhos.prazo,
      protocoloEm: caminhos.protocoloEm,
      prorrogado: caminhos.prorrogado,
    })
    .from(caminhos)
    .where(eq(caminhos.id, caminhoId))
    .for('update');
  if (!caminho || (pautaId !== undefined && caminho.pautaId !== pautaId))
    return { feito: false, motivo: 'caminho_inexistente' };
  if (caminho.tipo !== 'falabr' || caminho.protocolo === null || caminho.prazo === null)
    return { feito: false, motivo: 'caminho_sem_protocolo' };
  if (caminho.prorrogado) return { feito: false, motivo: 'ja_prorrogado' };
  const hoje = hojeEmMaceio(agora);
  if (caminho.prazo < hoje) return { feito: false, motivo: 'prazo_vencido' };
  // O prazo prorrogado conta do dia do protocolo (30 + 30). Sem o dia gravado, o prazo atual é o
  // inicial, e a prorrogação soma mais 30 a ele.
  const novoPrazo =
    caminho.protocoloEm === null
      ? calcularPrazo({ abertoEm: caminho.prazo }).vence
      : calcularPrazo({ abertoEm: caminho.protocoloEm, prorrogado: true }).vence;
  await tx
    .update(caminhos)
    .set({ prazo: novoPrazo, prorrogado: true })
    .where(eq(caminhos.id, caminhoId));
  await registrarEvento(tx, {
    pautaId: caminho.pautaId,
    tipo: 'prazo_prorrogado',
    dados: {
      caminho_id: caminhoId,
      data_antiga: caminho.prazo,
      data_nova: novoPrazo,
      motivo,
      fonte,
    },
    origem: 'curadoria',
  });
  return { feito: true };
}

export interface CorrigirDataDoProtocolo {
  caminhoId: string;
  /** A pauta do formulário: se informada, o item tem de ser dela (o servidor não confia no redirect). */
  pautaId?: string;
  curadorId: string;
  data: string;
  motivo: string;
  fonte: string;
  agora?: Date;
}

/** Corrige o dia de protocolo e recalcula o vencimento, preservando eventual prorrogação. */
export async function corrigirDataDoProtocolo(
  tx: Tx,
  { caminhoId, pautaId, data, motivo, fonte, agora = new Date() }: CorrigirDataDoProtocolo,
): Promise<ResultadoAjusteDePrazo> {
  if (!textoValido(motivo, 200) || !textoValido(fonte, 120)) {
    return { feito: false, motivo: 'entrada_invalida' };
  }
  if (!diaValido(data) || data > hojeEmMaceio(agora)) {
    return { feito: false, motivo: 'data_invalida' };
  }
  const [caminho] = await tx
    .select({
      pautaId: caminhos.pautaId,
      tipo: caminhos.tipo,
      protocolo: caminhos.protocolo,
      prazo: caminhos.prazo,
      protocoloEm: caminhos.protocoloEm,
      prorrogado: caminhos.prorrogado,
    })
    .from(caminhos)
    .where(eq(caminhos.id, caminhoId))
    .for('update');
  if (!caminho || (pautaId !== undefined && caminho.pautaId !== pautaId))
    return { feito: false, motivo: 'caminho_inexistente' };
  if (caminho.tipo !== 'falabr' || caminho.protocolo === null || caminho.prazo === null)
    return { feito: false, motivo: 'caminho_sem_protocolo' };
  const [pauta] = await tx
    .select({ criadaEm: pautas.criadaEm })
    .from(pautas)
    .where(eq(pautas.id, caminho.pautaId));
  if (pauta === undefined || data < hojeEmMaceio(pauta.criadaEm))
    return { feito: false, motivo: 'pauta_criada_depois' };
  const atual = caminho.protocoloEm;
  if (atual === null) return { feito: false, motivo: 'caminho_sem_protocolo' };
  const prazo = calcularPrazo({ abertoEm: data, prorrogado: caminho.prorrogado }).vence;
  await tx.update(caminhos).set({ prazo, protocoloEm: data }).where(eq(caminhos.id, caminhoId));
  await registrarEvento(tx, {
    pautaId: caminho.pautaId,
    tipo: 'protocolo_corrigido',
    dados: {
      caminho_id: caminhoId,
      data_antiga: atual,
      data_nova: data,
      motivo,
      fonte,
    },
    origem: 'curadoria',
  });
  return { feito: true };
}

export interface RemarcarDataPrometida {
  promessaId: string;
  /** A pauta do formulário: se informada, o item tem de ser dela (o servidor não confia no redirect). */
  pautaId?: string;
  curadorId: string;
  dataEntrega: string;
  motivo: string;
  fonte: string;
  agora?: Date;
}

/** Remarca a promessa e a conferência em uma transação; notifica os apoiadores ativos. */
export async function remarcarDataPrometida(
  tx: Tx,
  { promessaId, pautaId, dataEntrega, motivo, fonte, agora = new Date() }: RemarcarDataPrometida,
): Promise<ResultadoAjusteDePrazo> {
  if (!textoValido(motivo, 200) || !textoValido(fonte, 120)) {
    return { feito: false, motivo: 'entrada_invalida' };
  }
  if (!diaValido(dataEntrega)) return { feito: false, motivo: 'data_invalida' };
  const [promessa] = await tx
    .select({
      id: promessas.id,
      pautaId: promessas.pautaId,
      dataEntrega: promessas.dataEntrega,
      conferenciaAbreEm: promessas.conferenciaAbreEm,
      resultado: promessas.resultado,
    })
    .from(promessas)
    .where(eq(promessas.id, promessaId))
    .for('update');
  if (
    !promessa ||
    promessa.resultado !== null ||
    (pautaId !== undefined && promessa.pautaId !== pautaId)
  )
    return { feito: false, motivo: 'promessa_inexistente' };
  if (agora >= promessa.conferenciaAbreEm) return { feito: false, motivo: 'conferencia_aberta' };
  if (dataEntrega <= hojeEmMaceio(agora)) return { feito: false, motivo: 'data_no_passado' };
  const janela = janelaDeConferencia(dataEntrega);
  await tx
    .update(promessas)
    .set({ dataEntrega, ...janela })
    .where(eq(promessas.id, promessaId));
  const evento = await registrarEvento(tx, {
    pautaId: promessa.pautaId,
    tipo: 'promessa_remarcada',
    dados: {
      promessa_id: promessaId,
      data_antiga: promessa.dataEntrega,
      data_nova: dataEntrega,
      motivo,
      fonte,
    },
    origem: 'curadoria',
  });
  const [pauta] = await tx
    .select({ titulo: pautas.titulo, slug: pautas.slug })
    .from(pautas)
    .where(eq(pautas.id, promessa.pautaId));
  if (!pauta) return { feito: false, motivo: 'promessa_inexistente' };
  const apoiadores = await tx
    .select({ estudanteId: apoios.estudanteId })
    .from(apoios)
    .innerJoin(estudantes, eq(estudantes.id, apoios.estudanteId))
    .where(and(eq(apoios.pautaId, promessa.pautaId), isNull(estudantes.saiuEm)));
  const parametros = [
    pauta.titulo,
    formatarDia(promessa.dataEntrega),
    formatarDia(dataEntrega),
    pauta.slug,
  ];
  await enfileirarDisparos(
    tx,
    apoiadores.map(({ estudanteId }) => ({
      tipo: 'remarcacao' as const,
      aviso: evento.id,
      estudanteId,
      modelo: MODELO_PROMESSA_REMARCADA,
      parametros,
    })),
    agora,
  );
  return { feito: true };
}
