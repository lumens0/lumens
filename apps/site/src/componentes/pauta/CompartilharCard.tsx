'use client';

import { useEffect, useRef, useState } from 'react';
import { compartilharCard, copiarLink, type RecursosDoNavegador } from './compartilhar';
import estilos from './pauta.module.css';

/** O que o navegador do momento oferece, lido só quando a pessoa toca (nunca no servidor). */
function recursosAgora(): RecursosDoNavegador {
  // Fora de um endereço seguro (http), `navigator.clipboard` não existe, embora o tipo diga que sim.
  const area = (navigator as { clipboard?: Clipboard }).clipboard;
  return {
    ...(typeof navigator.share === 'function' && { share: navigator.share.bind(navigator) }),
    ...(typeof navigator.canShare === 'function' && {
      canShare: navigator.canShare.bind(navigator),
    }),
    clipboard: {
      ...(typeof area?.write === 'function' && { write: area.write.bind(area) }),
      ...(typeof area?.writeText === 'function' && { writeText: area.writeText.bind(area) }),
    },
    ...(typeof ClipboardItem !== 'undefined' && {
      itemDeImagem: (blob: Blob) => new ClipboardItem({ 'image/png': blob }),
    }),
  };
}

/**
 * "Compartilhar card": abre um diálogo com a própria imagem que o servidor gera
 * (`/p/[slug]/card.png`, a mesma que o bot manda depois de um apoio) e as ações: compartilhar ou
 * copiar o card, copiar só o link e baixar (que funciona sem JavaScript). Diálogo nativo: foco
 * preso, Esc e foco de volta ao botão.
 */
export function CompartilharCard({
  slug,
  titulo,
  apoios,
  etapa,
  link,
}: {
  slug: string;
  titulo: string;
  apoios: string;
  etapa: string;
  /** Endereço público da pauta (o do site, não o host da requisição). */
  link: string;
}) {
  const dialogo = useRef<HTMLDialogElement>(null);
  const [aviso, setAviso] = useState('');
  const [ocupado, setOcupado] = useState(false);

  useEffect(() => {
    const el = dialogo.current;
    const soltar = () => {
      document.body.style.overflow = '';
    };
    el?.addEventListener('close', soltar);
    return () => {
      el?.removeEventListener('close', soltar);
      soltar();
    };
  }, []);

  const fechar = () => {
    dialogo.current?.close();
    document.body.style.overflow = '';
  };
  const abrir = () => {
    setAviso('');
    document.body.style.overflow = 'hidden';
    dialogo.current?.showModal();
  };

  const compartilhar = async () => {
    setOcupado(true);
    try {
      const resposta = await fetch(`/p/${slug}/card.png`);
      const imagem = await resposta.blob();
      const r = await compartilharCard(
        imagem,
        { titulo, link },
        recursosAgora(),
        `lumens-${slug}.png`,
      );
      setAviso(r.mensagem);
    } catch {
      setAviso('Não deu para carregar o card agora. Use "Baixar card".');
    } finally {
      setOcupado(false);
    }
  };
  const copiar = async () => {
    setAviso((await copiarLink(link, recursosAgora())).mensagem);
  };

  return (
    <>
      <button type="button" className={estilos.fantasma} onClick={abrir}>
        Compartilhar card
      </button>
      <dialog
        ref={dialogo}
        className={estilos.dialogoCard}
        aria-labelledby={`card-titulo-${slug}`}
        onClick={(e) => {
          if (e.target === dialogo.current) fechar();
        }}
      >
        <div className={estilos.dialogoConteudo}>
          <header className={estilos.dialogoTopo}>
            <h2 id={`card-titulo-${slug}`}>Compartilhar card</h2>
            <button
              type="button"
              className={estilos.dialogoFechar}
              aria-label="Fechar"
              onClick={fechar}
            >
              <span aria-hidden="true">✕</span>
            </button>
          </header>
          <img
            src={`/p/${slug}/card.png`}
            alt={`Card da pauta ${titulo}: ${apoios} apoios, etapa ${etapa}, com o link e o QR Code da pauta.`}
            width={1080}
            height={1920}
            loading="lazy"
            className={estilos.imagemDoCard}
          />
          <p className={estilos.dialogoTexto}>
            É este card que o bot manda depois de um apoio: o andamento da pauta, as janelas acesas,
            o link e o QR Code.
          </p>
          <div className={estilos.dialogoAcoes}>
            <button
              type="button"
              className={estilos.dialogoPrincipal}
              disabled={ocupado}
              onClick={() => void compartilhar()}
            >
              Compartilhar ou copiar o card
            </button>
            <button type="button" className={estilos.fantasma} onClick={() => void copiar()}>
              Copiar só o link
            </button>
            <a
              href={`/p/${slug}/card.png`}
              download={`lumens-${slug}.png`}
              className={estilos.fantasma}
              aria-label={`Baixar card da pauta ${titulo}`}
            >
              Baixar card
            </a>
          </div>
          <p role="status" className={estilos.dialogoAviso}>
            {aviso}
          </p>
        </div>
      </dialog>
    </>
  );
}
