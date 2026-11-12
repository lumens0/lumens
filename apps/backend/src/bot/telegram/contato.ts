/**
 * Identificação pelo contato compartilhado (SCRUM-267).
 *
 * No Telegram a pessoa é o telefone, como no WhatsApp: o chat que ainda não tem telefone recebe um
 * teclado com um botão `request_contact`, e o contato que volta liga o chat ao telefone. Só vale o
 * contato da própria conta (`contact.user_id` = `from.id`): um cartão de contato de outra pessoa
 * daria a alguém a identidade (e o voto) de outro estudante.
 */

export const BOTAO_CONTATO_TEXT = '📱 Compartilhar meu número';

export const PEDIR_CONTATO_TEXT = `Antes de começar, preciso do seu número de telefone: é ele que identifica cada estudante no Lumens, aqui e no WhatsApp. Toque em *${BOTAO_CONTATO_TEXT}* aqui embaixo.`;

export const CONTATO_ALHEIO_TEXT = `Esse contato não é o seu. Preciso do número da sua própria conta: toque em *${BOTAO_CONTATO_TEXT}* aqui embaixo.`;

export const CONTATO_ILEGIVEL_TEXT = `Não consegui ler o número desse contato. Toque em *${BOTAO_CONTATO_TEXT}* para mandar de novo.`;

export const CONTATO_ACEITO_TEXT = 'Número recebido ✅';

/**
 * O telefone do contato na forma em que o WhatsApp o entrega no `from` (o wa_id): só dígitos, com
 * o código do país e sem `+`. O Telegram manda `+5582…` ou `5582…`, conforme o aplicativo; os dois
 * viram o mesmo número, e portanto o mesmo `hashPhone`. Fora de 8 a 15 dígitos (E.164), `null`.
 *
 * Não mexe no nono dígito. O `from` da Meta não é normalizado em lugar nenhum, e o wa_id de algumas
 * contas brasileiras antigas vem sem ele (55 + DDD + 8 dígitos), enquanto o Telegram manda o número
 * inteiro: para essas pessoas os dois canais dão hashes diferentes. Acrescentar ou tirar o 9 de um
 * lado só não resolve com segurança; fica registrado como limitação.
 */
export function normalizarTelefone(bruto: string): string | null {
  const digitos = bruto.replace(/\D/g, '');
  return /^\d{8,15}$/.test(digitos) ? digitos : null;
}
