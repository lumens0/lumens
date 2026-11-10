import type { PautaDetalhe } from '@lumens/contratos';
import estilos from './pauta.module.css';

// Rótulos dos tipos públicos do catálogo da T7 (docs/esquema.md). Manter em sincronia com
// TIPOS_EVENTO/PUBLICO de packages/dominio/src/eventos.ts, a fonte do catálogo.
const ROTULOS: Record<string, string> = {
  pauta_aprovada: 'Pauta aprovada',
  meta_batida: 'Meta de apoios batida',
  caminho_aberto: 'Caminho aberto',
  protocolo_registrado: 'Protocolo registrado',
  proposta_publicada: 'Proposta publicada',
  proposta_executada: 'Proposta executada',
  resposta_oficial_recebida: 'Resposta oficial recebida',
  promessa_registrada: 'Promessa registrada',
  conferencia_aberta: 'Conferência aberta',
  conferencia_apurada: 'Conferência apurada',
  status_alterado: 'Status alterado',
  owner_entrou: 'Novo owner',
  owner_removido: 'Owner saiu',
  relato_aprovado: 'Relato publicado',
};

/** Tipo fora do catálogo não quebra a página: vira texto legível. */
export function rotuloEvento(tipo: string): string {
  return ROTULOS[tipo] ?? tipo.replaceAll('_', ' ');
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

/** Eventos públicos na ordem em que a API manda (cronológica crescente). */
export function LinhaDoTempo({ eventos }: { eventos: PautaDetalhe['linha_do_tempo'] }) {
  return (
    <section className={estilos.secao} aria-labelledby="linha-titulo">
      <h2 id="linha-titulo" className={estilos.secaoTitulo}>
        Linha do tempo
      </h2>
      {eventos.length === 0 ? (
        <p className={estilos.vazio}>Ainda não tem acontecimento registrado.</p>
      ) : (
        <ol className={estilos.lista}>
          {eventos.map((evento, i) => (
            <li key={i} className={estilos.evento}>
              <time dateTime={evento.criado_em} className={estilos.data}>
                {formatarData(evento.criado_em)}
              </time>
              <span>{rotuloEvento(evento.tipo)}</span>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
