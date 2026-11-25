const MINUTO = 60_000;
const HORA = 60 * MINUTO;

function duracao(ms: number): string {
  const horas = Math.floor(ms / HORA);
  // Dois dias ou mais: a hora exata já não ajuda ninguém a decidir.
  if (horas >= 48) return `${String(Math.floor(horas / 24))} dias`;
  const minutos = Math.floor((ms % HORA) / MINUTO);
  if (horas === 0) return `${String(minutos)}\u00a0min`;
  return minutos === 0
    ? `${String(horas)}\u00a0h`
    : `${String(horas)}\u00a0h ${String(minutos)}\u00a0min`;
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

const MES_CURTO = [
  'jan',
  'fev',
  'mar',
  'abr',
  'mai',
  'jun',
  'jul',
  'ago',
  'set',
  'out',
  'nov',
  'dez',
];
const DIA_E_MES = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Maceio',
  day: '2-digit',
  month: 'numeric',
});

/** "19 nov": o dia e o mês no fuso de Maceió, como a linha do tempo mostra. */
export function diaCurto(instante: Date): string {
  const partes = DIA_E_MES.formatToParts(instante);
  const dia = partes.find((p) => p.type === 'day')?.value ?? '';
  const mes = Number(partes.find((p) => p.type === 'month')?.value ?? '1');
  return `${dia} ${MES_CURTO[mes - 1] ?? ''}`;
}
