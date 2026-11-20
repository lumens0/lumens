'use client';

import { useRouter } from 'next/navigation';
import estilos from '../painel.module.css';

/** A caixa "Mostrar desativados": a lista mostra ou esconde quem perdeu o acesso (`?desativados=1`). */
export function MostrarDesativados({ marcado, total }: { marcado: boolean; total: number }) {
  const roteador = useRouter();
  return (
    <label className={[estilos.marcar, estilos.filtroMarcar].join(' ')}>
      <input
        type="checkbox"
        checked={marcado}
        onChange={(evento) => {
          roteador.push(evento.target.checked ? '/curadores?desativados=1' : '/curadores');
        }}
      />
      Mostrar desativados{total > 0 ? ` (${String(total)})` : ''}
    </label>
  );
}
