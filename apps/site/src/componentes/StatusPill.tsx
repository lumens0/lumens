import type { StatusPauta } from '../dados/tipos';
import estilos from './componentes.module.css';

// Cor da "janela acesa" de cada status. A cor nunca é o único sinal: o rótulo vem sempre junto.
// Cobrança, promessa e entrega em parte dividem a mesma luz: "seguimos cobrando".
export const STATUS: Record<StatusPauta, { rotulo: string; ponto: string }> = {
  em_curadoria: { rotulo: 'Em curadoria', ponto: '#9ea2b8' },
  recusada: { rotulo: 'Recusada', ponto: '#9ea2b8' },
  juntando_apoios: { rotulo: 'Juntando apoios', ponto: '#4f8cff' },
  meta_batida: { rotulo: 'Meta batida', ponto: '#14b8a6' },
  cobrando: { rotulo: 'Cobrando', ponto: '#ffa41b' },
  prometido: { rotulo: 'Prometido', ponto: '#ffa41b' },
  entregue_em_parte: { rotulo: 'Entregue em parte', ponto: '#ffa41b' },
  descumprida: { rotulo: 'Descumprida', ponto: '#ff5a4a' },
  conquistada: { rotulo: 'Conquistada', ponto: '#2ec27e' },
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
