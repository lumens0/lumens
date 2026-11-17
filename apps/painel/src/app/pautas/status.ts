import type { DetalhePautaDaCuradoria } from '@lumens/dominio';

export const STATUS: Record<DetalhePautaDaCuradoria['status'], string> = {
  em_curadoria: 'Esperando decisão da curadoria',
  recusada: 'Recusada',
  juntando_apoios: 'Juntando apoios',
  meta_batida: 'Meta batida',
  cobrando: 'Em cobrança',
  prometido: 'Prometido',
  entregue_em_parte: 'Entregue em parte',
  descumprida: 'Promessa descumprida',
  conquistada: 'Conquistada',
};
