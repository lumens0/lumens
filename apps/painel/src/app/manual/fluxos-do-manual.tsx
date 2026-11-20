'use client';

import type { FluxoEmCards, OndeDoPasso } from '@lumens/marca/fluxo';
import { useState, type CSSProperties } from 'react';
import estilos from '../painel.module.css';

/** Onde o passo acontece: o nome escrito e a cor do ponto (a cor nunca é o único sinal). */
const ONDE: Record<OndeDoPasso, { rotulo: string; cor: string }> = {
  bot: { rotulo: 'WhatsApp', cor: '#36864f' },
  site: { rotulo: 'Site', cor: '#ffa41b' },
  painel: { rotulo: 'Painel', cor: '#8959bd' },
  automatico: { rotulo: 'Automático', cor: '#168b86' },
};

/**
 * Os fluxos do manual: chips para escolher o fluxo, a chamada e a linha dos passos, cada um com
 * onde acontece, o resumo, a conversa de exemplo e o "Saiba mais".
 */
export function FluxosDoManual({ fluxos }: { fluxos: readonly FluxoEmCards[] }) {
  const [escolhido, setEscolhido] = useState(fluxos[0]?.id);
  const fluxo = fluxos.find((f) => f.id === escolhido) ?? fluxos[0];
  if (fluxo === undefined) return null;
  return (
    <div>
      <div
        className={[estilos.chips, estilos.rolagem].join(' ')}
        role="group"
        aria-label="Escolher fluxo"
      >
        {fluxos.map((f) => (
          <button
            key={f.id}
            type="button"
            className={estilos.chip}
            aria-current={f.id === fluxo.id ? 'true' : undefined}
            aria-pressed={f.id === fluxo.id}
            onClick={() => {
              setEscolhido(f.id);
            }}
          >
            {f.rotulo}
          </button>
        ))}
      </div>
      <p className={estilos.fluxoChamada}>{fluxo.chamada}</p>
      <ol className={estilos.fluxoPassos} key={fluxo.id}>
        {fluxo.passos.map((passo) => {
          const onde = ONDE[passo.onde];
          return (
            <li key={passo.titulo} style={{ '--k': onde.cor } as CSSProperties}>
              <i className={estilos.glifo} aria-hidden="true" />
              <div>
                <small>{onde.rotulo}</small>
                <strong>{passo.titulo}</strong>
                <p>{passo.resumo}</p>
                {passo.exemplo !== undefined && (
                  <div className={estilos.bolhas}>
                    {passo.exemplo.map((fala) => (
                      <span
                        key={`${fala.de}-${fala.texto}`}
                        className={[
                          estilos.bolha,
                          fala.de === 'bot' ? estilos.bolhaBot : estilos.bolhaVoce,
                        ].join(' ')}
                      >
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
          );
        })}
      </ol>
    </div>
  );
}
