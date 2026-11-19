'use client';

import { useId, useState, type KeyboardEvent } from 'react';

/** Onde o passo acontece. Cada lugar tem a sua cor e o nome escrito: a cor nunca é o único sinal. */
export type OndeDoPasso = 'bot' | 'site' | 'painel' | 'automatico';

export const ROTULO_DO_ONDE: Record<OndeDoPasso, string> = {
  bot: 'No bot',
  site: 'No site',
  painel: 'No painel',
  automatico: 'Automático',
};

export interface PassoDoFluxo {
  titulo: string;
  /** Uma frase, sempre visível no card. */
  resumo: string;
  /** Mais contexto, que aparece quando o card é aberto. */
  detalhe?: string;
  onde: OndeDoPasso;
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
 * Fluxos de uso em cards, o mesmo no manual do site e no do painel. Abas trocam de fluxo; cada
 * passo é um card que abre o detalhe, e "Anterior" e "Próximo" andam pelo fluxo, marcando o que já
 * passou. Sem JavaScript, a página mostra o primeiro fluxo inteiro, com o primeiro passo aberto.
 */
export function Fluxos({
  fluxos,
  rotulo,
}: {
  fluxos: readonly FluxoEmCards[];
  /** Nome do bloco para o leitor de tela. */
  rotulo: string;
}) {
  const base = useId();
  const [aba, setAba] = useState(0);
  const [atual, setAtual] = useState(0);
  const fluxo = fluxos[aba] ?? fluxos[0];
  if (fluxo === undefined) return null;
  const total = fluxo.passos.length;

  const abrirAba = (indice: number) => {
    setAba(indice);
    setAtual(0);
  };

  const andarPelasAbas = (evento: KeyboardEvent<HTMLButtonElement>, indice: number) => {
    let destino: number | undefined;
    if (evento.key === 'ArrowRight') destino = (indice + 1) % fluxos.length;
    else if (evento.key === 'ArrowLeft') destino = (indice - 1 + fluxos.length) % fluxos.length;
    else if (evento.key === 'Home') destino = 0;
    else if (evento.key === 'End') destino = fluxos.length - 1;
    if (destino === undefined) return;
    evento.preventDefault();
    abrirAba(destino);
    document.getElementById(`${base}-aba-${String(destino)}`)?.focus();
  };

  return (
    <div className="fluxo" role="group" aria-label={rotulo}>
      <div className="fluxo-abas" role="tablist" aria-label={`Fluxos: ${rotulo}`}>
        {fluxos.map((item, indice) => (
          <button
            key={item.id}
            id={`${base}-aba-${String(indice)}`}
            type="button"
            role="tab"
            aria-selected={indice === aba}
            aria-controls={`${base}-painel`}
            tabIndex={indice === aba ? 0 : -1}
            className="fluxo-aba"
            onClick={() => {
              abrirAba(indice);
            }}
            onKeyDown={(evento) => {
              andarPelasAbas(evento, indice);
            }}
          >
            {item.rotulo}
          </button>
        ))}
      </div>

      <div
        id={`${base}-painel`}
        role="tabpanel"
        aria-labelledby={`${base}-aba-${String(aba)}`}
        className="fluxo-painel"
      >
        <p className="fluxo-chamada">{fluxo.chamada}</p>
        <progress
          className="fluxo-progresso"
          max={total}
          value={atual + 1}
          aria-label={`Passo ${String(atual + 1)} de ${String(total)}`}
        />
        <ol className="fluxo-passos">
          {fluxo.passos.map((passo, indice) => {
            const aberto = indice === atual;
            const estado = indice < atual ? 'feito' : aberto ? 'atual' : 'depois';
            return (
              <li key={passo.titulo} className="fluxo-passo" data-estado={estado}>
                <button
                  type="button"
                  className="fluxo-card"
                  aria-expanded={aberto}
                  aria-controls={`${base}-detalhe-${String(indice)}`}
                  onClick={() => {
                    setAtual(indice);
                  }}
                >
                  <span className="fluxo-numero" aria-hidden="true">
                    {indice < atual ? '✓' : indice + 1}
                  </span>
                  <span className="fluxo-texto">
                    <span className="fluxo-onde" data-onde={passo.onde}>
                      {ROTULO_DO_ONDE[passo.onde]}
                    </span>
                    <strong className="fluxo-titulo">{passo.titulo}</strong>
                    <span className="fluxo-resumo">{passo.resumo}</span>
                  </span>
                </button>
                <div
                  id={`${base}-detalhe-${String(indice)}`}
                  className="fluxo-detalhe"
                  hidden={!aberto || passo.detalhe === undefined}
                >
                  {passo.detalhe}
                </div>
              </li>
            );
          })}
        </ol>
        <div className="fluxo-controles">
          <button
            type="button"
            className="fluxo-botao"
            disabled={atual === 0}
            onClick={() => {
              setAtual(atual - 1);
            }}
          >
            Anterior
          </button>
          <span className="fluxo-contagem" aria-live="polite">
            Passo {atual + 1} de {total}
          </span>
          <button
            type="button"
            className="fluxo-botao fluxo-botao-principal"
            disabled={atual === total - 1}
            onClick={() => {
              setAtual(atual + 1);
            }}
          >
            Próximo
          </button>
        </div>
      </div>
    </div>
  );
}
