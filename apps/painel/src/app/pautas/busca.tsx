'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import estilos from '../painel.module.css';
import { urlDaLista } from './url-da-lista';

/**
 * A busca da lista: filtra enquanto se digita (a URL muda depois de uma pausa curta e o servidor
 * refaz a lista). Sem JavaScript, o Enter envia o formulário e a lista também se filtra.
 */
export function BuscaDaLista({
  q,
  situacoes,
  pendencias,
}: {
  q: string;
  situacoes: readonly string[];
  pendencias: readonly string[];
}) {
  const roteador = useRouter();
  const [texto, setTexto] = useState(q);
  const ultimo = useRef(q);
  // Os filtros mudam de identidade a cada render do servidor; lidos por ref, não reiniciam a pausa.
  const filtros = useRef({ situacoes, pendencias });
  filtros.current = { situacoes, pendencias };
  useEffect(() => {
    // Busca que chegou de fora (por exemplo, "Limpar filtros"): o campo acompanha. A que a própria
    // pessoa digitou e já enviou não o reescreve no meio da digitação.
    if (q.trim() !== ultimo.current.trim()) {
      ultimo.current = q;
      setTexto(q);
    }
  }, [q]);
  useEffect(() => {
    if (texto.trim() === ultimo.current.trim()) return;
    const espera = setTimeout(() => {
      ultimo.current = texto;
      roteador.replace(urlDaLista({ ...filtros.current, q: texto }), { scroll: false });
    }, 300);
    return () => {
      clearTimeout(espera);
    };
  }, [texto, roteador]);
  return (
    <form action="/pautas" method="get" role="search" className={estilos.busca}>
      <label htmlFor="busca-pautas" className={estilos.vh}>
        Buscar por título, bloco ou etapa
      </label>
      <input
        id="busca-pautas"
        name="q"
        type="search"
        value={texto}
        onChange={(evento) => {
          setTexto(evento.target.value);
        }}
        placeholder="Buscar por título, bloco ou etapa"
        autoComplete="off"
      />
      <input
        type="hidden"
        name="status"
        value={situacoes.length > 0 ? situacoes.join(',') : 'todas'}
      />
      {pendencias.length > 0 && (
        <input type="hidden" name="pendencia" value={pendencias.join(',')} />
      )}
    </form>
  );
}
