import { COR_DO_STATUS as COR } from '@lumens/marca';
import type { StatusPauta } from '../dados/tipos';
import estilos from './componentes.module.css';

// Cor da "janela acesa" de cada status, a mesma do painel. A cor nunca é o único sinal: o rótulo
// vem sempre junto. Cobrança, promessa e entrega em parte dividem a mesma luz: "seguimos cobrando".
export const STATUS: Record<StatusPauta, { rotulo: string; ponto: string }> = {
  em_curadoria: { rotulo: 'Em curadoria', ponto: COR.em_curadoria },
  recusada: { rotulo: 'Recusada', ponto: COR.recusada },
  juntando_apoios: { rotulo: 'Juntando apoios', ponto: COR.juntando_apoios },
  meta_batida: { rotulo: 'Meta batida', ponto: COR.meta_batida },
  cobrando: { rotulo: 'Cobrando', ponto: COR.cobrando },
  prometido: { rotulo: 'Prometido', ponto: COR.prometido },
  entregue_em_parte: { rotulo: 'Entregue em parte', ponto: COR.entregue_em_parte },
  descumprida: { rotulo: 'Descumprida', ponto: COR.descumprida },
  conquistada: { rotulo: 'Conquistada', ponto: COR.conquistada },
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
