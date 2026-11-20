'use client';

import { useState } from 'react';
import estilos from '../../painel.module.css';

/** O motivo da recusa com o contador de caracteres; vai a quem criou a pauta pelo bot. */
export function MotivoDaRecusa({ maximo }: { maximo: number }) {
  const [texto, setTexto] = useState('');
  return (
    <>
      <label htmlFor="motivo">Motivo, enviado a quem criou pelo bot</label>
      <textarea
        id="motivo"
        name="motivo"
        rows={4}
        required
        maxLength={maximo}
        placeholder="Escreva de um jeito que a pessoa consiga corrigir e tentar de novo."
        value={texto}
        onChange={(evento) => {
          setTexto(evento.target.value);
        }}
      />
      <p className={estilos.detalhes}>
        {texto.length}/{maximo}
      </p>
    </>
  );
}
