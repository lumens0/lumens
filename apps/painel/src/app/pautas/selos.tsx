import { COR_DO_STATUS } from '@lumens/marca';
import type { PautaDaCuradoria } from '@lumens/dominio';
import estilos from '../painel.module.css';
import { textoDoPrazo } from '../prazo';
import { STATUS } from './status';

/** Situação da pauta com a mesma cor de etapa do site; o rótulo vem sempre junto da cor. */
export function SeloDeStatus({ status }: { status: PautaDaCuradoria['status'] }) {
  return (
    <span className={estilos.selo}>
      <i
        className={estilos.janela}
        style={{ background: COR_DO_STATUS[status] }}
        aria-hidden="true"
      />
      {STATUS[status]}
    </span>
  );
}

const DIA = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Maceio' });

/** Situação do prazo de 24 h da curadoria: no prazo, vence hoje (no dia de Maceió) ou atrasada. */
export function situacaoDoPrazo(prazo: Date, restanteMs: number) {
  if (restanteMs < 0) return 'atrasada' as const;
  const agora = new Date(prazo.getTime() - restanteMs);
  return DIA.format(prazo) === DIA.format(agora) ? ('vence_hoje' as const) : ('no_prazo' as const);
}

const PRAZO = {
  no_prazo: { rotulo: 'No prazo', classe: estilos.prazoOk },
  vence_hoje: { rotulo: 'Vence hoje', classe: estilos.prazoHoje },
  atrasada: { rotulo: 'Atrasada', classe: estilos.prazoAtrasado },
};

export function SeloDePrazo({ prazo, restanteMs }: { prazo: Date; restanteMs: number }) {
  const { rotulo, classe } = PRAZO[situacaoDoPrazo(prazo, restanteMs)];
  const detalhe = textoDoPrazo(restanteMs);
  return (
    <span className={[estilos.selo, classe].join(' ')}>
      {rotulo} · {restanteMs < 0 ? detalhe.replace('atrasada ', '') : detalhe}
    </span>
  );
}

export function SeloUrgente() {
  return <span className={[estilos.selo, estilos.seloUrgente].join(' ')}>Urgente</span>;
}
