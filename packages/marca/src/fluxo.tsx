'use client';

import { useId, useState, type KeyboardEvent, type ReactNode } from 'react';

/** Onde o passo acontece. Cada lugar tem a sua cor e o nome escrito: a cor nunca é o único sinal. */
export type OndeDoPasso = 'bot' | 'site' | 'painel' | 'automatico';

export const ROTULO_DO_ONDE: Record<OndeDoPasso, string> = {
  bot: 'No bot',
  site: 'No site',
  painel: 'No painel',
  automatico: 'Automático',
};

/** Ícones dos cards: traços simples de 24 × 24, desenhados aqui para não depender de biblioteca. */
export type NomeDoIcone =
  | 'conversa'
  | 'busca'
  | 'email'
  | 'lapis'
  | 'visto'
  | 'escudo'
  | 'compartilhar'
  | 'coracao'
  | 'bandeira'
  | 'relogio'
  | 'arquivo'
  | 'pessoas'
  | 'trofeu'
  | 'lista'
  | 'camera'
  | 'sino'
  | 'local'
  | 'etiqueta'
  | 'qr'
  | 'ajustes'
  | 'olho'
  | 'enviar'
  | 'fechar';

const ICONES: Record<NomeDoIcone, ReactNode> = {
  conversa: <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />,
  busca: (
    <>
      <circle cx="11" cy="11" r="7" />
      <path d="m21 21-4.3-4.3" />
    </>
  ),
  email: (
    <>
      <rect x="2" y="4" width="20" height="16" rx="2" />
      <path d="m22 7-10 6L2 7" />
    </>
  ),
  lapis: (
    <>
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" />
    </>
  ),
  visto: <path d="M20 6 9 17l-5-5" />,
  escudo: <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />,
  compartilhar: (
    <>
      <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" />
      <path d="m16 6-4-4-4 4" />
      <path d="M12 2v13" />
    </>
  ),
  coracao: (
    <path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1-1.1a5.5 5.5 0 0 0-7.8 7.8l1 1.1L12 21l7.8-7.5 1-1.1a5.5 5.5 0 0 0 0-7.8z" />
  ),
  bandeira: (
    <>
      <path d="M4 22V4" />
      <path d="M4 4h13l-2 4 2 4H4" />
    </>
  ),
  relogio: (
    <>
      <circle cx="12" cy="12" r="10" />
      <path d="M12 6v6l4 2" />
    </>
  ),
  arquivo: (
    <>
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <path d="M14 2v6h6M8 13h8M8 17h6" />
    </>
  ),
  pessoas: (
    <>
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8" />
    </>
  ),
  trofeu: (
    <>
      <path d="M8 21h8M12 17v4" />
      <path d="M7 4h10v5a5 5 0 0 1-10 0z" />
      <path d="M17 5h3v2a3 3 0 0 1-3 3M7 5H4v2a3 3 0 0 0 3 3" />
    </>
  ),
  lista: <path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" />,
  camera: (
    <>
      <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
      <circle cx="12" cy="13" r="4" />
    </>
  ),
  sino: (
    <>
      <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
      <path d="M13.7 21a2 2 0 0 1-3.4 0" />
    </>
  ),
  local: (
    <>
      <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
      <circle cx="12" cy="10" r="3" />
    </>
  ),
  etiqueta: (
    <>
      <path d="M20.6 13.4l-7.2 7.2a2 2 0 0 1-2.8 0L2 12V2h10l8.6 8.6a2 2 0 0 1 0 2.8z" />
      <path d="M7 7h.01" />
    </>
  ),
  qr: (
    <>
      <rect x="3" y="3" width="7" height="7" rx="1" />
      <rect x="14" y="3" width="7" height="7" rx="1" />
      <rect x="3" y="14" width="7" height="7" rx="1" />
      <path d="M14 14h3v3h-3zM21 14v.01M14 21v.01M21 21h-4v-4" />
    </>
  ),
  ajustes: <path d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6" />,
  olho: (
    <>
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8S1 12 1 12z" />
      <circle cx="12" cy="12" r="3" />
    </>
  ),
  enviar: <path d="m22 2-7 20-4-9-9-4zM22 2 11 13" />,
  fechar: <path d="M18 6 6 18M6 6l12 12" />,
};

function Icone({ nome }: { nome: NomeDoIcone }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="24"
      height="24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {ICONES[nome]}
    </svg>
  );
}

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
  icone: NomeDoIcone;
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
                  <span className="fluxo-icone" data-onde={passo.onde}>
                    <Icone nome={passo.icone} />
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
                  hidden={!aberto || (passo.detalhe === undefined && passo.exemplo === undefined)}
                >
                  {passo.detalhe}
                  {passo.exemplo !== undefined && (
                    <div className="fluxo-exemplo" role="group" aria-label="Exemplo da conversa">
                      {passo.exemplo.map((fala, i) => (
                        <span key={i} className="fluxo-balao" data-de={fala.de}>
                          <span className="fluxo-quem">{fala.de === 'bot' ? 'Bot' : 'Você'}</span>
                          {fala.texto}
                        </span>
                      ))}
                    </div>
                  )}
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
