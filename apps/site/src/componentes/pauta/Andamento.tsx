import type { Evento, PautaDetalhe } from '@lumens/contratos';
import { caminhoRespondido } from './Caminhos';
import { formatarData } from './LinhaDoTempo';
import { formatarNumero } from '../BarraApoios';
import { diaEMes, diasAte, formatarDia, prazoVencido, textoDiasAte, textoDoPrazo } from './prazos';
import estilos from './pauta.module.css';

// A resposta e a promessa chegam pela linha do tempo pública: o contrato não tem campos próprios
// para elas. Hoje o catálogo da T7 só põe `data_entrega` (promessa) e `fecha_em` (conferência) no
// `dados`; `resumo` e `fonte` são lidos se um dia o evento os trouxer, e somem quando não vêm.

/** Último evento do tipo; a API manda a linha do tempo em ordem crescente. */
function ultimo(eventos: readonly Evento[], tipo: string): Evento | undefined {
  return eventos.findLast((e) => e.tipo === tipo);
}

function texto(evento: Evento | undefined, chave: string): string | undefined {
  const valor = evento?.dados[chave];
  return typeof valor === 'string' && valor.trim() !== '' ? valor : undefined;
}

/** Só http(s) vira link: `javascript:` ou lixo no campo nunca chega ao `href`. */
function urlSegura(valor: string): string | undefined {
  try {
    const url = new URL(valor);
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.href : undefined;
  } catch {
    return undefined;
  }
}

function Fonte({ fonte }: { fonte: string }) {
  const url = urlSegura(fonte);
  return (
    <p className={estilos.vazio}>
      Fonte:{' '}
      {url ? (
        <a href={url} rel="noopener noreferrer" target="_blank">
          {fonte}
        </a>
      ) : (
        fonte
      )}
    </p>
  );
}

/** Fala.BR aberto mais recentemente, como na `proxima_etapa` da view. */
function ultimoFalabr(pauta: PautaDetalhe) {
  // A API ordena por `aberto_em`: o último Fala.BR é o mais recente, mesmo ainda sem prazo.
  return pauta.caminhos.findLast((c) => c.tipo === 'falabr');
}

/** O Fala.BR mais recente consta como respondido: vale mesmo sem o evento de resposta. */
function falabrRespondido(pauta: PautaDetalhe): boolean {
  const falabr = ultimoFalabr(pauta);
  return falabr !== undefined && caminhoRespondido(falabr);
}

/**
 * Resposta oficial chegou depois que o Fala.BR mais recente foi aberto, ou o Fala.BR já consta
 * como respondido: o prazo já não importa.
 */
function respondidoDepoisDoFalabr(pauta: PautaDetalhe): boolean {
  if (falabrRespondido(pauta)) return true;
  const abertoEm = ultimoFalabr(pauta)?.aberto_em;
  const resposta = ultimo(pauta.linha_do_tempo, 'resposta_oficial_recebida');
  return (
    resposta !== undefined && (!abertoEm || Date.parse(resposta.criado_em) >= Date.parse(abertoEm))
  );
}

/** A promessa vigente: a última registrada, a remarcação posterior a ela e a data de entrega. */
function promessaVigente(pauta: PautaDetalhe) {
  const indice = pauta.linha_do_tempo.findLastIndex((e) => e.tipo === 'promessa_registrada');
  const promessa = indice >= 0 ? pauta.linha_do_tempo[indice] : undefined;
  // Só conta a remarcação da promessa vigente (posterior ao último `promessa_registrada`).
  const remarcacao =
    indice >= 0 ? ultimo(pauta.linha_do_tempo.slice(indice + 1), 'promessa_remarcada') : undefined;
  const entrega = texto(remarcacao, 'data_nova') ?? texto(promessa, 'data_entrega');
  return { promessa, remarcacao, entrega };
}

/** Etapas em que a data que importa é a da promessa, não o prazo de resposta do Fala.BR. */
const COM_PROMESSA = new Set(['prometido', 'entregue_em_parte', 'descumprida']);

/** Título da próxima etapa por status, como no protótipo. */
const TITULO_DA_ETAPA: Partial<Record<string, string>> = {
  juntando_apoios: 'Bater a meta',
  meta_batida: 'A curadoria escolhe o caminho',
  cobrando: 'Resposta oficial',
  prometido: 'Cumprimento da promessa',
  entregue_em_parte: 'Nova conferência',
  descumprida: 'Promessa vencida',
};

/** O que acontece agora com a pauta e quando. Pauta conquistada não tem próxima etapa. */
export function ProximaEtapa({
  pauta,
  agora = new Date(),
}: {
  pauta: PautaDetalhe;
  /** O "hoje" dos prazos vencidos; nos testes, uma data fixa. */
  agora?: Date;
}) {
  if (pauta.status === 'conquistada') return null;
  const falabr = respondidoDepoisDoFalabr(pauta) ? undefined : ultimoFalabr(pauta);
  const prazoDoFalabr = falabr?.prazo ?? undefined;
  const entrega = COM_PROMESSA.has(pauta.status) ? promessaVigente(pauta).entrega : undefined;
  // Prometido, entregue em parte ou descumprida: a data grande é a da promessa, como no protótipo.
  const prazo = entrega ?? prazoDoFalabr;
  const aberta = ultimo(pauta.linha_do_tempo, 'conferencia_aberta');
  const apurada = ultimo(pauta.linha_do_tempo, 'conferencia_apurada');
  const conferenciaAte =
    aberta && (!apurada || apurada.criado_em < aberta.criado_em)
      ? texto(aberta, 'fecha_em')
      : undefined;
  const conferenciaVencida =
    conferenciaAte !== undefined && Date.parse(conferenciaAte) < agora.getTime();
  const juntando = pauta.status === 'juntando_apoios';
  const faltam = Math.max(0, pauta.meta - pauta.apoios);
  const textoDaEtapa = juntando
    ? `Faltam ${formatarNumero(faltam)}. Ao bater a meta, a pauta segue para a cobrança.`
    : (pauta.proxima_etapa ?? 'A definir.');
  const dias = prazo === undefined ? null : diasAte(prazo, agora);
  const vencido = prazo !== undefined && prazoVencido(prazo, agora);
  return (
    <section
      className={[estilos.secao, estilos.proxima].join(' ')}
      aria-labelledby="proxima-titulo"
    >
      <p id="proxima-titulo" className={estilos.rotuloDaSecao}>
        Próxima etapa
      </p>
      <h2 className={estilos.secaoTitulo}>{TITULO_DA_ETAPA[pauta.status] ?? 'A definir'}</h2>
      {juntando && (
        <p className={estilos.dataGrande}>
          <b>
            {formatarNumero(pauta.apoios)} de {formatarNumero(pauta.meta)}
          </b>{' '}
          apoios
        </p>
      )}
      {prazo && dias !== null && (
        <p className={estilos.dataGrande}>
          <b className={vencido ? estilos.ruim : undefined}>
            <time dateTime={prazo}>{diaEMes(prazo)}</time>
          </b>
          {' · '}
          <span>{textoDiasAte(dias)}</span>
        </p>
      )}
      <p className={estilos.texto}>{textoDaEtapa}</p>
      {prazoDoFalabr && !pauta.proxima_etapa?.includes(formatarDia(prazoDoFalabr)) && (
        <p className={prazoVencido(prazoDoFalabr, agora) ? estilos.vencido : estilos.vazio}>
          {prazoVencido(prazoDoFalabr, agora)
            ? `Prazo de resposta do Fala.BR ${textoDoPrazo(prazoDoFalabr, agora, true)}`
            : `Prazo de resposta do Fala.BR: ${formatarDia(prazoDoFalabr)}`}
        </p>
      )}
      {prazoDoFalabr && falabr?.prorrogado && (
        <p className={estilos.vazio}>Prazo do Fala.BR prorrogado.</p>
      )}
      {conferenciaAte && (
        <p className={conferenciaVencida ? estilos.vencido : estilos.vazio}>
          {conferenciaVencida ? 'Conferência encerrada em ' : 'Conferência aberta até '}
          <time dateTime={conferenciaAte}>{formatarData(conferenciaAte)}</time>
          {conferenciaVencida ? ', aguardando a apuração' : ''}
        </p>
      )}
    </section>
  );
}

/** Resposta oficial e promessa com a data prometida; sem resposta, "aguardando" com o prazo. */
export function RespostaOficial({
  pauta,
  agora = new Date(),
}: {
  pauta: PautaDetalhe;
  /** O "hoje" dos prazos vencidos; nos testes, uma data fixa. */
  agora?: Date;
}) {
  const resposta = ultimo(pauta.linha_do_tempo, 'resposta_oficial_recebida');
  const { promessa, remarcacao, entrega } = promessaVigente(pauta);
  // Promessa registrada sem evento de resposta ainda conta como resposta recebida.
  const recebida = resposta ?? promessa;
  // O Fala.BR respondido nunca convive com "aguardando resposta", mesmo sem o evento (SCRUM-354).
  const respondidoNoFalabr = falabrRespondido(pauta);
  const conquistada = pauta.status === 'conquistada';
  // Conquistada sem resposta registrada: nada de "aguardando"; a solução entregue aparece à parte.
  if (!recebida && !respondidoNoFalabr && conquistada) return null;
  // Sem resposta, a seção some: a "Próxima etapa" já diz o que se espera e quando.
  if (!recebida && !respondidoNoFalabr) return null;
  // Promessa cumprida (pauta conquistada) não é promessa vencida.
  const entregaVencida = entrega !== undefined && !conquistada && prazoVencido(entrega, agora);
  const resumo = texto(promessa, 'resumo') ?? texto(resposta, 'resumo');
  const fonte = texto(promessa, 'fonte') ?? texto(resposta, 'fonte');
  const falabr = ultimoFalabr(pauta);
  return (
    <section className={estilos.secao} aria-labelledby="resposta-titulo">
      <h2 id="resposta-titulo" className={estilos.secaoTitulo}>
        Resposta oficial
      </h2>
      <blockquote className={estilos.resposta}>
        {resumo ??
          (recebida ? (
            <>
              Resposta recebida em{' '}
              <time dateTime={recebida.criado_em}>{formatarData(recebida.criado_em)}</time>.
            </>
          ) : (
            <>
              O Fala.BR já foi respondido
              {falabr?.protocolo ? ` (protocolo ${falabr.protocolo})` : ''}.
            </>
          ))}
        {entrega && (
          <footer>
            Promessa {remarcacao ? 'remarcada' : 'registrada'}:{' '}
            {entregaVencida ? (
              <span className={estilos.vencidoTexto}>
                entrega prometida {textoDoPrazo(entrega, agora, true)}
              </span>
            ) : (
              `entrega até ${formatarDia(entrega)}`
            )}
          </footer>
        )}
      </blockquote>
      {fonte && <Fonte fonte={fonte} />}
    </section>
  );
}
