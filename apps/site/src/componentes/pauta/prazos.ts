// "Hoje" é o dia de Maceió, como no `proxima_etapa` da view: `en-CA` formata AAAA-MM-DD.
const diaEmMaceio = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Maceio' });

/** Data civil `AAAA-MM-DD` em `DD/MM/AAAA`, sem passar por `Date` (que mudaria o dia pelo fuso). */
export function formatarDia(dia: string): string {
  const [ano, mes, d] = dia.split('-');
  return `${d ?? ''}/${mes ?? ''}/${ano ?? ''}`;
}

/** O dia civil (AAAA-MM-DD) de um instante, em Maceió. */
export const hojeEmMaceio = (agora: Date) => diaEmMaceio.format(agora);

/**
 * Prazo vencido: o dia do prazo ainda conta como em dia (mesma regra da view). Só vale para data
 * civil `AAAA-MM-DD`; qualquer outra coisa nunca é "vencida" (SCRUM-354).
 */
export function prazoVencido(dia: string, agora: Date): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(dia) && dia < hojeEmMaceio(agora);
}

/** "dd/mm/aaaa" ou, vencido, "venceu em dd/mm/aaaa": o ano sempre aparece. */
export function textoDoPrazo(dia: string, agora: Date, vencido = prazoVencido(dia, agora)) {
  return vencido ? `venceu em ${formatarDia(dia)}` : formatarDia(dia);
}
