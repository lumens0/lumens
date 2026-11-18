'use client';

import { useRouter } from 'next/navigation';
import type { Bloco } from '../dados/tipos';
import { urlDosFiltros } from '../dados/filtros';
import estilos from './componentes.module.css';

/** Troca o `?bloco=` sem recarregar a página; "Todos os blocos" tira o parâmetro. */
export function FiltroBloco({
  blocos,
  atual,
  status,
}: {
  blocos: Bloco[];
  atual: string | undefined;
  status?: string | undefined;
}) {
  const router = useRouter();
  return (
    <label className={estilos.filtro}>
      Bloco
      <select
        // key: acompanha a URL se ela mudar por outro caminho (ex.: um link para /?bloco=x).
        key={atual ?? ''}
        defaultValue={atual ?? ''}
        onChange={(e) => {
          const slug = e.target.value;
          router.replace(urlDosFiltros(status, slug), { scroll: false });
        }}
      >
        <option value="">Todos os blocos</option>
        {blocos.map((b) => (
          <option key={b.slug} value={b.slug}>
            {b.nome}
          </option>
        ))}
      </select>
    </label>
  );
}
