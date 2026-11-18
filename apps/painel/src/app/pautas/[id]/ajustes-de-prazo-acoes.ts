'use server';

import {
  corrigirDataDoProtocolo,
  registrarProrrogacao,
  remarcarDataPrometida,
} from '@lumens/dominio';
import { redirect } from 'next/navigation';
import { curadorDaSessao, servidor } from '../../../auth';
import { UUID } from './decisoes';

function texto(formulario: FormData, campo: string): string {
  const valor = formulario.get(campo);
  return typeof valor === 'string' ? valor : '';
}

async function identidade(pautaId: string): Promise<string> {
  const curador = await curadorDaSessao();
  if (!curador) redirect('/login');
  if (!UUID.test(pautaId)) redirect('/fila');
  return curador.id;
}

function destino(pautaId: string, feito: boolean, motivo?: string): never {
  redirect(
    feito
      ? `/pautas/${pautaId}?feito=ajuste_prazo`
      : `/pautas/${pautaId}?erro=${motivo ?? 'entrada_invalida'}`,
  );
}

export async function prorrogarPrazo(formulario: FormData): Promise<void> {
  const caminhoId = texto(formulario, 'caminhoId');
  const pautaId = texto(formulario, 'pautaId');
  const curadorId = await identidade(pautaId);
  const resultado = await servidor().db.transaction((tx) =>
    registrarProrrogacao(tx, {
      caminhoId,
      pautaId,
      curadorId,
      motivo: texto(formulario, 'motivo'),
      fonte: texto(formulario, 'fonte'),
    }),
  );
  destino(pautaId, resultado.feito, resultado.feito ? undefined : resultado.motivo);
}

export async function corrigirProtocolo(formulario: FormData): Promise<void> {
  const caminhoId = texto(formulario, 'caminhoId');
  const pautaId = texto(formulario, 'pautaId');
  const curadorId = await identidade(pautaId);
  const resultado = await servidor().db.transaction((tx) =>
    corrigirDataDoProtocolo(tx, {
      caminhoId,
      pautaId,
      curadorId,
      data: texto(formulario, 'data'),
      motivo: texto(formulario, 'motivo'),
      fonte: texto(formulario, 'fonte'),
    }),
  );
  destino(pautaId, resultado.feito, resultado.feito ? undefined : resultado.motivo);
}

export async function remarcarPromessa(formulario: FormData): Promise<void> {
  const promessaId = texto(formulario, 'promessaId');
  const pautaId = texto(formulario, 'pautaId');
  const curadorId = await identidade(pautaId);
  const resultado = await servidor().db.transaction((tx) =>
    remarcarDataPrometida(tx, {
      promessaId,
      pautaId,
      curadorId,
      dataEntrega: texto(formulario, 'dataEntrega'),
      motivo: texto(formulario, 'motivo'),
      fonte: texto(formulario, 'fonte'),
    }),
  );
  destino(pautaId, resultado.feito, resultado.feito ? undefined : resultado.motivo);
}
