'use client';

import { useRouter } from 'next/navigation';
import { STATUS } from './StatusPill';
import { STATUS_PUBLICOS } from '@lumens/contratos';
import { urlDosFiltros } from '../dados/filtros';
import estilos from './componentes.module.css';

export function FiltroStatus({
  atual,
  bloco,
  contagens,
}: {
  atual: string | undefined;
  bloco: string | undefined;
  contagens: Record<string, number>;
}) {
  const router = useRouter();
  const atualizar = (status: string) => {
    router.replace(urlDosFiltros(status, bloco), { scroll: false });
  };
  return (
    <label className={estilos.filtro}>
      Status
      <select
        key={atual ?? ''}
        value={atual ?? ''}
        onChange={(e) => {
          atualizar(e.target.value);
        }}
      >
        <option value="">Todas</option>
        {STATUS_PUBLICOS.map((status) => (
          <option key={status} value={status}>
            {STATUS[status].rotulo} ({contagens[status] ?? 0})
          </option>
        ))}
      </select>
    </label>
  );
}
