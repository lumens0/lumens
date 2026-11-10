import type { Pauta as PautaPublica } from '@lumens/contratos';

export type { Bloco } from '@lumens/contratos';

// Todos os status do esquema. A API só entrega os públicos (`STATUS_PUBLICOS` do contrato), mas o
// site guarda os nove para a pill, o `FORA_DO_SITE` e as pautas de teste.
export const STATUS_PAUTA = [
  'em_curadoria',
  'recusada',
  'juntando_apoios',
  'meta_batida',
  'cobrando',
  'prometido',
  'entregue_em_parte',
  'descumprida',
  'conquistada',
] as const;

export type StatusPauta = (typeof STATUS_PAUTA)[number];

/** Pauta do GET /pautas, com o status alargado para os nove do esquema. */
export type Pauta = Omit<PautaPublica, 'status'> & { status: StatusPauta };
