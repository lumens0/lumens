/**
 * RNF06 · Fila persistida dos avisos que o bot inicia (SCRUM-202).
 *
 * Porta de escrita da tabela `disparo`. A política — quem sai agora, quem
 * espera — continua em `envio.ts`; aqui ela ganha memória: o que já saiu, quem
 * já foi alcançado nas últimas 24h e quem recebeu de fato.
 *
 * O ciclo de quem envia é:
 *
 *   1. `reservarLote` numa transação curta: escolhe o lote e marca a reserva.
 *   2. Para cada disparo, chama a Meta fora da transação.
 *   3. `registrarEnvio` quando a Meta aceita, ou `registrarFalha` quando ela
 *      recusa de vez. Erro passageiro (rede, 5xx) não registra nada: a reserva
 *      vence e o disparo volta sozinho.
 *   4. `registrarEntrega` quando o webhook confirma a entrega.
 *
 * Se o processo cai entre 1 e 3, a reserva vence em `RESERVA_EXPIRA_MS` e o
 * disparo volta ao próximo lote. Isso pode reenviar quem a Meta já tinha
 * aceitado no instante da queda — e é de propósito: aviso repetido incomoda,
 * mas conferência que não chegou tira o voto de alguém (RN10).
 *
 * O aviso sai pelo Telegram para quem tem um chat ligado ao telefone
 * (`chat_telegram`, SCRUM-267), quando o Telegram está configurado; senão, pelo
 * WhatsApp. O limite de 24h é da Meta: só o que sai pelo WhatsApp gasta e conta
 * vaga. O do Telegram sai sem cota, na mesma ordem de prioridade.
 */
import {
  and,
  chatsTelegram,
  disparos,
  eq,
  estudantes,
  gt,
  inArray,
  isNull,
  lt,
  or,
  sql,
  type Canal,
  type Tx,
} from '@lumens/db';
import { planejarEnvio, type Disparo, type TipoDisparo } from './envio';

/** Quanto tempo uma reserva segura o disparo antes de ele voltar para a fila. */
export const RESERVA_EXPIRA_MS = 10 * 60_000;

/** A janela móvel em que a Meta conta pessoas distintas. */
const JANELA_META_MS = 24 * 60 * 60_000;

/**
 * Chave do lock que serializa quem monta lote. Sem ele, dois processos lendo a
 * fila ao mesmo tempo veriam o mesmo limite livre e, juntos, passariam dele.
 */
const LOCK_DA_FILA = 202;

/**
 * Quanto tempo um aviso pode esperar na fila antes de perder o sentido. Meta batida de duas
 * semanas atrás, ou "Foi feito?" de uma conferência que já fechou, só confundem quem recebe.
 *
 * Não vale para `lembrete`: o aviso de owner inativo tem que sair, porque é ele que autoriza a
 * remoção (SCRUM-239), e o de prazo já deixa de ser enfileirado quando o prazo passa.
 */
export const VALIDADE_DO_AVISO_MS = 7 * 24 * 60 * 60_000;

export interface NovoAviso {
  tipo: TipoDisparo;
  /** Id do que o aviso comunica: pauta, promessa ou caminho. */
  aviso: string;
  estudanteId: string;
  /** Nome da mensagem modelo aprovada pela Meta. */
  modelo: string;
  /** Valores das variáveis do modelo, na ordem. Só dado público da pauta. */
  parametros: readonly string[];
}

export interface DisparoReservado {
  id: string;
  tipo: TipoDisparo;
  aviso: string;
  estudanteId: string;
  modelo: string;
  parametros: string[];
  /** Por onde o aviso sai: o Telegram, se o estudante tem chat ligado e o canal está pedido. */
  canal: Canal;
  /**
   * Destino, cifrado com a CHAVE_CIFRA: o telefone (WhatsApp) ou o chat id (Telegram). Só quem
   * envia decifra.
   */
  telefoneCifrado: string;
  /**
   * Instante da reserva: é a prova de posse. Quem envia passa este valor a `renovarReserva` antes
   * de cada envio; se outra instância tiver pegado o disparo, o valor no banco já é outro.
   */
  reservadoEm: Date;
}

/**
 * Põe avisos na fila. Devolve quantos entraram de fato.
 *
 * O mesmo aviso para a mesma pessoa entra uma vez só, mesmo que a rotina rode
 * de novo ou que duas rotinas enfileirem juntas: quem garante é o índice único
 * do banco, não uma leitura antes da escrita. Isso vale também para aviso que
 * já saiu ou falhou — enfileirar de novo não reenvia.
 */
export async function enfileirarDisparos(
  tx: Tx,
  avisos: readonly NovoAviso[],
  agora: Date = new Date(),
): Promise<number> {
  if (avisos.length === 0) return 0;

  const inseridos = await tx
    .insert(disparos)
    .values(
      avisos.map((a) => ({
        tipo: a.tipo,
        aviso: a.aviso,
        estudanteId: a.estudanteId,
        modelo: a.modelo,
        // A Meta recusa parâmetro com quebra de linha, tab ou espaços em sequência, e o título da
        // pauta e o motivo da recusa vêm digitados por gente.
        parametros: a.parametros.map((p) => p.replace(/\s+/g, ' ').trim()),
        enfileiradoEm: agora,
      })),
    )
    .onConflictDoNothing({ target: [disparos.tipo, disparos.aviso, disparos.estudanteId] })
    .returning({ id: disparos.id });

  return inseridos.length;
}

export interface ParametrosDeLote {
  /** Pessoas distintas por 24h móveis que a Meta permite hoje ao portfólio. */
  limite: number;
  /** Injetável para teste; o padrão é agora. */
  agora?: Date;
  /**
   * Canais que têm quem envie neste processo. Sem o Telegram, quem tem chat recebe pelo
   * WhatsApp; sem o WhatsApp, quem não tem chat nem é reservado: fica pendente, sem ocupar vaga,
   * até o canal ser configurado. O padrão é todos.
   */
  canais?: readonly Canal[];
}

const TODOS_OS_CANAIS: readonly Canal[] = ['whatsapp', 'telegram'];

/**
 * Escolhe o próximo lote e o reserva. Devolve os disparos já na ordem de envio.
 *
 * Quem já foi alcançado nas últimas 24h é quem tem reserva OU envio nesse
 * período. A reserva conta porque é ela que impede o próximo lote de prometer
 * a mesma vaga enquanto o envio está em andamento. O envio conta porque é dele
 * que a Meta mede as 24h, e ele acontece depois da reserva: contar só a
 * reserva liberaria a vaga minutos antes da hora. O erro, quando há, é para o
 * lado seguro: uma reserva que falhou ainda ocupa a vaga até as 24h passarem.
 *
 * Só o WhatsApp tem esse limite. O canal de cada disparo é decidido aqui e
 * gravado na reserva (`disparo.canal`): o que saiu pelo Telegram não conta como
 * alcançado nem gasta vaga, e sai inteiro no lote, depois dos do WhatsApp, em
 * ordem de prioridade. Contar pelo canal gravado, e não pelo chat de hoje, mantém
 * a conta certa quando a pessoa liga ou perde o chat do Telegram dentro das 24h.
 *
 * Precisa rodar dentro de uma transação: o lock é liberado no commit.
 */
export async function reservarLote(
  tx: Tx,
  { limite, agora = new Date(), canais = TODOS_OS_CANAIS }: ParametrosDeLote,
): Promise<DisparoReservado[]> {
  if (canais.length === 0) return [];
  await tx.execute(sql`SELECT pg_advisory_xact_lock(${LOCK_DA_FILA})`);

  const inicioDaJanela = new Date(agora.getTime() - JANELA_META_MS);
  const reservaVencida = new Date(agora.getTime() - RESERVA_EXPIRA_MS);
  const pendente = and(isNull(disparos.enviadoEm), isNull(disparos.falhouEm));

  // Antes de planejar, tira da fila o que não vai mais sair: não gasta vaga com quem saiu do
  // sistema nem com aviso que perdeu o sentido. Fica registrado com o motivo.
  await tx
    .update(disparos)
    .set({ falhouEm: agora, falha: 'estudante_saiu' })
    .where(
      and(
        pendente,
        sql`${disparos.estudanteId} in (select ${estudantes.id} from ${estudantes}
          where ${estudantes.saiuEm} is not null)`,
      ),
    );
  await tx
    .update(disparos)
    .set({ falhouEm: agora, falha: 'expirado' })
    .where(
      and(
        pendente,
        sql`${disparos.tipo} <> 'lembrete'`,
        lt(disparos.enfileiradoEm, new Date(agora.getTime() - VALIDADE_DO_AVISO_MS)),
      ),
    );

  // Só o que saiu (ou vai sair) pelo WhatsApp ocupa vaga da Meta. Sem canal: de antes do Telegram.
  const alcancados = await tx
    .selectDistinct({ estudanteId: disparos.estudanteId })
    .from(disparos)
    .where(
      and(
        or(isNull(disparos.canal), eq(disparos.canal, 'whatsapp')),
        or(gt(disparos.reservadoEm, inicioDaJanela), gt(disparos.enviadoEm, inicioDaJanela)),
      ),
    );

  const peloTelegram = canais.includes('telegram');
  const peloWhatsapp = canais.includes('whatsapp');

  const pendentes = await tx
    .select({
      id: disparos.id,
      tipo: disparos.tipo,
      aviso: disparos.aviso,
      estudanteId: disparos.estudanteId,
      modelo: disparos.modelo,
      parametros: disparos.parametros,
      enfileiradoEm: disparos.enfileiradoEm,
      telefoneCifrado: estudantes.telefoneCifrado,
      chatCifrado: chatsTelegram.chatCifrado,
    })
    .from(disparos)
    .innerJoin(estudantes, eq(estudantes.id, disparos.estudanteId))
    .leftJoin(chatsTelegram, eq(chatsTelegram.telefoneHmac, estudantes.telefoneHmac))
    .where(
      and(pendente, or(isNull(disparos.reservadoEm), lt(disparos.reservadoEm, reservaVencida))),
    );

  // Telegram quando há chat e quem envie por ele; senão, WhatsApp, se houver quem envie. Sem
  // nenhum dos dois, o disparo nem é reservado: fica pendente até o canal ser configurado.
  type ComCanal = (typeof pendentes)[number] & { canal: Canal; destinoCifrado: string };
  const comCanal = pendentes.flatMap((p): ComCanal[] => {
    if (peloTelegram && p.chatCifrado !== null) {
      return [{ ...p, canal: 'telegram', destinoCifrado: p.chatCifrado }];
    }
    return peloWhatsapp ? [{ ...p, canal: 'whatsapp', destinoCifrado: p.telefoneCifrado }] : [];
  });

  const porId = new Map(comCanal.map((p) => [p.id, p]));
  const paraPlano = (p: (typeof comCanal)[number]): Disparo => ({
    id: p.id,
    tipo: p.tipo,
    aviso: p.aviso,
    destinatario: p.estudanteId,
    enfileiradoEm: p.enfileiradoEm,
  });
  const doWhatsapp = comCanal.filter((p) => p.canal === 'whatsapp').map(paraPlano);
  const semCota = comCanal.filter((p) => p.canal !== 'whatsapp').map(paraPlano);
  const plano = planejarEnvio({
    pendentes: doWhatsapp,
    limite,
    alcancados: new Set(alcancados.map((a) => a.estudanteId)),
  });
  // Mesma política (duplicatas, prioridade, desempate), com um limite que cabe todo mundo.
  const planoSemCota = planejarEnvio({
    pendentes: semCota,
    limite: semCota.length,
    alcancados: new Set(),
  });

  const idsDoWhatsapp = plano.enviarAgora.map((d) => d.id);
  const idsDoTelegram = planoSemCota.enviarAgora.map((d) => d.id);
  const ids = [...idsDoWhatsapp, ...idsDoTelegram];
  if (ids.length === 0) return [];

  for (const [canal, grupo] of [
    ['whatsapp', idsDoWhatsapp],
    ['telegram', idsDoTelegram],
  ] as const) {
    if (grupo.length === 0) continue;
    await tx
      .update(disparos)
      .set({ reservadoEm: agora, canal })
      .where(inArray(disparos.id, [...grupo]));
  }

  return ids.map((id) => {
    const linha = porId.get(id);
    if (linha === undefined) throw new Error(`disparo ${id} sumiu do lote`);
    return {
      id: linha.id,
      tipo: linha.tipo,
      aviso: linha.aviso,
      estudanteId: linha.estudanteId,
      modelo: linha.modelo,
      parametros: linha.parametros,
      canal: linha.canal,
      telefoneCifrado: linha.destinoCifrado,
      reservadoEm: agora,
    };
  });
}

/**
 * Renova a reserva logo antes de enviar, se ela ainda for de quem pergunta. Devolve o novo
 * instante da reserva (a nova prova de posse) ou `null` quando o disparo não é mais desta
 * instância: a reserva venceu e outra o pegou, ou ele já saiu ou falhou.
 *
 * Um lote grande, mandado um por um, pode levar mais que `RESERVA_EXPIRA_MS`. Sem renovar, outra
 * instância pegaria o fim do lote enquanto esta ainda o manda, e a pessoa receberia duas vezes.
 * Renovando antes de cada envio, cada disparo fica dez minutos seguro a partir do seu próprio
 * envio, que leva segundos.
 */
export async function renovarReserva(
  tx: Tx,
  { id, reservadoEm, agora = new Date() }: { id: string; reservadoEm: Date; agora?: Date },
): Promise<Date | null> {
  const renovados = await tx
    .update(disparos)
    .set({ reservadoEm: agora })
    .where(
      and(
        eq(disparos.id, id),
        eq(disparos.reservadoEm, reservadoEm),
        isNull(disparos.enviadoEm),
        isNull(disparos.falhouEm),
      ),
    )
    .returning({ reservadoEm: disparos.reservadoEm });
  return renovados[0]?.reservadoEm ?? null;
}

/**
 * A Meta aceitou o envio. Devolve `false` se o disparo já estava registrado
 * como enviado — chamar de novo não troca o wamid nem o instante.
 */
export async function registrarEnvio(
  tx: Tx,
  { id, wamidHmac, agora = new Date() }: { id: string; wamidHmac: string; agora?: Date },
): Promise<boolean> {
  const atualizados = await tx
    .update(disparos)
    .set({ enviadoEm: agora, wamidHmac })
    .where(and(eq(disparos.id, id), isNull(disparos.enviadoEm)))
    .returning({ id: disparos.id });
  return atualizados.length > 0;
}

/**
 * O webhook confirmou a entrega (status `delivered` ou `read`). É o registro
 * que a curadoria usa como prova de que a pessoa foi avisada.
 *
 * No Telegram não há webhook de entrega: quem envia grava a entrega junto com
 * o envio, no instante em que o `sendMessage` deu certo (veja o worker de envio).
 *
 * Devolve `false` quando não há disparo com esse wamid ainda sem entrega. O
 * status da Meta pode chegar antes de `registrarEnvio` confirmar; quem chama
 * deve tentar de novo mais tarde em vez de descartar.
 */
export async function registrarEntrega(
  tx: Tx,
  { wamidHmac, agora = new Date() }: { wamidHmac: string; agora?: Date },
): Promise<boolean> {
  const atualizados = await tx
    .update(disparos)
    .set({ entregueEm: agora })
    .where(and(eq(disparos.wamidHmac, wamidHmac), isNull(disparos.entregueEm)))
    .returning({ id: disparos.id });
  return atualizados.length > 0;
}

/**
 * A Meta recusou de vez (número sem WhatsApp, modelo pausado, pessoa bloqueou).
 * O disparo sai da fila e fica registrado com o motivo. Erro passageiro não
 * deve chegar aqui: deixe a reserva vencer.
 */
export async function registrarFalha(
  tx: Tx,
  { id, motivo, agora = new Date() }: { id: string; motivo: string; agora?: Date },
): Promise<boolean> {
  const atualizados = await tx
    .update(disparos)
    .set({ falhouEm: agora, falha: motivo })
    .where(and(eq(disparos.id, id), isNull(disparos.enviadoEm), isNull(disparos.falhouEm)))
    .returning({ id: disparos.id });
  return atualizados.length > 0;
}

/**
 * A Meta aceitou o envio, mas avisou depois pelo webhook que não conseguiu entregar (status
 * `failed`). O disparo continua com `enviado_em`, porque saiu, e ganha a falha: o registro de
 * entrega fica honesto e a curadoria vê quem não recebeu.
 *
 * Devolve `false` quando o wamid não é de um disparo ou ele já tinha entrega ou falha.
 */
export async function registrarFalhaDeEntrega(
  tx: Tx,
  { wamidHmac, motivo, agora = new Date() }: { wamidHmac: string; motivo: string; agora?: Date },
): Promise<boolean> {
  const atualizados = await tx
    .update(disparos)
    .set({ falhouEm: agora, falha: motivo })
    .where(
      and(
        eq(disparos.wamidHmac, wamidHmac),
        isNull(disparos.entregueEm),
        isNull(disparos.falhouEm),
      ),
    )
    .returning({ id: disparos.id });
  return atualizados.length > 0;
}
