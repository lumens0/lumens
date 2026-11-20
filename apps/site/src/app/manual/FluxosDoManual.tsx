'use client';

import {
  ROTULO_DO_ONDE,
  type FluxoEmCards,
  type NomeDoIcone as IconeDoFluxo,
} from '@lumens/marca/fluxo';
import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import { Icone, type NomeDoIcone } from '../../componentes/Icone';
import estilos from './page.module.css';

const MAPA_ICONE: Record<IconeDoFluxo, NomeDoIcone> = {
  conversa: 'conversa',
  busca: 'busca',
  email: 'email',
  lapis: 'lapis',
  visto: 'visto',
  escudo: 'escudo',
  compartilhar: 'abrir',
  coracao: 'apoio',
  bandeira: 'flag',
  relogio: 'relogio',
  arquivo: 'documento',
  pessoas: 'pessoas',
  trofeu: 'trofeu',
  lista: 'lista',
  camera: 'camera',
  sino: 'sino',
  local: 'local',
  etiqueta: 'etiqueta',
  qr: 'qr',
  ajustes: 'grade',
  olho: 'olho',
  enviar: 'enviar',
  fechar: 'fechar',
};

const ICONE_DA_ABA: Record<string, NomeDoIcone> = {
  relatar: 'conversa',
  apoiar: 'apoio',
  cuidar: 'pessoas',
  acompanhar: 'trofeu',
};

/**
 * Passo a passo interativo do manual (SCRUM-374): os passos rolam na coluna principal enquanto a
 * conversa de exemplo acompanha presa ao lado (ou no alto, no celular). Clicar num passo também
 * seleciona ele na hora; sem JavaScript, o primeiro fluxo e o primeiro passo já vêm abertos.
 */
export function FluxosDoManual({
  fluxos,
  canal,
  rotulo,
}: {
  fluxos: readonly FluxoEmCards[];
  canal: string;
  rotulo: string;
}) {
  const base = useId();
  const [aba, setAba] = useState(0);
  const [atual, setAtual] = useState(0);
  const listaRef = useRef<HTMLOListElement>(null);
  const conversaRef = useRef<HTMLDivElement>(null);
  const travaAte = useRef(0);

  const fluxo = fluxos[aba] ?? fluxos[0];
  const passos = fluxo?.passos ?? [];

  useEffect(() => {
    const lista = listaRef.current;
    if (!lista) return;
    let quadro = 0;
    const medir = () => {
      quadro = 0;
      if (Date.now() < travaAte.current) return;
      const itens = [...lista.children] as HTMLElement[];
      if (itens.length === 0) return;
      const celular = matchMedia('(max-width: 720px)').matches;
      const fundoConversa = conversaRef.current?.getBoundingClientRect().bottom ?? 0;
      const linha = celular
        ? fundoConversa + (innerHeight - fundoConversa) * 0.45
        : innerHeight * 0.45;
      let indice = 0;
      for (const [k, li] of itens.entries()) {
        if (li.getBoundingClientRect().top <= linha) indice = k;
      }
      setAtual((antes) => (antes === indice ? antes : indice));
    };
    const agendar = () => {
      if (!quadro) quadro = requestAnimationFrame(medir);
    };
    addEventListener('scroll', agendar, { passive: true });
    addEventListener('resize', agendar);
    return () => {
      cancelAnimationFrame(quadro);
      removeEventListener('scroll', agendar);
      removeEventListener('resize', agendar);
    };
  }, [aba, passos.length]);

  if (!fluxo) return null;
  const passoAtual = passos[atual] ?? passos[0];
  if (!passoAtual) return null;

  const abrirAba = (indice: number) => {
    setAba(indice);
    setAtual(0);
    travaAte.current = Date.now() + 500;
  };

  const escolherPasso = (indice: number) => {
    setAtual(indice);
    travaAte.current = Date.now() + 900;
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
    <div className={estilos.fluxosBloco} role="group" aria-label={rotulo}>
      <div className={estilos.abas} role="tablist" aria-label={`Fluxos: ${rotulo}`}>
        {fluxos.map((item, indice) => (
          <button
            key={item.id}
            id={`${base}-aba-${String(indice)}`}
            type="button"
            role="tab"
            aria-selected={indice === aba}
            aria-controls={`${base}-painel`}
            tabIndex={indice === aba ? 0 : -1}
            className={estilos.aba}
            onClick={() => {
              abrirAba(indice);
            }}
            onKeyDown={(evento) => {
              andarPelasAbas(evento, indice);
            }}
          >
            <Icone nome={ICONE_DA_ABA[item.id] ?? 'conversa'} />
            {item.rotulo}
          </button>
        ))}
      </div>

      <div id={`${base}-painel`} role="tabpanel" aria-labelledby={`${base}-aba-${String(aba)}`}>
        <p className={estilos.chamada}>{fluxo.chamada}</p>
        <div className={estilos.fluxo}>
          <div ref={conversaRef} className={estilos.conversa}>
            <div className={estilos.conversaTopo}>
              <span className={estilos.conversaAvatar} aria-hidden="true">
                <Icone nome="conversa" />
              </span>
              <div>
                <b>Lumens</b>
                <small>bot do {canal}</small>
              </div>
              <small className={estilos.passoAtual} aria-live="polite">
                passo {atual + 1} de {passos.length}
              </small>
            </div>
            <div className={estilos.bolhas} key={`${fluxo.id}-${String(atual)}`}>
              {passoAtual.exemplo ? (
                <div className={estilos.baloes} role="group" aria-label="Exemplo da conversa">
                  {passoAtual.exemplo.map((fala, i) => (
                    <div
                      key={i}
                      className={[
                        estilos.bolha,
                        fala.de === 'bot' ? estilos.bolhaBot : estilos.bolhaVoce,
                      ].join(' ')}
                      style={{ animationDelay: `${String(i * 180)}ms` }}
                    >
                      <span className={estilos.quem}>{fala.de === 'bot' ? 'Bot' : 'Você'}</span>
                      <span>{fala.texto}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className={estilos.aviso}>
                  <Icone nome={MAPA_ICONE[passoAtual.icone]} />
                  <b>{passoAtual.titulo}</b>
                  <small>
                    {ROTULO_DO_ONDE[passoAtual.onde]} · {passoAtual.resumo}
                  </small>
                </div>
              )}
            </div>
          </div>

          <ol ref={listaRef} className={estilos.passos}>
            {passos.map((passo, indice) => {
              const aberto = indice === atual;
              const estado = indice < atual ? 'feito' : aberto ? 'atual' : 'depois';
              return (
                <li key={passo.titulo} className={estilos.passo} data-estado={estado}>
                  <div className={estilos.marco} aria-hidden="true">
                    <span>
                      <Icone nome={MAPA_ICONE[passo.icone]} />
                    </span>
                  </div>
                  <button
                    type="button"
                    className={estilos.passoBotao}
                    aria-expanded={aberto}
                    onClick={() => {
                      escolherPasso(indice);
                    }}
                  >
                    <span className={estilos.ondePasso}>
                      Passo {indice + 1} de {passos.length} · {ROTULO_DO_ONDE[passo.onde]}
                    </span>
                    <strong className={estilos.passoTitulo}>{passo.titulo}</strong>
                    <span className={estilos.passoResumo}>{passo.resumo}</span>
                    {passo.detalhe && <span className={estilos.detalhe}>{passo.detalhe}</span>}
                  </button>
                </li>
              );
            })}
          </ol>
        </div>
      </div>
    </div>
  );
}
