import type { Evento, PautaDetalhe } from '@lumens/contratos';
import { formatarDia } from './Caminhos';
import { formatarData } from './LinhaDoTempo';
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

/** Prazo do Fala.BR aberto mais recentemente, como na `proxima_etapa` da view. */
function prazoFalabr(pauta: PautaDetalhe): string | undefined {
  // A API ordena por `aberto_em`: o último Fala.BR é o mais recente, mesmo ainda sem prazo.
  return pauta.caminhos.findLast((c) => c.tipo === 'falabr')?.prazo ?? undefined;
}

/** Resposta oficial chegou depois que o Fala.BR mais recente foi aberto: o prazo já não importa. */
function respondidoDepoisDoFalabr(pauta: PautaDetalhe): boolean {
  const abertoEm = pauta.caminhos.findLast((c) => c.tipo === 'falabr')?.aberto_em;
  const resposta = ultimo(pauta.linha_do_tempo, 'resposta_oficial_recebida');
  return (
    resposta !== undefined && (!abertoEm || Date.parse(resposta.criado_em) >= Date.parse(abertoEm))
  );
}

/** O que acontece agora com a pauta e quando. */
export function ProximaEtapa({ pauta }: { pauta: PautaDetalhe }) {
  const prazo = respondidoDepoisDoFalabr(pauta) ? undefined : prazoFalabr(pauta);
  const aberta = ultimo(pauta.linha_do_tempo, 'conferencia_aberta');
  const apurada = ultimo(pauta.linha_do_tempo, 'conferencia_apurada');
  const conferenciaAte =
    aberta && (!apurada || apurada.criado_em < aberta.criado_em)
      ? texto(aberta, 'fecha_em')
      : undefined;
  return (
    <section className={estilos.proxima} aria-labelledby="proxima-titulo">
      <h2 id="proxima-titulo" className={estilos.proximaTitulo}>
        Próxima etapa
      </h2>
      <p className={estilos.texto}>
        {pauta.proxima_etapa ??
          (pauta.status === 'conquistada' ? 'Pauta conquistada.' : 'A definir.')}
      </p>
      {prazo && <p className={estilos.vazio}>Prazo de resposta do Fala.BR: {formatarDia(prazo)}</p>}
      {conferenciaAte && (
        <p className={estilos.vazio}>
          Conferência aberta até{' '}
          <time dateTime={conferenciaAte}>{formatarData(conferenciaAte)}</time>
        </p>
      )}
    </section>
  );
}

/** Resposta oficial e promessa com a data prometida; sem resposta, "aguardando" com o prazo. */
export function RespostaOficial({ pauta }: { pauta: PautaDetalhe }) {
  const resposta = ultimo(pauta.linha_do_tempo, 'resposta_oficial_recebida');
  const promessa = ultimo(pauta.linha_do_tempo, 'promessa_registrada');
  // Promessa registrada sem evento de resposta ainda conta como resposta recebida.
  const recebida = resposta ?? promessa;
  const prazo = prazoFalabr(pauta);
  const entrega = texto(promessa, 'data_entrega');
  const resumo = texto(promessa, 'resumo') ?? texto(resposta, 'resumo');
  const fonte = texto(promessa, 'fonte') ?? texto(resposta, 'fonte');
  return (
    <section
      className={recebida ? [estilos.secao, estilos.resposta].join(' ') : estilos.secao}
      aria-labelledby="resposta-titulo"
    >
      <h2 id="resposta-titulo" className={estilos.secaoTitulo}>
        Resposta oficial
      </h2>
      {!recebida ? (
        <p className={estilos.texto}>
          Aguardando resposta
          {prazo ? `. Prazo: ${formatarDia(prazo)}.` : ', ainda sem prazo definido.'}
        </p>
      ) : (
        <>
          <p className={estilos.texto}>
            Recebida em{' '}
            <time dateTime={recebida.criado_em}>{formatarData(recebida.criado_em)}</time>
          </p>
          {resumo && <p className={estilos.texto}>{resumo}</p>}
          {entrega && (
            <p className={estilos.texto}>
              <strong>Promessa:</strong> entrega até {formatarDia(entrega)}
            </p>
          )}
          {fonte && <Fonte fonte={fonte} />}
        </>
      )}
    </section>
  );
}
