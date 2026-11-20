import {
  agruparEventosIguais,
  type EventoDaLinha,
  rotuloDeResponsaveis,
  type OrigemEvento,
  type TipoEvento,
} from '@lumens/dominio';
import Link from 'next/link';
import { dataHora, diaCurto } from '../../../prazo';
import { STATUS } from '../../status';
import estilos from '../../../painel.module.css';

// Tela da linha do tempo da pauta para a curadoria (5.5, SCRUM-181, RF-C05, RN11). Só leitura:
// aqui não entra formulário, botão nem ação de servidor. O banco recusa UPDATE e DELETE em `evento`.

// `Record<TipoEvento, …>`: tipo novo no catálogo do domínio sem rótulo aqui quebra o typecheck.
const ROTULOS: Record<TipoEvento, string> = {
  pauta_criada: 'Pauta criada',
  pauta_aprovada: 'Pauta aprovada',
  pauta_recusada: 'Pauta recusada',
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
  pauta_urgente: 'Urgência da pauta alterada',
  bloco_corrigido: 'Bloco corrigido pela curadoria',
  meta_ajustada: 'Meta ajustada pela curadoria',
  categoria_alterada: 'Categoria alterada',
  pauta_editada: 'Texto da pauta editado pelo autor',
  conquista_atualizada: 'Card de conquista atualizado',
};

const ORIGEM: Record<OrigemEvento, string> = {
  bot: 'Bot',
  curadoria: 'Curadoria',
  agendador: 'Sistema',
};

const CAMINHO: Record<string, string> = {
  falabr: 'Fala.BR',
  comunidade: 'Comunidade',
  representante: 'Representante',
};

const RESULTADO: Record<string, string> = {
  conquistada: 'conquistada',
  entregue_em_parte: 'entregue em parte',
  descumprida: 'descumprida',
  sem_quorum: 'sem quórum',
};

/** Tipo fora do catálogo não quebra a tela: vira texto legível. */
export function rotuloEvento(tipo: string): string {
  return (ROTULOS as Record<string, string | undefined>)[tipo] ?? tipo.replaceAll('_', ' ');
}

// `dados` é JSON vindo do banco: nada garante o formato de um evento antigo. Valor que não é
// texto nem número vira "?" em vez de derrubar a tela.
function texto(valor: unknown): string {
  if (typeof valor === 'string') return valor;
  return typeof valor === 'number' ? String(valor) : '?';
}

function bloco(valor: unknown): string {
  return valor === null ? 'Todo o campus' : texto(valor);
}

const nomeado = (nomes: Record<string, string>, valor: unknown) =>
  typeof valor === 'string' ? (nomes[valor] ?? valor) : '?';

/** `2026-12-01` → `01/12/2026`. Data civil: não passa por fuso. */
function dataCivil(valor: unknown): string {
  const partes = typeof valor === 'string' ? /^(\d{4})-(\d{2})-(\d{2})$/.exec(valor) : null;
  return partes ? `${String(partes[3])}/${String(partes[2])}/${String(partes[1])}` : texto(valor);
}

function instante(valor: unknown): string {
  const data = typeof valor === 'string' ? new Date(valor) : undefined;
  return data && !Number.isNaN(data.getTime()) ? dataHora(data) : texto(valor);
}

/** O que o `dados` do evento diz, em frase. Sem nada a acrescentar ao rótulo, `undefined`. */
export function detalheDoEvento(tipo: string, dados: Record<string, unknown>): string | undefined {
  switch (tipo) {
    case 'status_alterado':
      return `De “${nomeado(STATUS, dados.de)}” para “${nomeado(STATUS, dados.para)}”.`;
    case 'pauta_urgente':
      return dados.urgente === true
        ? 'Marcada como urgente pela curadoria.'
        : 'Deixou de ser urgente.';
    case 'meta_batida':
      return `${texto(dados.apoios)} apoios, para uma meta de ${texto(dados.meta)}.`;
    case 'meta_ajustada':
      return `De ${texto(dados.metaAntes)} para ${texto(dados.metaDepois)} apoios. Motivo: ${texto(dados.motivo)}`;
    case 'bloco_corrigido':
      return `${bloco(dados.blocoAntes)} → ${bloco(dados.blocoDepois)}.`;
    case 'pauta_editada':
      return `${dados.campo === 'titulo' ? 'Título' : 'Descrição'}. Antes: “${texto(dados.antes)}” Depois: “${texto(dados.depois)}”`;
    case 'conquista_atualizada':
      return `${dados.texto === true ? 'Com texto' : 'Sem texto'} · ${dados.foto === true ? 'com foto' : 'sem foto'}.`;
    case 'caminho_aberto':
      return `Caminho: ${nomeado(CAMINHO, dados.tipo)}.`;
    case 'protocolo_registrado':
      return `Protocolo ${texto(dados.protocolo)}.`;
    case 'prazo_prorrogado':
      return `Prazo de ${dataCivil(dados.data_antiga)} para ${dataCivil(dados.data_nova)}. Motivo: ${texto(dados.motivo)} · Fonte: ${texto(dados.fonte)}`;
    case 'protocolo_corrigido':
    case 'promessa_remarcada':
      return `Data de ${dataCivil(dados.data_antiga)} para ${dataCivil(dados.data_nova)}. Motivo: ${texto(dados.motivo)} · Fonte: ${texto(dados.fonte)}`;
    case 'proposta_publicada':
      return `Precisa de ${texto(dados.pessoas_necessarias)} pessoas.`;
    case 'promessa_registrada':
      return `${texto(dados.resumo)} · Entrega prometida para ${dataCivil(dados.data_entrega)} · Fonte: ${texto(dados.fonte)}`;
    case 'conferencia_aberta':
      return `Fecha em ${instante(dados.fecha_em)}.`;
    case 'conferencia_apurada':
      return `Resultado: ${nomeado(RESULTADO, dados.resultado)}, com ${texto(dados.total_respostas)} respostas.`;
    case 'owner_entrou':
    case 'owner_removido':
      return `Papel: ${texto(dados.papel)}.${dados.motivo === 'inatividade' ? ' Removido por inatividade.' : ''}`;
    default:
      // Tipo do catálogo sem detalhe não mostra nada; tipo desconhecido mostra o `dados` cru,
      // para a curadoria não perder informação.
      if (tipo in ROTULOS || Object.keys(dados).length === 0) return undefined;
      return JSON.stringify(dados);
  }
}

/** O rótulo de um grupo de eventos iguais: "3 responsáveis saíram" no lugar de três linhas idênticas. */
export function rotuloDoGrupo(
  tipo: string,
  dados: Record<string, unknown>,
  quantidade: number,
): string {
  if (quantidade === 1) {
    return tipo === 'owner_removido' && dados.papel === 'co_owner'
      ? 'Corresponsável saiu'
      : tipo === 'owner_entrou' && dados.papel === 'co_owner'
        ? 'Novo corresponsável'
        : rotuloEvento(tipo);
  }
  return (
    rotuloDeResponsaveis(tipo, dados, quantidade) ??
    `${rotuloEvento(tipo)} (${String(quantidade)} vezes)`
  );
}

function Evento({ evento, quantidade }: { evento: EventoDaLinha; quantidade: number }) {
  const detalhe = detalheDoEvento(evento.tipo, evento.dados);
  return (
    <li>
      <time dateTime={evento.criadoEm.toISOString()} title={dataHora(evento.criadoEm)}>
        {diaCurto(evento.criadoEm)}
      </time>{' '}
      {rotuloDoGrupo(evento.tipo, evento.dados, quantidade)}
      <span className={estilos.origem}>{ORIGEM[evento.origem]}</span>
      {!evento.publico && <span className={estilos.origem}>Só a curadoria vê</span>}
      {detalhe !== undefined && <span className={estilos.detalheDoEvento}>{detalhe}</span>}
    </li>
  );
}

/** Vai dentro da `Moldura`, que já traz o cabeçalho e o `<main>`. */
export function LinhaDoTempo({
  pautaId,
  titulo,
  eventos,
  recolhivel = false,
}: {
  pautaId: string;
  titulo: string;
  eventos: EventoDaLinha[];
  recolhivel?: boolean;
  /** Mantido por compatibilidade: a linha do tempo da tela da pauta já vem sempre aberta. */
  aberta?: boolean;
}) {
  const lista =
    eventos.length === 0 ? (
      <p className={estilos.detalhes}>Esta pauta ainda não tem nenhum evento registrado.</p>
    ) : (
      <ol className={estilos.linhaDoTempo}>
        {agruparEventosIguais(eventos).map(({ evento, quantidade }) => (
          <Evento key={evento.id} evento={evento} quantidade={quantidade} />
        ))}
      </ol>
    );
  if (recolhivel) {
    return (
      <section id="linha-do-tempo" aria-labelledby="titulo-linha-do-tempo">
        <h2 id="titulo-linha-do-tempo">Linha do tempo</h2>
        {lista}
      </section>
    );
  }
  return (
    <>
      <Link className={estilos.voltar} href={`/pautas/${pautaId}`}>
        ← Voltar para a pauta
      </Link>
      <h1>Linha do tempo</h1>
      <p className={estilos.apoio}>{titulo}</p>
      <p className={estilos.detalhes}>
        Tudo o que aconteceu com a pauta, do mais antigo para o mais novo, inclusive o que não
        aparece no site. O registro é permanente: nenhum evento pode ser editado ou apagado.
      </p>
      {lista}
    </>
  );
}
