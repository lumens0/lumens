import { COR_DO_STATUS } from '@lumens/marca';
import { ROTULOS_DE_STATUS } from '@lumens/dominio';

/** O rótulo vem do domínio: é o mesmo texto que a busca `q` da lista procura. */
export const STATUS = ROTULOS_DE_STATUS;

/**
 * A cor de cada situação no painel: as de etapa são as do site; as duas que o site nunca mostra
 * (esperando decisão e recusada) têm tons próprios, mais discretos.
 */
export const COR_NO_PAINEL: Record<keyof typeof STATUS, string> = {
  ...COR_DO_STATUS,
  em_curadoria: '#7b7fa0',
  recusada: '#9a3d3d',
};
