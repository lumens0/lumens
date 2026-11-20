'use client';

import { useEffect, useState } from 'react';
import { Enviar } from '../../enviar';
import estilos from '../../painel.module.css';
import { CAMPO_FOTO, CAMPO_TEXTO, CAMPO_TIRAR_FOTO } from './conquista-campos';

/** O mesmo teto do domínio (`O_QUE_FOI_FEITO_MAXIMO`) e do banco. */
const MAXIMO = 160;

/**
 * Formulário "Card de conquista" (SCRUM-394): texto de até 160 caracteres com contador, uma foto
 * com prévia e os botões Salvar e Ver o card. A barra de e-mail e telefone é do servidor (a mesma
 * dos relatos); aqui só o contador, a prévia e o aviso da foto.
 */
export function FormularioDaConquista({
  pautaId,
  textoSalvo,
  fotoAtual,
  urlDoCard,
  salvar,
}: {
  pautaId: string;
  textoSalvo: string;
  /** Caminho da foto que já está salva, pela rota privada do painel. */
  fotoAtual: string | null;
  /** Endereço do card no site; sem ele o botão "Ver o card" não aparece. */
  urlDoCard: string | null;
  salvar: (formulario: FormData) => Promise<void>;
}) {
  const [texto, setTexto] = useState(textoSalvo);
  const [previa, setPrevia] = useState<string | null>(null);
  // Libera a URL temporária da prévia ao trocar de arquivo e ao sair da tela.
  useEffect(
    () => () => {
      if (previa !== null) URL.revokeObjectURL(previa);
    },
    [previa],
  );
  const usados = Array.from(texto).length;
  const passou = usados > MAXIMO;

  return (
    <form action={salvar} className={estilos.formulario} encType="multipart/form-data">
      <input type="hidden" name="pautaId" value={pautaId} />
      <label htmlFor="o-que-foi-feito">
        O que foi feito <small className={estilos.dicaInline}>até {MAXIMO} caracteres</small>
      </label>
      <textarea
        id="o-que-foi-feito"
        name={CAMPO_TEXTO}
        value={texto}
        onChange={(evento) => {
          setTexto(evento.target.value);
        }}
        aria-describedby="o-que-foi-feito-dica o-que-foi-feito-contador"
        rows={3}
      />
      <p
        id="o-que-foi-feito-contador"
        className={passou ? estilos.contadorPassou : estilos.detalhes}
        aria-live="polite"
      >
        {usados}/{MAXIMO}
        {passou ? `: tire ${String(usados - MAXIMO)} para salvar.` : ''}
      </p>
      <p id="o-que-foi-feito-dica" className={estilos.vh}>
        Uma ou duas frases, sem nome de pessoa, e-mail nem telefone. Aparece no card e na página da
        pauta.
      </p>

      <label htmlFor="foto-da-conquista">Foto do que foi feito</label>
      <div className={estilos.anexo}>
        {(previa ?? fotoAtual) !== null && (
          <img
            src={previa ?? fotoAtual ?? ''}
            alt={previa === null ? 'Foto da conquista que está salva' : 'Prévia da foto escolhida'}
          />
        )}
        <input
          id="foto-da-conquista"
          type="file"
          name={CAMPO_FOTO}
          accept="image/jpeg,image/png,image/webp"
          aria-describedby="foto-da-conquista-aviso"
          onChange={(evento) => {
            const arquivo = evento.target.files?.[0];
            setPrevia(arquivo ? URL.createObjectURL(arquivo) : null);
          }}
        />
      </div>
      <p id="foto-da-conquista-aviso" className={estilos.detalhes}>
        A foto perde a localização antes de ser guardada. Confira se não aparece rosto de pessoa ou
        placa de carro.
      </p>
      {previa === null && fotoAtual !== null && (
        <>
          <label className={estilos.marcar}>
            <input type="checkbox" name={CAMPO_TIRAR_FOTO} /> Tirar esta foto
          </label>
          <p className={estilos.detalhes}>Escolher outra foto acima troca esta.</p>
        </>
      )}

      <div className={estilos.acoes}>
        <Enviar className={estilos.botao} desabilitado={passou}>
          Salvar
        </Enviar>
        {urlDoCard !== null && (
          <a className={estilos.botaoSecundario} href={urlDoCard} target="_blank" rel="noreferrer">
            Ver o card de conquista
          </a>
        )}
      </div>
    </form>
  );
}
