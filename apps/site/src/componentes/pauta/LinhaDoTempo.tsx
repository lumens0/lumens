import type { PautaDetalhe } from '@lumens/contratos';
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

/**
 * SCRUM-345: quem entra ou sai aparece pelo papel ("Corresponsável saiu"). Papel ausente ou
 * desconhecido cai no rótulo genérico. O agendador grava `motivo: 'inatividade'` nos dados (eventos
 * novos; os antigos aparecem como "saiu").
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
  const comMaiuscula = `${papel.charAt(0).toUpperCase()}${papel.slice(1)}`;
  if (tipo === 'owner_entrou') return `Novo ${papel}`;
  return dados.motivo === 'inatividade'
    ? `${comMaiuscula} removido por inatividade`
    : `${comMaiuscula} saiu`;
}

function textoDoEvento(tipo: string, dados: Record<string, unknown>): string {
  const doPapel = rotuloDoPapel(tipo, dados);
  if (doPapel !== undefined) return doPapel;
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
        <ol className={estilos.tempo}>
          {eventos.map((evento, i) => (
            <li key={i}>
              <span
                className={i === eventos.length - 1 ? estilos.marcoAtual : estilos.marco}
                aria-hidden="true"
              >
                {i === eventos.length - 1 ? '•' : '✓'}
              </span>
              <div>
                <p className={estilos.texto}>{textoDoEvento(evento.tipo, evento.dados)}</p>
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
