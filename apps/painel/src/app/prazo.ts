const MINUTO = 60_000;
const HORA = 60 * MINUTO;

function duracao(ms: number): string {
  const horas = Math.floor(ms / HORA);
  // Dois dias ou mais: a hora exata já não ajuda ninguém a decidir.
  if (horas >= 48) return `${String(Math.floor(horas / 24))} dias`;
  const minutos = Math.floor((ms % HORA) / MINUTO);
  if (horas === 0) return `${String(minutos)} min`;
  return minutos === 0 ? `${String(horas)} h` : `${String(horas)} h ${String(minutos)} min`;
}

/** Quanto falta do prazo de 24 h da curadoria, ou há quanto tempo ele venceu. */
export function textoDoPrazo(restanteMs: number): string {
  return restanteMs >= 0 ? `faltam ${duracao(restanteMs)}` : `atrasada há ${duracao(-restanteMs)}`;
}

const FORMATO = new Intl.DateTimeFormat('pt-BR', {
  timeZone: 'America/Maceio',
  dateStyle: 'short',
  timeStyle: 'short',
});

/** Data e hora no fuso de Maceió, que é o da curadoria. */
export const dataHora = (instante: Date) => FORMATO.format(instante);
