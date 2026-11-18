import {
  agruparEventosIguais,
  rotuloDeResponsaveis,
  type Evento,
  type PautaDetalhe,
} from '@lumens/contratos';
import { STATUS } from '../StatusPill';
import estilos from './pauta.module.css';

// Rótulos dos tipos públicos do catálogo da T7 (docs/arquitetura/esquema-e-contratos.md). Manter em sincronia com
// TIPOS_EVENTO/PUBLICO de packages/dominio/src/compartilhado/eventos.ts, a fonte do catálogo.
const ROTULOS: Record<string, string> = {
  pauta_aprovada: 'Pauta aprovada',
  meta_batida: 'Meta de apoios batida',
  caminho_aberto: 'Caminho aberto',
  protocolo_registrado: 'Protocolo registrado',
  prazo_prorrogado: 'Prazo prorrogado',
  protocolo_corrigido: 'Data do protocolo corrigida',
  proposta_publicada: 'Proposta publicada',
  proposta_executada: 'Proposta executada',
  resposta_oficial_recebida: 'Resposta oficial recebida',
  promessa_registrada: 'Promessa registrada',
  promessa_remarcada: 'Promessa remarcada',
  conferencia_aberta: 'Conferência aberta',
  conferencia_apurada: 'Conferência apurada',
  status_alterado: 'Status alterado',
  owner_entrou: 'Novo responsável',
  owner_removido: 'Responsável saiu',
  relato_aprovado: 'Relato publicado',
  meta_ajustada: 'Meta ajustada pela curadoria',
  bloco_corrigido: 'Bloco corrigido pela curadoria',
  categoria_alterada: 'Categoria alterada pela curadoria',
};

/** Tipo fora do catálogo não quebra a página: vira texto legível. */
export function rotuloEvento(tipo: string): string {
  return ROTULOS[tipo] ?? tipo.replaceAll('_', ' ');
}

/** Rótulo do status como o site o usa nas etiquetas; valor fora do catálogo vira texto legível. */
function rotuloDoStatus(valor: unknown): string | undefined {
  if (typeof valor !== 'string' || valor.trim() === '') return undefined;
  const conhecido = Object.hasOwn(STATUS, valor) ? STATUS[valor as keyof typeof STATUS] : undefined;
  return conhecido ? conhecido.rotulo : valor.trim().replaceAll('_', ' ');
}

// O evento de status não grava o motivo: ele vem de outro acontecimento do mesmo instante (a
// transação que bate a meta, registra a promessa, apura a conferência...). Em ordem de preferência.
const MOTIVOS_DO_STATUS: ReadonlyArray<readonly [string, string]> = [
  ['meta_batida', 'a meta de apoios foi batida'],
  ['conferencia_apurada', 'a conferência foi apurada'],
  ['promessa_registrada', 'uma promessa foi registrada'],
  ['resposta_oficial_recebida', 'a resposta oficial foi recebida'],
  ['proposta_executada', 'a proposta da comunidade foi executada'],
  ['caminho_aberto', 'um caminho foi aberto'],
];

/** O que explica a mudança de status: um evento do mesmo instante, se houver. */
function motivoDoStatus(evento: Evento, todos: readonly Evento[]): string | undefined {
  const instante = Date.parse(evento.criado_em);
  const vizinhos = todos.filter(
    (outro) => outro !== evento && Date.parse(outro.criado_em) === instante,
  );
  return MOTIVOS_DO_STATUS.find(([tipo]) => vizinhos.some((outro) => outro.tipo === tipo))?.[1];
}

/** "De Juntando apoios para Cobrando, porque a meta de apoios foi batida". */
function textoDoStatus(dados: Record<string, unknown>, motivo: string | undefined): string {
  const de = rotuloDoStatus(dados.de);
  const para = rotuloDoStatus(dados.para);
  const mudanca =
    de && para
      ? `De ${de} para ${para}`
      : para
        ? `Status alterado para ${para}`
        : de
          ? `Status alterado a partir de ${de}`
          : 'Status alterado';
  return motivo ? `${mudanca}, porque ${motivo}` : mudanca;
}

/**
 * SCRUM-345: quem entra ou sai aparece pelo papel ("Corresponsável saiu"). Papel ausente ou
 * desconhecido cai no rótulo genérico. Quem saiu por inatividade ainda não se distingue: o evento
 * público não leva a origem.
 */
export function rotuloDoPapel(tipo: string, dados: Record<string, unknown>): string | undefined {
  if (tipo !== 'owner_entrou' && tipo !== 'owner_removido') return undefined;
  const papel =
    dados.papel === 'co_owner'
      ? 'corresponsável'
      : dados.papel === 'owner'
        ? 'responsável'
        : undefined;
  if (papel === undefined) return undefined;
  return tipo === 'owner_entrou'
    ? `Novo ${papel}`
    : `${papel.charAt(0).toUpperCase()}${papel.slice(1)} saiu`;
}

function textoDoEvento(evento: Evento, todos: readonly Evento[], quantidade = 1): string {
  const { tipo, dados } = evento;
  const grupo = rotuloDeResponsaveis(tipo, dados, quantidade);
  if (grupo !== undefined) return grupo;
  const doPapel = rotuloDoPapel(tipo, dados);
  if (doPapel !== undefined) return doPapel;
  if (tipo === 'status_alterado') return textoDoStatus(dados, motivoDoStatus(evento, todos));
  if (tipo === 'meta_ajustada') {
    const metaAntes = typeof dados.metaAntes === 'number' ? String(dados.metaAntes) : '?';
    const metaDepois = typeof dados.metaDepois === 'number' ? String(dados.metaDepois) : '?';
    const motivo = typeof dados.motivo === 'string' ? dados.motivo : '?';
    return `Meta ajustada pela curadoria de ${metaAntes} para ${metaDepois}: ${motivo}`;
  }
  if (tipo === 'bloco_corrigido') {
    const antes = typeof dados.blocoAntes === 'string' ? dados.blocoAntes : 'Todo o campus';
    const depois = typeof dados.blocoDepois === 'string' ? dados.blocoDepois : 'Todo o campus';
    return `Bloco corrigido pela curadoria: ${antes} → ${depois}`;
  }
  if (tipo === 'pauta_urgente') {
    return dados.urgente === true ? 'Marcada como urgente pela curadoria' : 'Deixou de ser urgente';
  }
  if (['prazo_prorrogado', 'protocolo_corrigido', 'promessa_remarcada'].includes(tipo)) {
    const anterior = dataCivil(dados.data_antiga);
    const nova = dataCivil(dados.data_nova);
    const motivo = typeof dados.motivo === 'string' ? ` Motivo: ${dados.motivo}.` : '';
    const fonte = typeof dados.fonte === 'string' ? ` Fonte: ${dados.fonte}.` : '';
    return `${rotuloEvento(tipo)}: ${anterior} → ${nova}.${motivo}${fonte}`;
  }
  return rotuloEvento(tipo);
}

function dataCivil(valor: unknown): string {
  if (typeof valor !== 'string') return '?';
  return /^\d{4}-\d{2}-\d{2}$/.test(valor) ? valor.split('-').reverse().join('/') : valor;
}

const data = new Intl.DateTimeFormat('pt-BR', {
  dateStyle: 'short',
  timeStyle: 'short',
  timeZone: 'America/Maceio',
});

export const formatarData = (instante: string) => data.format(new Date(instante));

const dia = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeZone: 'America/Maceio' });

/** Só a data, sem a hora, no fuso de Maceió. */
export const formatarDia = (instante: string) => dia.format(new Date(instante));

const TIPOS_DE_MARCO = new Set(['resposta_oficial_recebida', 'promessa_registrada']);

/** Resposta oficial, promessa e a virada para `conquistada`. */
const ehMarco = (evento: Evento) =>
  TIPOS_DE_MARCO.has(evento.tipo) ||
  (evento.tipo === 'status_alterado' && evento.dados.para === 'conquistada');

/** Eventos públicos na ordem em que a API manda (cronológica crescente). */
export function LinhaDoTempo({
  eventos,
  destacar = false,
}: {
  eventos: PautaDetalhe['linha_do_tempo'];
  /** Na pauta conquistada, a resposta, a promessa e a conquista saem em destaque. */
  destacar?: boolean;
}) {
  // Entradas e saídas de responsável iguais seguidas viram uma linha (SCRUM-355).
  const grupos = agruparEventosIguais(eventos, (e) => e.criado_em);
  return (
    <section className={estilos.secao} aria-labelledby="linha-titulo">
      <h2 id="linha-titulo" className={estilos.secaoTitulo}>
        Linha do tempo
      </h2>
      {eventos.length === 0 ? (
        <p className={estilos.vazio}>Ainda não tem acontecimento registrado.</p>
      ) : (
        <ol className={estilos.tempo}>
          {grupos.map(({ evento, quantidade }, i) => (
            <li key={i} className={destacar && ehMarco(evento) ? estilos.tempoMarco : undefined}>
              <span
                className={i === grupos.length - 1 ? estilos.marcoAtual : estilos.marco}
                aria-hidden="true"
              >
                {i === grupos.length - 1 ? '•' : '✓'}
              </span>
              <div>
                <p className={estilos.texto}>{textoDoEvento(evento, eventos, quantidade)}</p>
                <time dateTime={evento.criado_em} className={estilos.data}>
                  {formatarData(evento.criado_em)}
                </time>
              </div>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
