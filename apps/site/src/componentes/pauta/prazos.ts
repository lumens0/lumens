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

/**
 * Dias de calendário (em Maceió) de hoje até `dia`: positivo no futuro, zero hoje, negativo se
 * venceu. `null` para qualquer coisa que não seja uma data civil `AAAA-MM-DD`.
 */
export function diasAte(dia: string, agora: Date): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dia)) return null;
  const alvo = Date.parse(`${dia}T00:00:00Z`);
  if (Number.isNaN(alvo)) return null;
  return Math.round((alvo - Date.parse(`${hojeEmMaceio(agora)}T00:00:00Z`)) / 86_400_000);
}

/** "hoje", "em 3 dias" ou, vencido, "venceu há 2 dias". */
export function textoDiasAte(dias: number): string {
  if (dias === 0) return 'hoje';
  const n = Math.abs(dias);
  const unidade = n === 1 ? 'dia' : 'dias';
  return dias > 0 ? `em ${String(n)} ${unidade}` : `venceu há ${String(n)} ${unidade}`;
}

const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

/** "25 nov": o dia e o mês curtos de uma data civil `AAAA-MM-DD` ou de um instante em Maceió. */
export function diaEMes(valor: string): string {
  const civil = /^(\d{4})-(\d{2})-(\d{2})$/.exec(valor);
  const instante = new Date(valor);
  if (!civil && Number.isNaN(instante.getTime())) return valor;
  const dia = civil ? valor : hojeEmMaceio(instante);
  const [, , mes = '', d = ''] = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dia) ?? [];
  const nome = MESES[Number(mes) - 1];
  return nome === undefined ? valor : `${String(Number(d))} ${nome}`;
}

/** "hoje", "ontem" ou "há N dias": quando um instante aconteceu, em dias de Maceió. */
export function textoQuando(instante: string, agora: Date): string {
  const dias = diasAte(hojeEmMaceio(new Date(instante)), agora);
  if (dias === null || dias === 0) return 'hoje';
  if (dias === -1) return 'ontem';
  return dias < 0 ? `há ${String(-dias)} dias` : `em ${String(dias)} dias`;
}
