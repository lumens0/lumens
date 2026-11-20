'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import estilos from './painel.module.css';

/** As seções do cabeçalho; a da tela aberta fica marcada (`aria-current`) e sublinhada em âmbar. */
export function Navegacao({ administrador }: { administrador: boolean }) {
  // Fora do roteador (nos testes) o caminho vem nulo: nenhuma seção fica marcada.
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
  const caminho = usePathname() ?? '';
  const secoes = [
    { href: '/', rotulo: 'Início', aqui: caminho === '/' },
    { href: '/pautas', rotulo: 'Pautas', aqui: caminho.startsWith('/pautas') },
    { href: '/relatos', rotulo: 'Relatos', aqui: caminho.startsWith('/relatos') },
    { href: '/pedidos', rotulo: 'Pedidos de edição', aqui: caminho.startsWith('/pedidos') },
    ...(administrador
      ? [{ href: '/curadores', rotulo: 'Curadores', aqui: caminho.startsWith('/curadores') }]
      : []),
    { href: '/manual', rotulo: 'Manual', aqui: caminho.startsWith('/manual') },
  ];
  return (
    <nav aria-label="Seções do painel" className={estilos.navegacao}>
      {secoes.map((secao) => (
        <Link key={secao.href} href={secao.href} aria-current={secao.aqui ? 'page' : undefined}>
          {secao.rotulo}
        </Link>
      ))}
    </nav>
  );
}
