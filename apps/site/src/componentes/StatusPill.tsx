import type { StatusPauta } from '../dados/tipos';
import estilos from './componentes.module.css';

// Cores do protótipo: ponto, fundo e texto. A cor nunca é o único sinal: a pill sempre mostra o
// rótulo. As que nunca chegam ao site (em curadoria, recusada) ficam neutras.
export const STATUS: Record<
  StatusPauta,
  { rotulo: string; ponto: string; fundo: string; texto: string }
> = {
  em_curadoria: { rotulo: 'Em curadoria', ponto: '#5B4E75', fundo: '#F0EDF5', texto: '#5B4E75' },
  recusada: { rotulo: 'Recusada', ponto: '#5B4E75', fundo: '#F0EDF5', texto: '#5B4E75' },
  juntando_apoios: {
    rotulo: 'Juntando apoios',
    ponto: '#7B3FE4',
    fundo: '#EFE8FB',
    texto: '#4A14B0',
  },
  meta_batida: { rotulo: 'Meta batida', ponto: '#2F6FDB', fundo: '#E5EEFC', texto: '#1A4FA8' },
  cobrando: { rotulo: 'Cobrando', ponto: '#E89A00', fundo: '#FFF1D1', texto: '#6B4500' },
  prometido: { rotulo: 'Prometido', ponto: '#E89A00', fundo: '#FFF1D1', texto: '#6B4500' },
  entregue_em_parte: {
    rotulo: 'Entregue em parte',
    ponto: '#E89A00',
    fundo: '#FFF1D1',
    texto: '#6B4500',
  },
  descumprida: { rotulo: 'Descumprida', ponto: '#D92D20', fundo: '#FDE8E7', texto: '#9B1C14' },
  conquistada: { rotulo: 'Conquistada', ponto: '#13865B', fundo: '#E2F4EC', texto: '#0B5E40' },
};

export function StatusPill({
  status,
  pequena = false,
}: {
  status: StatusPauta;
  pequena?: boolean;
}) {
  const { rotulo, ponto, fundo, texto } = STATUS[status];
  return (
    <span
      className={pequena ? [estilos.pill, estilos.pillPequena].join(' ') : estilos.pill}
      style={{ background: fundo, color: texto }}
    >
      <i className={estilos.pillPonto} style={{ background: ponto }} aria-hidden="true" />
      {rotulo}
    </span>
  );
}
