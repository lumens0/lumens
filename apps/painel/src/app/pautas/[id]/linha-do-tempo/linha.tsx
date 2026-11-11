import type { EventoDaLinha, OrigemEvento, TipoEvento } from '@lumens/dominio';
import Link from 'next/link';
import { dataHora } from '../../../prazo';
import { STATUS } from '../pauta';
import estilos from './linha.module.css';

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

const ORIGEM: Record<OrigemEvento, string> = {
  bot: 'Bot do WhatsApp',
  curadoria: 'Curadoria',
  agendador: 'Automático',
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
    case 'meta_batida':
      return `${texto(dados.apoios)} apoios, para uma meta de ${texto(dados.meta)}.`;
    case 'caminho_aberto':
      return `Caminho: ${nomeado(CAMINHO, dados.tipo)}.`;
    case 'protocolo_registrado':
      return `Protocolo ${texto(dados.protocolo)}.`;
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
      return `Papel: ${texto(dados.papel)}.`;
    default:
      // Tipo do catálogo sem detalhe não mostra nada; tipo desconhecido mostra o `dados` cru,
      // para a curadoria não perder informação.
      if (tipo in ROTULOS || Object.keys(dados).length === 0) return undefined;
      return JSON.stringify(dados);
  }
}

/** Vai dentro da `Moldura`, que já traz o cabeçalho e o `<main>`. */
export function LinhaDoTempo({
  pautaId,
  titulo,
  eventos,
}: {
  pautaId: string;
  titulo: string;
  eventos: EventoDaLinha[];
}) {
  return (
    <>
      <Link className={estilos.voltar} href={`/pautas/${pautaId}`}>
        ← Voltar para a pauta
      </Link>
      <h1 className={estilos.titulo}>Linha do tempo</h1>
      <p className={estilos.pauta}>{titulo}</p>
      <p className={estilos.apoio}>
        Tudo o que aconteceu com a pauta, do mais antigo para o mais novo, inclusive o que não
        aparece no site. O registro é permanente: nenhum evento pode ser editado ou apagado.
      </p>

      {eventos.length === 0 ? (
        <p className={estilos.vazio}>Esta pauta ainda não tem nenhum evento registrado.</p>
      ) : (
        <ol className={estilos.lista}>
          {eventos.map((evento) => {
            const detalhe = detalheDoEvento(evento.tipo, evento.dados);
            return (
              <li key={evento.id} className={estilos.evento}>
                <time dateTime={evento.criadoEm.toISOString()} className={estilos.data}>
                  {dataHora(evento.criadoEm)}
                </time>
                <div>
                  <h2 className={estilos.rotulo}>{rotuloEvento(evento.tipo)}</h2>
                  {detalhe !== undefined && <p className={estilos.detalhe}>{detalhe}</p>}
                  <p className={estilos.marcas}>
                    <span className={estilos.marca}>Origem: {ORIGEM[evento.origem]}</span>
                    <span className={evento.publico ? estilos.marca : estilos.marcaInterna}>
                      {evento.publico ? 'Aparece no site' : 'Só a curadoria vê'}
                    </span>
                  </p>
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </>
  );
}
