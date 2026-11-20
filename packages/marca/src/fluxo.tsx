'use client';

import { useState, type CSSProperties } from 'react';

/** Onde o passo acontece. Cada lugar tem a sua cor e o nome escrito: a cor nunca é o único sinal. */
export type OndeDoPasso = 'bot' | 'site' | 'painel' | 'automatico';

export const ROTULO_DO_ONDE: Record<OndeDoPasso, string> = {
  bot: 'WhatsApp',
  site: 'Site',
  painel: 'Painel',
  automatico: 'Automático',
};

/** A cor de cada lugar: verde do bot, âmbar do site, lilás do painel e turquesa do que roda sozinho. */
const COR_DO_ONDE: Record<OndeDoPasso, string> = {
  bot: '#36864f',
  site: '#ffa41b',
  painel: '#8959bd',
  automatico: '#168b86',
};

/** Nome do ícone de um passo. O desenho dos manuais não usa ícones; o campo segue nos dados. */
export type NomeDoIcone = string;

/** Uma fala de exemplo, para mostrar o passo como a pessoa o vê na conversa. */
export interface FalaDeExemplo {
  de: 'voce' | 'bot';
  texto: string;
}

export interface PassoDoFluxo {
  titulo: string;
  /** Uma frase, sempre visível no card. */
  resumo: string;
  /** Mais contexto, que aparece quando o card é aberto. */
  detalhe?: string;
  onde: OndeDoPasso;
  icone?: NomeDoIcone;
  /** Como o passo aparece na conversa: balões do que a pessoa escreve e do que o bot responde. */
  exemplo?: readonly FalaDeExemplo[];
}

export interface FluxoEmCards {
  id: string;
  /** Nome curto da aba. */
  rotulo: string;
  /** Uma linha antes dos passos: para quem é e o que se consegue. */
  chamada: string;
  passos: readonly PassoDoFluxo[];
}

/**
 * Fluxos de uso, o mesmo no manual do site e no do painel: fichas para escolher o fluxo e, abaixo,
 * os passos numa linha vertical. Cada passo diz onde acontece (a cor nunca é o único sinal), traz
 * o resumo, as falas de exemplo da conversa e, em "Saiba mais", o detalhe. Sem JavaScript, a página
 * mostra o primeiro fluxo inteiro.
 */
export function Fluxos({
  fluxos,
  rotulo,
  rotuloDoBot = ROTULO_DO_ONDE.bot,
}: {
  fluxos: readonly FluxoEmCards[];
  /** Nome do bloco para o leitor de tela. */
  rotulo: string;
  /** Como o passo "no bot" se chama na tela: o canal ativo (WhatsApp ou Telegram). */
  rotuloDoBot?: string;
}) {
  const [aba, setAba] = useState(0);
  const fluxo = fluxos[aba] ?? fluxos[0];
  if (fluxo === undefined) return null;
  return (
    <div className="fx" role="group" aria-label={rotulo}>
      <div className="fx-chips" role="group" aria-label="Escolher fluxo">
        {fluxos.map((item, indice) => (
          <button
            key={item.id}
            type="button"
            className="fx-chip"
            aria-pressed={indice === aba}
            onClick={() => {
              setAba(indice);
            }}
          >
            {item.rotulo}
          </button>
        ))}
      </div>
      <p className="fx-ch">{fluxo.chamada}</p>
      <ol className="fx-ol" key={fluxo.id}>
        {fluxo.passos.map((passo, indice) => (
          <li
            key={passo.titulo}
            style={{ '--k': COR_DO_ONDE[passo.onde], '--i': indice } as CSSProperties}
          >
            <i className="fx-gl" aria-hidden="true" />
            <div>
              <small>{passo.onde === 'bot' ? rotuloDoBot : ROTULO_DO_ONDE[passo.onde]}</small>
              <strong>{passo.titulo}</strong>
              <p>{passo.resumo}</p>
              {passo.exemplo !== undefined && (
                <div className="fx-bolhas" role="group" aria-label="Exemplo da conversa">
                  {passo.exemplo.map((fala, i) => (
                    <span key={i} className="fx-bl" data-de={fala.de}>
                      <span className="fx-quem">{fala.de === 'bot' ? 'Bot: ' : 'Você: '}</span>
                      {fala.texto}
                    </span>
                  ))}
                </div>
              )}
              {passo.detalhe !== undefined && (
                <details>
                  <summary>Saiba mais</summary>
                  <p>{passo.detalhe}</p>
                </details>
              )}
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}
