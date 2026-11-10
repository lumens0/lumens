import { criarGetEventos } from './eventos';

// Negada até o login da 5.1 (SCRUM-112) existir neste app. Quando existir, trocar `autorizado`
// pela checagem de sessão e `listar` por `listarLinhaDoTempo(db, id)` com o banco do painel.
export const GET = criarGetEventos({
  autorizado: () => false,
  listar: () => Promise.reject(new Error('banco do painel ainda não configurado')),
});
