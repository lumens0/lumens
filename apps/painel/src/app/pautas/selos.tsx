import type { CSSProperties } from 'react';
import type { PautaDaCuradoria } from '@lumens/dominio';
import estilos from '../painel.module.css';
import { COR_NO_PAINEL, STATUS } from './status';

const HORA_MS = 3_600_000;

/** Situação do prazo de 24 h da curadoria, em horas: sobram mais de 6, sobram até 6 ou já passou. */
export function situacaoDoPrazo(restanteMs: number) {
  if (restanteMs <= 0) return 'atrasada' as const;
  return restanteMs > 6 * HORA_MS ? ('no_prazo' as const) : ('vence_em_breve' as const);
}

/** "vence em 5 h" ou "atrasada há 3 h" (horas cheias; menos de uma hora também aparece). */
export function textoDoSelo(restanteMs: number): string {
  if (restanteMs > 0) {
    const horas = Math.ceil(restanteMs / HORA_MS);
    return `vence em ${String(horas)}\u00a0h`;
  }
  const horas = Math.floor(-restanteMs / HORA_MS);
  return horas === 0 ? 'atrasada há menos de 1\u00a0h' : `atrasada há ${String(horas)}\u00a0h`;
}

const CLASSE = {
  no_prazo: '',
  vence_em_breve: estilos.prazoHoje,
  atrasada: estilos.prazoAtrasado,
};

/** O selo de prazo da lista e da pauta. A cor nunca é o único sinal: o texto diz o quanto falta. */
export function SeloDePrazo({ restanteMs }: { prazo?: Date; restanteMs: number }) {
  return (
    <span className={[estilos.selo, CLASSE[situacaoDoPrazo(restanteMs)]].join(' ').trim()}>
      {textoDoSelo(restanteMs)}
    </span>
  );
}

/** A etapa da pauta: a janela na cor da etapa e o nome em letras maiúsculas, com "Urgente" ao lado. */
export function EtapaDaPauta({
  status,
  urgente = false,
}: {
  status: PautaDaCuradoria['status'];
  urgente?: boolean;
}) {
  return (
    <p className={estilos.etapa}>
      <i
        className={[estilos.glifo, status === 'descumprida' ? estilos.glifoVazado : ''].join(' ')}
        style={{ '--c': COR_NO_PAINEL[status] } as CSSProperties}
        aria-hidden="true"
      />
      {STATUS[status]}
      {urgente && <em>Urgente</em>}
    </p>
  );
}
