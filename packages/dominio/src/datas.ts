/**
 * Datas como as pessoas leem: o dia civil em Maceió e o formato dd/mm/aaaa das mensagens.
 *
 * Maceió é UTC−3 o ano inteiro (sem horário de verão desde 2019), a mesma premissa de
 * `promessa.ts`. Somar o deslocamento à mão evita depender do fuso da máquina que roda o agendador.
 */

const DESLOCAMENTO_MACEIO_MS = 3 * 3_600_000;

/** Dia civil em Maceió de um instante, em `YYYY-MM-DD`. */
export function diaEmMaceio(instante: Date): string {
  return new Date(instante.getTime() - DESLOCAMENTO_MACEIO_MS).toISOString().slice(0, 10);
}

/** `YYYY-MM-DD` → `dd/mm/aaaa`, como vai nas mensagens modelo. */
export function formatarDia(dia: string): string {
  const [ano, mes, d] = dia.split('-');
  return `${d ?? ''}/${mes ?? ''}/${ano ?? ''}`;
}

/**
 * Último dia em que ainda dá para responder, para uma janela que fecha em `fechaEm`.
 *
 * A janela fecha à meia-noite de Maceió, então o último dia útil é o anterior: escrever o dia do
 * fecho na mensagem faria a pessoa achar que ainda pode responder nele.
 */
export function ultimoDiaAntesDe(fechaEm: Date): string {
  return formatarDia(diaEmMaceio(new Date(fechaEm.getTime() - 1)));
}

/**
 * A primeira meia-noite de Maceió em `instante` ou depois dele. Janelas que fecham sempre à
 * meia-noite deixam o "responda até dd/mm" da mensagem exato.
 */
export function meiaNoiteEmOuDepois(instante: Date): Date {
  const inicioDoDia = new Date(`${diaEmMaceio(instante)}T00:00:00-03:00`);
  if (inicioDoDia.getTime() === instante.getTime()) return instante;
  return new Date(inicioDoDia.getTime() + 86_400_000);
}
