import type { Conquista } from '@lumens/contratos';
import type { Metadata } from 'next';
import Link from 'next/link';
import { connection } from 'next/server';
import { formatarNumero } from '../../componentes/BarraApoios';
import { buscarConquistas } from '../../dados/api';
import { diasEntre, textoDias } from '../../dados/dias';
import { metadadosDaMarca } from '../../metadados';
import estilos from '../paginas.module.css';

export const metadata: Metadata = metadadosDaMarca({
  caminho: '/conquistas',
  title: 'Conquistas · Lumens',
  description: 'Pautas estudantis da UFAL que viraram conquista.',
});

/** Dias de calendário entre a criação da pauta e a conquista. `null` sem uma das datas. */
const diasAteEntrega = ({ criada_em, conquistada_em }: Conquista) =>
  diasEntre(criada_em, conquistada_em);

function ItemConquista({ conquista }: { conquista: Conquista }) {
  const dias = diasAteEntrega(conquista);
  const partes = [
    dias !== null ? (
      <span key="dias">
        <b>{textoDias(dias)}</b> da criação à entrega
      </span>
    ) : null,
    <span key="apoios">
      <b>{formatarNumero(conquista.apoios)}</b> apoios
    </span>,
    conquista.bloco_nome ? <span key="bloco">{conquista.bloco_nome}</span> : null,
  ].filter((parte) => parte !== null);
  return (
    <Link href={`/p/${conquista.pauta_slug}`}>
      <i className={estilos.glifo} aria-hidden="true" />
      <span className={estilos.conquistaTitulo}>{conquista.titulo}</span>
      {conquista.o_que_foi_feito && (
        <span className={estilos.entrega}>{conquista.o_que_foi_feito}</span>
      )}
      <span className={estilos.numeros}>
        {partes.map((parte, i) => (
          <span key={parte.key}>
            {i > 0 && ' · '}
            {parte}
          </span>
        ))}
      </span>
    </Link>
  );
}

export default async function PaginaConquistas() {
  // Sem parâmetro na URL, o `next build` pré-renderizaria a página chamando a API (que pode nem
  // estar no ar). O `connection()` deixa a renderização para a hora do acesso.
  await connection();
  // Erro da API sobe e cai no `error.tsx`.
  const conquistas = await buscarConquistas();
  return (
    <main className={estilos.pagina}>
      <h1 className={estilos.titulo}>Conquistas</h1>
      <p className={estilos.intro}>Pautas que viraram mudança, confirmadas por quem apoiou.</p>
      {conquistas.length === 0 ? (
        <p role="status" className={estilos.vazio}>
          Ainda não há conquistas. Quando uma pauta for entregue, ela aparece aqui.
        </p>
      ) : (
        <ul className={estilos.conquistas}>
          {conquistas.map((conquista) => (
            <li key={conquista.pauta_slug}>
              <ItemConquista conquista={conquista} />
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
