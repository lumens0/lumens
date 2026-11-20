import type { StatusPublico } from '@lumens/contratos';
import type { CSSProperties } from 'react';
import { STATUS } from '../StatusPill';
import estilos from './pauta.module.css';

/** As cinco etapas do caminho de uma pauta, da primeira à última. */
export const ETAPAS_DO_FIO: readonly { rotulo: string; status: StatusPublico }[] = [
  { rotulo: 'Apoios', status: 'juntando_apoios' },
  { rotulo: 'Meta', status: 'meta_batida' },
  { rotulo: 'Cobrança', status: 'cobrando' },
  { rotulo: 'Promessa', status: 'prometido' },
  { rotulo: 'Conquista', status: 'conquistada' },
];

/** Rótulo e cor do status; valor fora do catálogo cai na primeira etapa. */
const infoDoStatus = (status: string) =>
  STATUS[(Object.hasOwn(STATUS, status) ? status : 'juntando_apoios') as keyof typeof STATUS];

/** Em qual das cinco janelas a pauta está; "entregue em parte" e "descumprida" ficam na 4.ª. */
export function posicaoNoFio(status: string): number {
  switch (status) {
    case 'juntando_apoios':
      return 0;
    case 'meta_batida':
      return 1;
    case 'cobrando':
      return 2;
    case 'prometido':
    case 'entregue_em_parte':
    case 'descumprida':
      return 3;
    case 'conquistada':
      return 4;
    default:
      return 0;
  }
}

export type EstadoDaJanela = 'acesa' | 'atual' | 'vazada' | 'apagada';

export interface JanelaDoFio {
  rotulo: string;
  estado: EstadoDaJanela;
  cor: string;
}

/**
 * As cinco janelas do fio: acesas até a etapa atual (a atual é a maior), todas na cor do status da
 * pauta; `descumprida` é a janela atual vazada (só o contorno, em vermelho). A janela atual leva o
 * rótulo do status ("Cobrando", "Entregue em parte"); as outras, o nome da etapa.
 */
export function etapasDoFio(status: string): JanelaDoFio[] {
  const atual = posicaoNoFio(status);
  const { ponto: cor, rotulo } = infoDoStatus(status);
  return ETAPAS_DO_FIO.map((etapa, i) => {
    const estado: EstadoDaJanela =
      i > atual ? 'apagada' : i < atual ? 'acesa' : status === 'descumprida' ? 'vazada' : 'atual';
    return { rotulo: i === atual ? rotulo : etapa.rotulo, estado, cor };
  });
}

const TEXTO_DO_ESTADO: Record<EstadoDaJanela, string> = {
  acesa: 'etapa já vencida',
  atual: 'etapa atual',
  vazada: 'etapa atual, a promessa não foi cumprida',
  apagada: 'etapa que ainda não chegou',
};

/**
 * O fio de etapas: cinco janelas ligadas por uma linha. É uma lista (`<ol>`) com o texto de cada
 * etapa, para o leitor de tela; no celular só o rótulo da etapa atual aparece, e a partir de 620 px
 * aparecem todos.
 */
export function FioDeEtapas({ status }: { status: string }) {
  const janelas = etapasDoFio(status);
  return (
    <ol
      className={estilos.fio}
      aria-label="Etapas da pauta"
      style={
        {
          '--cor': infoDoStatus(status).ponto,
          '--f': posicaoNoFio(status) / (ETAPAS_DO_FIO.length - 1),
        } as CSSProperties
      }
    >
      {janelas.map((janela) => (
        <li
          key={janela.rotulo}
          className={[estilos.etapaDoFio, estilos[`fio_${janela.estado}`]].join(' ')}
          aria-current={
            janela.estado === 'atual' || janela.estado === 'vazada' ? 'step' : undefined
          }
        >
          <i className={estilos.janelaDoFio} aria-hidden="true" />
          <span className={estilos.rotuloDoFio}>{janela.rotulo}</span>
          <span className={estilos.somenteLeitor}>, {TEXTO_DO_ESTADO[janela.estado]}</span>
        </li>
      ))}
    </ol>
  );
}
