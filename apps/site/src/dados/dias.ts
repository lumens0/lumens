import { formatarNumero } from '../componentes/BarraApoios';

const DIA_EM_MS = 24 * 60 * 60 * 1000;

// `en-CA` formata como AAAA-MM-DD, que o `Date.parse` lê como meia-noite UTC daquele dia.
const diaEmMaceio = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Maceio' });
const diaDoCalendario = (instante: string) =>
  Date.parse(diaEmMaceio.format(new Date(instante))) / DIA_EM_MS;

/**
 * Dias de calendário (em Maceió) entre dois instantes, para bater com as datas mostradas. `null`
 * sem uma das datas ou com data inválida: nunca "NaN dias".
 */
export function diasEntre(inicio: string | null | undefined, fim: string | null | undefined) {
  if (!inicio || !fim) return null;
  const dias = Math.round(diaDoCalendario(fim) - diaDoCalendario(inicio));
  return Number.isFinite(dias) ? dias : null;
}

export function textoDias(dias: number): string {
  if (dias === 0) return 'No mesmo dia';
  return dias === 1 ? '1 dia' : `${formatarNumero(dias)} dias`;
}

/** O ano (em Maceió) de um instante. */
export const anoEmMaceio = (instante: string) => diaEmMaceio.format(new Date(instante)).slice(0, 4);
