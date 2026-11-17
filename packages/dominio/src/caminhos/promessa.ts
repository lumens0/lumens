/**
 * Promessa oficial (RN13): a curadoria registra o resumo da resposta e a data prometida. A pauta vai
 * para `prometido`, a conferência "Foi feito?" fica agendada para a data de entrega, por 7 dias, e
 * quem apoia recebe o aviso de resposta oficial pela fila de envio (RNF06).
 *
 * Registrar a promessa é também registrar que a resposta oficial chegou (3.6, SCRUM-221): o evento
 * `resposta_oficial_recebida` vai para o caminho Fala.BR de onde ela veio, e os PDFs que o owner
 * encaminhou ficam ligados à promessa que a curadoria escreveu a partir deles.
 */
import {
  and,
  apoios,
  caminhos,
  documentosResposta,
  eq,
  estudantes,
  isNull,
  pautas,
  promessas,
  sql,
  type Tx,
} from '@lumens/db';
import { ErroDeRegra } from '../compartilhado/erros';
import { registrarEvento } from '../compartilhado/eventos';
import { enfileirarDisparos } from '../avisos/fila';
import { transicionarStatus } from '../pauta/status';

/** Mensagem modelo (SCRUM-193): título, fonte, resumo e, no botão "Ver a pauta", o slug. */
export const MODELO_RESPOSTA_OFICIAL = 'lumens_resposta_oficial';

/**
 * Teto do resumo dentro da mensagem (3.6). A Meta recusa a mensagem inteira quando o corpo passa de
 * 1024 caracteres; com o título, a fonte e o texto fixo do modelo, 400 deixa folga. O resumo
 * inteiro continua na página da pauta.
 */
export const RESUMO_NO_AVISO_MAXIMO = 400;

/** Corta em `maximo` caracteres, terminando em "…". Conta por code point: emoji não parte ao meio. */
function resumoParaOAviso(resumo: string): string {
  const caracteres = Array.from(resumo.replace(/\s+/g, ' ').trim());
  if (caracteres.length <= RESUMO_NO_AVISO_MAXIMO) return caracteres.join('');
  return `${caracteres
    .slice(0, RESUMO_NO_AVISO_MAXIMO - 1)
    .join('')
    .trimEnd()}…`;
}

/**
 * De que caminho Fala.BR veio a resposta que a curadoria está registrando (3.6, SCRUM-221).
 *
 * O PDF que o owner mandou diz: é registrado no caminho de onde ele veio. Sem PDF, só dá para
 * afirmar quando a pauta tem um único Fala.BR protocolado. Com mais de um e nenhum PDF, não há
 * como saber qual foi respondido, e marcar o errado esconderia no site o prazo de um protocolo
 * ainda sem resposta: nesse caso a linha do tempo fica só com a promessa.
 */
async function caminhosRespondidos(
  tx: Tx,
  pautaId: string,
  pdfsLidos: readonly { caminhoId: string }[],
): Promise<string[]> {
  if (pdfsLidos.length > 0) return [...new Set(pdfsLidos.map((d) => d.caminhoId))];
  const protocolados = await tx
    .select({ id: caminhos.id })
    .from(caminhos)
    .where(
      and(
        eq(caminhos.pautaId, pautaId),
        eq(caminhos.tipo, 'falabr'),
        sql`${caminhos.protocolo} is not null`,
      ),
    );
  return protocolados.length === 1 ? protocolados.map((c) => c.id) : [];
}

/**
 * Tetos do resumo e da fonte, conferidos aqui: o `maxLength` do painel não protege a chamada direta,
 * e a fonte vai inteira como parâmetro do aviso (SCRUM-313).
 */
export const RESUMO_MAXIMO = 500;
export const FONTE_MAXIMA = 120;

/**
 * Teto da data de entrega: hoje + 2 anos (SCRUM-313). Um `2062` digitado no lugar de `2026` tiraria
 * a pauta da cobrança por décadas, e o painel não edita promessa registrada.
 */
export const ANOS_ATE_A_ENTREGA_MAXIMO = 2;

/** Hoje em Maceió (UTC−3, sem horário de verão), `YYYY-MM-DD`. O painel usa no `min` da data. */
export const hojeEmMaceio = (agora = new Date()) =>
  new Date(agora.getTime() - 3 * 3_600_000).toISOString().slice(0, 10);

/**
 * Último dia aceito como data de entrega, `YYYY-MM-DD`, sempre uma data que existe: vai no `max` do
 * campo, e o navegador ignora um `max` inválido. Em 29/02 o teto é 28/02 de dois anos depois.
 */
export function dataDeEntregaMaxima(agora = new Date()): string {
  const hoje = hojeEmMaceio(agora);
  const ano = Number(hoje.slice(0, 4)) + ANOS_ATE_A_ENTREGA_MAXIMO;
  const bissexto = (ano % 4 === 0 && ano % 100 !== 0) || ano % 400 === 0;
  const diaEMes = hoje.slice(4) === '-02-29' && !bissexto ? '-02-28' : hoje.slice(4);
  return `${String(ano)}${diaEMes}`;
}

const tamanho = (texto: string) => Array.from(texto).length;

/** Janela da conferência (RN10). */
export const DIAS_DE_CONFERENCIA = 7;

const MS_POR_DIA = 86_400_000;

export interface NovaPromessa {
  pautaId: string;
  resumo: string;
  /** Dia prometido, em `YYYY-MM-DD`. A conferência abre nele. */
  dataEntrega: string;
  fonte: string;
  /** Curador que registrou. */
  registradaPor: string;
  /** Para o teto da data de entrega. Injetável para o teste. */
  agora?: Date;
}

/**
 * Início do dia em Maceió (UTC−3, sem horário de verão) como instante.
 * Lança `ErroDeRegra` para data fora do formato ou inexistente (31/02).
 */
function inicioDoDiaEmMaceio(dia: string): Date {
  const instante = new Date(`${dia}T00:00:00-03:00`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dia) || Number.isNaN(instante.getTime())) {
    throw new ErroDeRegra('data_invalida', `Data de entrega inválida: ${dia}`);
  }
  // `new Date` aceita 2026-02-31 e vira 3 de março; a volta pelo fuso confere o dia.
  const deVolta = new Date(instante.getTime() - 3 * 3_600_000).toISOString().slice(0, 10);
  if (deVolta !== dia) throw new ErroDeRegra('data_invalida', `Data de entrega inválida: ${dia}`);
  return instante;
}

/**
 * Registra a promessa e leva a pauta a `prometido`, na transação de quem chama.
 *
 * Resumo e fonte são gravados sem os espaços das pontas. Acima de `RESUMO_MAXIMO` ou `FONTE_MAXIMA`
 * (contados por code point) ou com data depois de `dataDeEntregaMaxima`, lança `ErroDeRegra` antes
 * de tudo.
 *
 * Só aceita a partir de `cobrando`, `entregue_em_parte` ou `descumprida` (via `transicionarStatus`);
 * fora disso lança `ErroDeRegra` e nada é gravado. Se ainda houver promessa ativa, ela é encerrada
 * como `substituida` antes: o banco só aceita uma ativa por pauta.
 *
 * Na mesma transação, enfileira o aviso para cada apoiador que não saiu do sistema: se a promessa
 * não for gravada, ninguém é avisado. Promessa nova depois de `descumprida` avisa de novo, porque o
 * aviso é por promessa.
 */
export async function registrarPromessa(
  tx: Tx,
  {
    pautaId,
    resumo: resumoInformado,
    dataEntrega,
    fonte: fonteInformada,
    registradaPor,
    agora = new Date(),
  }: NovaPromessa,
): Promise<{
  promessaId: string;
  conferenciaAbreEm: Date;
  conferenciaFechaEm: Date;
  avisados: number;
  /** PDFs do owner que a curadoria leu para esta resposta e que agora apontam para ela. */
  documentosLigados: number;
}> {
  // Mede o que é gravado: 500 caracteres mais espaços nas pontas não passam do teto.
  const resumo = resumoInformado.trim();
  const fonte = fonteInformada.trim();
  if (tamanho(resumo) > RESUMO_MAXIMO) {
    throw new ErroDeRegra('resumo_longo', `Resumo passa de ${String(RESUMO_MAXIMO)} caracteres`);
  }
  if (tamanho(fonte) > FONTE_MAXIMA) {
    throw new ErroDeRegra('fonte_longa', `Fonte passa de ${String(FONTE_MAXIMA)} caracteres`);
  }
  const abre = inicioDoDiaEmMaceio(dataEntrega);
  const teto = dataDeEntregaMaxima(agora);
  if (dataEntrega > teto) {
    throw new ErroDeRegra('data_distante', `Data de entrega ${dataEntrega} passa de ${teto}`);
  }
  const fecha = new Date(abre.getTime() + DIAS_DE_CONFERENCIA * MS_POR_DIA);

  // Primeiro a transição: se a pauta não pode ir para `prometido`, nada abaixo acontece.
  await transicionarStatus(tx, { pautaId, para: 'prometido', origem: 'curadoria' });

  await tx
    .update(promessas)
    .set({ resultado: 'substituida' })
    .where(and(eq(promessas.pautaId, pautaId), sql`${promessas.resultado} is null`));

  const [promessa] = await tx
    .insert(promessas)
    .values({
      pautaId,
      resumo,
      dataEntrega,
      fonte,
      registradaPor,
      conferenciaAbreEm: abre,
      conferenciaFechaEm: fecha,
    })
    .returning({ id: promessas.id });
  if (promessa === undefined) throw new Error('promessa não criada');

  // Os PDFs que ainda não serviram a nenhuma resposta são os que a curadoria acabou de ler: passam
  // a apontar para esta promessa, e dizem de que caminho veio a resposta.
  const ligados = await tx
    .update(documentosResposta)
    .set({ promessaId: promessa.id })
    .where(and(eq(documentosResposta.pautaId, pautaId), isNull(documentosResposta.promessaId)))
    .returning({ caminhoId: documentosResposta.caminhoId });

  for (const caminhoId of await caminhosRespondidos(tx, pautaId, ligados)) {
    await registrarEvento(tx, {
      pautaId,
      tipo: 'resposta_oficial_recebida',
      dados: { caminho_id: caminhoId },
      origem: 'curadoria',
    });
  }

  await registrarEvento(tx, {
    pautaId,
    tipo: 'promessa_registrada',
    // Resumo e fonte vão no evento para a página da pauta mostrar a resposta oficial (são públicos:
    // a fonte já vai no aviso aos apoiadores). Promessas anteriores não têm as chaves.
    dados: { promessa_id: promessa.id, data_entrega: dataEntrega, resumo, fonte },
    origem: 'curadoria',
  });

  const [pauta] = await tx
    .select({ titulo: pautas.titulo, slug: pautas.slug })
    .from(pautas)
    .where(eq(pautas.id, pautaId));
  if (pauta === undefined) throw new Error('pauta sumiu na transação');

  const apoiadores = await tx
    .select({ estudanteId: apoios.estudanteId })
    .from(apoios)
    .innerJoin(estudantes, eq(estudantes.id, apoios.estudanteId))
    .where(and(eq(apoios.pautaId, pautaId), isNull(estudantes.saiuEm)));

  const parametros = [pauta.titulo, fonte, resumoParaOAviso(resumo), pauta.slug];
  const avisados = await enfileirarDisparos(
    tx,
    apoiadores.map(({ estudanteId }) => ({
      tipo: 'resposta_oficial' as const,
      aviso: promessa.id,
      estudanteId,
      modelo: MODELO_RESPOSTA_OFICIAL,
      parametros,
    })),
  );

  return {
    promessaId: promessa.id,
    conferenciaAbreEm: abre,
    conferenciaFechaEm: fecha,
    avisados,
    documentosLigados: ligados.length,
  };
}
