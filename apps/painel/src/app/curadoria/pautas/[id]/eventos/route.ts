import { listarLinhaDoTempo } from '@lumens/dominio';
import { curadorDaSessao, servidor } from '../../../../../auth';
import { criarGetEventos } from './eventos';

export const GET = criarGetEventos({
  autorizado: async () => (await curadorDaSessao()) !== undefined,
  listar: (pautaId) => listarLinhaDoTempo(servidor().db, pautaId),
});
