/**
 * SCRUM-400 · Quem pede o link com um e-mail que não é de curador recebe, no próprio endereço, um
 * aviso dizendo isso. A tela do pedido continua a mesma para qualquer e-mail (quem digita não
 * descobre quem é da curadoria), mas a pessoa dona da caixa de entrada fica sabendo por que não
 * chegou link: transparência sem expor a lista.
 *
 * O painel não pode virar uma máquina de mandar e-mail a terceiros, então há dois limites, na mesma
 * tabela do limite de um link por minuto (`pedido_link_login`, chave com prefixo próprio):
 *
 * - um aviso por endereço por hora;
 * - no máximo `LIMITE_GERAL_POR_HORA` avisos por hora no painel todo. A contagem e a reserva rodam
 *   numa transação com lock consultivo, então uma rajada de pedidos não passa do teto.
 */
import { and, gt, lt, lte, pedidosLinkLogin, sql, type Db } from '@lumens/db';
import { hmacDoEmail } from './acesso';

export const ESPERA_ENTRE_AVISOS_S = 60 * 60;
export const LIMITE_GERAL_POR_HORA = 30;
const PREFIXO = 'nao-curador:';
/** Chave do lock consultivo que serializa as reservas do teto geral (SCRUM-400). */
const LOCK_DOS_AVISOS = 400;

export const ASSUNTO_DO_AVISO = 'Seu e-mail não está na lista da curadoria do Lumens';

/** O texto do aviso: sem link, para não parecer um link de acesso e não servir de isca. */
export const TEXTO_DO_AVISO =
  'Alguém pediu um link de acesso ao painel de curadoria do Lumens com este endereço de e-mail, ' +
  'mas ele não está na lista da curadoria, então nenhum link foi enviado.\n\n' +
  'Se foi você, peça a quem coordena a curadoria para cadastrar este e-mail e depois peça o link ' +
  'de novo. Se não foi você, ignore esta mensagem: ninguém entrou e nada foi alterado.\n\n' +
  'Enviamos este aviso no máximo uma vez por hora para cada endereço.';

/**
 * Reserva o direito de mandar o aviso: `true` se o endereço não recebeu há menos de uma hora e o
 * painel não passou do teto da hora; grava o instante. `false` caso contrário.
 */
export async function reservarAvisoDeNaoCurador(
  db: Db,
  email: string,
  chave: Buffer,
  agora: Date = new Date(),
): Promise<boolean> {
  const umaHora = new Date(agora.getTime() - ESPERA_ENTRE_AVISOS_S * 1000);
  // O lock consultivo vale até o fim da transação e serializa quem reserva: sem ele, uma rajada de
  // pedidos para endereços diferentes leria a mesma contagem abaixo do teto e todos passariam.
  return db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(${LOCK_DOS_AVISOS})`);
    await tx
      .delete(pedidosLinkLogin)
      .where(
        and(
          sql`${pedidosLinkLogin.identificador} like ${`${PREFIXO}%`}`,
          lt(pedidosLinkLogin.ultimoEnvioEm, new Date(agora.getTime() - 24 * 3600 * 1000)),
        ),
      );
    const [recentes] = await tx
      .select({ total: sql<number>`count(*)::int` })
      .from(pedidosLinkLogin)
      .where(
        and(
          sql`${pedidosLinkLogin.identificador} like ${`${PREFIXO}%`}`,
          gt(pedidosLinkLogin.ultimoEnvioEm, umaHora),
        ),
      );
    if ((recentes?.total ?? 0) >= LIMITE_GERAL_POR_HORA) return false;
    const reservados = await tx
      .insert(pedidosLinkLogin)
      .values({ identificador: PREFIXO + hmacDoEmail(email, chave), ultimoEnvioEm: agora })
      .onConflictDoUpdate({
        target: pedidosLinkLogin.identificador,
        set: { ultimoEnvioEm: agora },
        setWhere: lte(pedidosLinkLogin.ultimoEnvioEm, umaHora),
      })
      .returning({ identificador: pedidosLinkLogin.identificador });
    return reservados.length > 0;
  });
}

export type ResultadoDoAviso = 'enviado' | 'barrado' | 'falhou';

/** Manda o aviso a quem não é curador, dentro dos limites. Nunca lança: o login não depende dele. */
export async function avisarNaoCurador(
  db: Db,
  chave: Buffer,
  email: string,
  enviar: (para: string, assunto: string, texto: string) => Promise<void>,
  registrarErro: (mensagem: string, erro: unknown) => void = (m, e) => {
    console.error(m, e);
  },
  agora: Date = new Date(),
): Promise<ResultadoDoAviso> {
  try {
    if (!(await reservarAvisoDeNaoCurador(db, email, chave, agora))) return 'barrado';
    await enviar(email, ASSUNTO_DO_AVISO, TEXTO_DO_AVISO);
    return 'enviado';
  } catch (erro) {
    registrarErro('Aviso de e-mail fora da curadoria não saiu:', erro);
    return 'falhou';
  }
}
