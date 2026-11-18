import type { Evento, PautaDetalhe } from '@lumens/contratos';
import { caminhoRespondido } from './Caminhos';
import { formatarData } from './LinhaDoTempo';
import { formatarDia, prazoVencido, textoDoPrazo } from './prazos';
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

/** Prazo do Fala.BR aberto mais recentemente, como na `proxima_etapa` da view. */
function prazoFalabr(pauta: PautaDetalhe): string | undefined {
  return ultimoFalabr(pauta)?.prazo ?? undefined;
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
  const prazo = falabr?.prazo ?? undefined;
  const aberta = ultimo(pauta.linha_do_tempo, 'conferencia_aberta');
  const apurada = ultimo(pauta.linha_do_tempo, 'conferencia_apurada');
  const conferenciaAte =
    aberta && (!apurada || apurada.criado_em < aberta.criado_em)
      ? texto(aberta, 'fecha_em')
      : undefined;
  const conferenciaVencida =
    conferenciaAte !== undefined && Date.parse(conferenciaAte) < agora.getTime();
  return (
    <section className={estilos.proxima} aria-labelledby="proxima-titulo">
      <h2 id="proxima-titulo" className={estilos.proximaTitulo}>
        Próxima etapa
      </h2>
      <p className={estilos.texto}>{pauta.proxima_etapa ?? 'A definir.'}</p>
      {prazo && !pauta.proxima_etapa?.includes(formatarDia(prazo)) && (
        <p className={prazoVencido(prazo, agora) ? estilos.vencido : estilos.vazio}>
          {prazoVencido(prazo, agora)
            ? `Prazo de resposta do Fala.BR ${textoDoPrazo(prazo, agora, true)}`
            : `Prazo de resposta do Fala.BR: ${formatarDia(prazo)}`}
        </p>
      )}
      {prazo && falabr?.prorrogado && <p className={estilos.vazio}>Prazo do Fala.BR prorrogado.</p>}
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
  const indicePromessa = pauta.linha_do_tempo.findLastIndex(
    (e) => e.tipo === 'promessa_registrada',
  );
  const promessa = indicePromessa >= 0 ? pauta.linha_do_tempo[indicePromessa] : undefined;
  // Só conta a remarcação da promessa vigente (posterior ao último `promessa_registrada`).
  const remarcacao =
    indicePromessa >= 0
      ? ultimo(pauta.linha_do_tempo.slice(indicePromessa + 1), 'promessa_remarcada')
      : undefined;
  // Promessa registrada sem evento de resposta ainda conta como resposta recebida.
  const recebida = resposta ?? promessa;
  // O Fala.BR respondido nunca convive com "aguardando resposta", mesmo sem o evento (SCRUM-354).
  const respondidoNoFalabr = falabrRespondido(pauta);
  const conquistada = pauta.status === 'conquistada';
  // Conquistada sem resposta registrada: nada de "aguardando"; a solução entregue aparece à parte.
  if (!recebida && !respondidoNoFalabr && conquistada) return null;
  const prazo = prazoFalabr(pauta);
  const entrega = texto(remarcacao, 'data_nova') ?? texto(promessa, 'data_entrega');
  // Promessa cumprida (pauta conquistada) não é promessa vencida.
  const entregaVencida = entrega !== undefined && !conquistada && prazoVencido(entrega, agora);
  const resumo = texto(promessa, 'resumo') ?? texto(resposta, 'resumo');
  const fonte = texto(promessa, 'fonte') ?? texto(resposta, 'fonte');
  const falabr = ultimoFalabr(pauta);
  return (
    <section
      className={
        recebida || respondidoNoFalabr ? [estilos.secao, estilos.resposta].join(' ') : estilos.secao
      }
      aria-labelledby="resposta-titulo"
    >
      <h2 id="resposta-titulo" className={estilos.secaoTitulo}>
        Resposta oficial
      </h2>
      {!recebida && !respondidoNoFalabr && (
        <p className={estilos.texto}>
          Aguardando resposta
          {prazo
            ? prazoVencido(prazo, agora)
              ? `. Prazo ${textoDoPrazo(prazo, agora, true)}.`
              : `. Prazo: ${formatarDia(prazo)}.`
            : ', ainda sem prazo definido.'}
        </p>
      )}
      {!recebida && respondidoNoFalabr && (
        <p className={estilos.texto}>
          O Fala.BR já foi respondido
          {falabr?.protocolo ? ` (protocolo ${falabr.protocolo})` : ''}.
        </p>
      )}
      {recebida && (
        <p className={estilos.texto}>
          Recebida em <time dateTime={recebida.criado_em}>{formatarData(recebida.criado_em)}</time>
        </p>
      )}
      {resumo && <p className={estilos.texto}>{resumo}</p>}
      {entrega && (
        <p className={estilos.texto}>
          <strong>Promessa{remarcacao ? ' remarcada' : ''}:</strong>{' '}
          {entregaVencida ? (
            <span className={estilos.vencidoTexto}>
              entrega prometida {textoDoPrazo(entrega, agora, true)}
            </span>
          ) : (
            `entrega até ${formatarDia(entrega)}`
          )}
        </p>
      )}
      {fonte && <Fonte fonte={fonte} />}
    </section>
  );
}
