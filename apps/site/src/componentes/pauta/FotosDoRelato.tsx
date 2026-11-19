'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { altDaFoto } from './foto';
import { andar, passoDoGesto } from './lightbox';
import estilos from './pauta.module.css';

/**
 * As fotos de um relato (até três): miniaturas lado a lado e, ao tocar numa, a foto inteira abre
 * por cima da própria página, num diálogo, sem mudar de aba. No celular dá para passar entre as
 * fotos arrastando o dedo; no teclado, setas, e Esc fecha. Sem JavaScript, a miniatura é um link
 * normal para a imagem.
 *
 * `urls` já vem validado (`urlFoto`): chave fora do formato não chega aqui.
 */
export function FotosDoRelato({ urls, texto }: { urls: string[]; texto: string }) {
  const dialogo = useRef<HTMLDialogElement>(null);
  const [aberta, setAberta] = useState<number | null>(null);
  const toque = useRef<{ x: number; y: number } | null>(null);
  const origem = useRef<HTMLAnchorElement | null>(null);

  const fechar = useCallback(() => {
    dialogo.current?.close();
  }, []);
  const passar = useCallback(
    (passo: 1 | -1) => {
      setAberta((atual) => (atual === null ? atual : andar(atual, passo, urls.length)));
    },
    [urls.length],
  );

  useEffect(() => {
    const el = dialogo.current;
    if (el && aberta !== null && !el.open) el.showModal();
  }, [aberta]);

  const total = urls.length;
  const posicao = (aberta ?? 0) + 1;
  const atual = aberta === null ? undefined : urls[aberta];
  const legenda = total > 1 ? `Foto ${String(posicao)} de ${String(total)}` : 'Foto do relato';
  return (
    <>
      <ul className={estilos.fotos} aria-label="Fotos do relato">
        {urls.map((url, i) => (
          <li key={url}>
            <a
              href={url}
              className={estilos.fotoLink}
              title="Ampliar a foto"
              aria-haspopup="dialog"
              onClick={(e) => {
                // Com Ctrl, Cmd ou Shift a pessoa quer o link normal (outra aba): deixa seguir.
                if (e.metaKey || e.ctrlKey || e.shiftKey) return;
                e.preventDefault();
                origem.current = e.currentTarget;
                setAberta(i);
              }}
            >
              <img
                src={url}
                alt={altDaFoto(texto, i + 1, total)}
                className={estilos.foto}
                loading="lazy"
              />
              <span className={estilos.somenteLeitor}>(amplia a foto)</span>
            </a>
          </li>
        ))}
      </ul>
      <dialog
        ref={dialogo}
        className={estilos.lightbox}
        aria-label={legenda}
        onClose={() => {
          setAberta(null);
          // O foco volta para a miniatura de onde a pessoa abriu.
          origem.current?.focus();
        }}
        onClick={(e) => {
          // Toque no fundo (fora da foto e dos botões) fecha.
          if (e.target === e.currentTarget) fechar();
        }}
        onKeyDown={(e) => {
          if (e.key === 'ArrowRight') passar(1);
          if (e.key === 'ArrowLeft') passar(-1);
        }}
        onTouchStart={(e) => {
          const t = e.touches[0];
          toque.current = t ? { x: t.clientX, y: t.clientY } : null;
        }}
        onTouchEnd={(e) => {
          const inicio = toque.current;
          const t = e.changedTouches[0];
          toque.current = null;
          if (!inicio || !t || total < 2) return;
          const passo = passoDoGesto(t.clientX - inicio.x, t.clientY - inicio.y);
          if (passo !== 0) passar(passo);
        }}
      >
        {atual !== undefined && (
          <figure className={estilos.lightboxFigura}>
            {/* A foto inteira só é pedida quando abre, e cabe na tela sem cortar. */}
            <img
              src={atual}
              alt={altDaFoto(texto, posicao, total)}
              className={estilos.lightboxImagem}
            />
            <figcaption className={estilos.lightboxLegenda}>{legenda}</figcaption>
          </figure>
        )}
        <button
          type="button"
          className={estilos.lightboxFechar}
          aria-label="Fechar a foto"
          onClick={fechar}
          autoFocus
        >
          ×
        </button>
        {total > 1 && (
          <>
            <button
              type="button"
              className={[estilos.lightboxSeta, estilos.lightboxAnterior].join(' ')}
              aria-label="Foto anterior"
              onClick={() => {
                passar(-1);
              }}
            >
              ‹
            </button>
            <button
              type="button"
              className={[estilos.lightboxSeta, estilos.lightboxProxima].join(' ')}
              aria-label="Próxima foto"
              onClick={() => {
                passar(1);
              }}
            >
              ›
            </button>
          </>
        )}
      </dialog>
    </>
  );
}
