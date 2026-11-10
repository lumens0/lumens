import { listarLinhaDoTempo } from '@lumens/dominio';
import { auth, servidor } from '../../../../../auth';
import { criarGetEventos } from './eventos';

export const GET = criarGetEventos({
  autorizado: async () => (await auth()) !== null,
  listar: (pautaId) => listarLinhaDoTempo(servidor().db, pautaId),
});
