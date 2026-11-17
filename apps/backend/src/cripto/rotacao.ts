import { conversas, eq, estudantes, sql, type Db, type Tx } from '@lumens/db';
import { cifrar, decifrar } from './cifra';

const PREFIXO_LAPIDE = 'saiu:';

/**
 * Filas do bot cujos jobs levam dado cifrado com a `CHAVE_CIFRA` (conteúdo da mensagem, telefone,
 * respostas), com as de mortas e a de respostas antiga e a nova (SCRUM-307).
 */
const FILAS_CIFRADAS = sql`(name like 'incoming-message%' or name like 'outgoing-replies%')`;

export class FilaComJobsPendentesError extends Error {
  constructor(readonly pendentes: number) {
    super(
      `Há ${String(pendentes)} job(s) do bot ainda na fila (cifrados com a chave antiga). Suba o back-end para esvaziá-la e rode de novo (docs/operacao/chaves.md, passo 1).`,
    );
    this.name = 'FilaComJobsPendentesError';
  }
}

export interface ResultadoDaRotacao {
  estudantes: number;
  /** Conversas em andamento com algum campo recifrado (SCRUM-311). */
  conversas: number;
  /** Jobs do bot já encerrados ou nas filas de mortas, apagados (SCRUM-311). */
  jobsApagados: number;
}

/** O banco tem as tabelas do pg-boss? Nos testes (PGlite) e antes da 1ª subida, não. */
async function temPgBoss(tx: Tx): Promise<boolean> {
  const r = (await tx.execute(sql`select to_regclass('pgboss.job') is not null as existe`)) as {
    rows: { existe: boolean }[];
  };
  return r.rows[0]?.existe === true;
}

/**
 * Os jobs do bot levam dado cifrado. Pendente (`created`, `retry`, `active`) fora das filas de
 * mortas: recusa, porque o bot ainda vai lê-lo, e com a chave nova não decifraria. Os outros
 * (concluídos, falhados e tudo nas filas de mortas, que nenhum consumidor lê) são apagados, para
 * nada ficar no banco cifrado com a chave antiga.
 */
async function limparFilasCifradas(tx: Tx): Promise<number> {
  if (!(await temPgBoss(tx))) return 0;
  const pendentes = (await tx.execute(
    sql`select count(*)::int as total from pgboss.job
        where ${FILAS_CIFRADAS} and name not like '%-dead'
          and state in ('created', 'retry', 'active')`,
  )) as { rows: { total: number }[] };
  const total = pendentes.rows[0]?.total ?? 0;
  if (total > 0) throw new FilaComJobsPendentesError(total);
  const apagados = (await tx.execute(
    sql`delete from pgboss.job where ${FILAS_CIFRADAS} returning id`,
  )) as { rows: unknown[] };
  return apagados.rows.length;
}

/**
 * Recifra o que estiver cifrado nos dados de uma conversa em andamento (título, descrição, relato,
 * proposta, e-mail da verificação, menu em texto...). Não depende da lista de campos, que cresce a
 * cada fluxo novo: um texto que decifra com a chave antiga é dado cifrado (o AES-GCM confere a
 * autenticidade; um texto comum nunca passa). O resto fica como está.
 */
function recifrarValor(valor: unknown, antiga: Buffer, nova: Buffer): [unknown, boolean] {
  if (typeof valor === 'string') {
    let aberto: string;
    try {
      aberto = decifrar(valor, antiga);
    } catch {
      return [valor, false];
    }
    return [cifrar(aberto, nova), true];
  }
  if (Array.isArray(valor)) {
    let mudou = false;
    const itens = valor.map((item) => {
      const [novo, m] = recifrarValor(item, antiga, nova);
      mudou ||= m;
      return novo;
    });
    return [itens, mudou];
  }
  if (valor !== null && typeof valor === 'object') {
    let mudou = false;
    const objeto = Object.fromEntries(
      Object.entries(valor).map(([chave, item]) => {
        const [novo, m] = recifrarValor(item, antiga, nova);
        mudou ||= m;
        return [chave, novo];
      }),
    );
    return [objeto, mudou];
  }
  return [valor, false];
}

/**
 * Rotaciona a chave de cifra AES-256-GCM dos dados sensíveis armazenados no banco.
 *
 * Atualiza (o e-mail dos curadores usa a CHAVE_CIFRA_PAINEL e fica de fora; veja
 * `recifrarEmailsDeCuradores` no domínio):
 * - `estudante.telefone_cifrado` (exceto se for lápide 'saiu:')
 * - `estudante.email_cifrado` (quando não nulo e exceto se for lápide 'saiu:')
 * - os campos cifrados de `conversa.dados`, nas conversas em andamento (SCRUM-311)
 *
 * E apaga os jobs do bot já encerrados ou nas filas de mortas, que levam dado cifrado e ninguém lê
 * mais. Com job pendente na fila, recusa (`FilaComJobsPendentesError`).
 *
 * Executa em transação única. Se qualquer decifragem falhar, faz rollback automático.
 */
export async function rotacionarCifra(
  db: Db,
  chaveAntiga: Buffer,
  chaveNova: Buffer,
): Promise<ResultadoDaRotacao> {
  if (chaveAntiga.length !== 32 || chaveNova.length !== 32) {
    throw new Error('As chaves de cifra precisam ter exatamente 32 bytes.');
  }
  if (chaveAntiga.equals(chaveNova)) {
    throw new Error('A chave nova deve ser diferente da chave antiga.');
  }

  return await db.transaction(async (tx) => {
    const jobsApagados = await limparFilasCifradas(tx);
    let estudantesCount = 0;

    const listaEstudantes = await tx
      .select({
        id: estudantes.id,
        telefoneCifrado: estudantes.telefoneCifrado,
        emailCifrado: estudantes.emailCifrado,
      })
      .from(estudantes);

    for (const estudante of listaEstudantes) {
      const alteracoes: { telefoneCifrado?: string; emailCifrado?: string } = {};
      let alterou = false;

      if (!estudante.telefoneCifrado.startsWith(PREFIXO_LAPIDE)) {
        const telDecifrado = decifrar(estudante.telefoneCifrado, chaveAntiga);
        alteracoes.telefoneCifrado = cifrar(telDecifrado, chaveNova);
        alterou = true;
      }

      if (estudante.emailCifrado !== null && !estudante.emailCifrado.startsWith(PREFIXO_LAPIDE)) {
        const emailDecifrado = decifrar(estudante.emailCifrado, chaveAntiga);
        alteracoes.emailCifrado = cifrar(emailDecifrado, chaveNova);
        alterou = true;
      }

      if (alterou) {
        await tx.update(estudantes).set(alteracoes).where(eq(estudantes.id, estudante.id));
        estudantesCount++;
      }
    }

    let conversasCount = 0;
    const abertas = await tx
      .select({ telefoneHmac: conversas.telefoneHmac, dados: conversas.dados })
      .from(conversas);
    for (const conversa of abertas) {
      const [dados, mudou] = recifrarValor(conversa.dados, chaveAntiga, chaveNova);
      if (!mudou) continue;
      await tx
        .update(conversas)
        .set({ dados: dados as Record<string, unknown> })
        .where(eq(conversas.telefoneHmac, conversa.telefoneHmac));
      conversasCount++;
    }

    return {
      estudantes: estudantesCount,
      conversas: conversasCount,
      jobsApagados,
    };
  });
}
