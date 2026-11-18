import type { StatusPauta } from '../dados/tipos';
import estilos from './componentes.module.css';

// Cor da "janela acesa" de cada status. A cor nunca é o único sinal: o rótulo vem sempre junto.
export const STATUS: Record<StatusPauta, { rotulo: string; ponto: string }> = {
  em_curadoria: { rotulo: 'Em curadoria', ponto: '#74788c' },
  recusada: { rotulo: 'Recusada', ponto: '#646876' },
  juntando_apoios: { rotulo: 'Juntando apoios', ponto: '#356fc2' },
  meta_batida: { rotulo: 'Meta batida', ponto: '#8959bd' },
  cobrando: { rotulo: 'Cobrando', ponto: '#c05b12' },
  prometido: { rotulo: 'Prometido', ponto: '#168b86' },
  entregue_em_parte: { rotulo: 'Entregue em parte', ponto: '#a98216' },
  descumprida: { rotulo: 'Descumprida', ponto: '#d0443b' },
  conquistada: { rotulo: 'Conquistada', ponto: '#36864f' },
};

export function StatusPill({ status }: { status: StatusPauta }) {
  const { rotulo, ponto } = STATUS[status];
  return (
    <span className={estilos.status}>
      <i className={estilos.janela} style={{ background: ponto }} aria-hidden="true" />
      {rotulo}
    </span>
  );
}
