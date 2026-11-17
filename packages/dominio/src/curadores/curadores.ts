/**
 * Quem pode entrar no painel de curadoria (SCRUM-295). Porta de escrita de `curador` e de
 * `curador_auditoria`: cada mudança e o seu registro de auditoria confirmam ou desfazem juntos.
 *
 * O e-mail nunca fica em claro: vai cifrado (AES-256-GCM, CHAVE_CIFRA) para o administrador poder
 * ler na lista, e com HMAC (CHAVE_HMAC), que é como o login acha o curador
 * (`apps/painel/src/acesso.ts` faz o mesmo cálculo). A auditoria guarda só ids.
 *
 * Quem chama confere se o autor é administrador ativo; aqui ficam as regras que valem sempre.
 */
import { createHmac } from 'node:crypto';
import { and, curadorAuditoria, curadores, eq, type Db, type Tx } from '@lumens/db';
import { cifrar, decifrar } from '../compartilhado/cifra';

/** As duas chaves já decodificadas do base64 (32 bytes cada). */
export interface ChavesDeCurador {
  cifra: Buffer;
  hmac: Buffer;
}

export type MotivoRecusaCurador =
  | 'email_invalido'
  | 'nome_obrigatorio'
  | 'ja_ativo'
  | 'inexistente'
  | 'ja_inativo'
  | 'proprio_curador'
  | 'ultimo_administrador';

export type ResultadoCurador =
  { feito: true; curadorId: string } | { feito: false; motivo: MotivoRecusaCurador };

export interface CuradorListado {
  id: string;
  nome: string;
  email: string;
  papel: 'curador' | 'administrador';
  ativo: boolean;
  criadoEm: Date;
}

const EMAIL_UFAL = /^[^\s@]+@ufal\.br$/;

/** O HMAC com que o login acha o curador: e-mail sem espaços e em minúsculas. */
export function hmacDoEmailDeCurador(email: string, chave: Buffer): string {
  return createHmac('sha256', chave).update(email.trim().toLowerCase()).digest('hex');
}

/**
 * Trava os administradores ativos antes de qualquer outra linha de `curador`. Adicionar, desativar
 * e reativar travam sempre nessa ordem: a auditoria aponta para o administrador autor (a chave
 * estrangeira pede um lock nessa linha), e uma ordem diferente entre duas transações dava deadlock.
 */
function travarAdministradores(tx: Tx): Promise<{ id: string }[]> {
  return tx
    .select({ id: curadores.id })
    .from(curadores)
    .where(and(eq(curadores.papel, 'administrador'), eq(curadores.ativo, true)))
    .orderBy(curadores.id)
    .for('update');
}

/**
 * Adiciona um curador, ou reativa quem já existe com esse e-mail (sem duplicar e sem mudar o papel
 * que a pessoa já tinha). Só e-mail @ufal.br.
 *
 * `autorId` ausente é o primeiro administrador, criado pelo script: a pessoa consta como autora da
 * própria entrada na auditoria.
 */
export async function adicionarCurador(
  db: Db,
  chaves: ChavesDeCurador,
  {
    autorId,
    email,
    nome,
    papel = 'curador',
  }: { autorId?: string; email: string; nome: string; papel?: 'curador' | 'administrador' },
): Promise<ResultadoCurador> {
  const normalizado = email.trim().toLowerCase();
  if (!EMAIL_UFAL.test(normalizado)) return { feito: false, motivo: 'email_invalido' };
  const nomeLimpo = nome.trim();
  if (!nomeLimpo) return { feito: false, motivo: 'nome_obrigatorio' };

  const emailHmac = hmacDoEmailDeCurador(normalizado, chaves.hmac);
  return db.transaction(async (tx) => {
    await travarAdministradores(tx);
    const [existente] = await tx
      .select({ id: curadores.id, ativo: curadores.ativo })
      .from(curadores)
      .where(eq(curadores.emailHmac, emailHmac))
      .for('update');
    if (existente?.ativo) return { feito: false, motivo: 'ja_ativo' };

    let alvoId: string;
    if (existente) {
      await tx.update(curadores).set({ ativo: true }).where(eq(curadores.id, existente.id));
      alvoId = existente.id;
    } else {
      // O FOR UPDATE não trava uma linha que ainda não existe: dois cadastros do mesmo e-mail ao
      // mesmo tempo (ou dois cliques) chegam os dois aqui. O segundo não insere nem audita.
      const [novo] = await tx
        .insert(curadores)
        .values({
          emailHmac,
          emailCifrado: cifrar(normalizado, chaves.cifra),
          nome: nomeLimpo,
          papel,
        })
        .onConflictDoNothing({ target: curadores.emailHmac })
        .returning({ id: curadores.id });
      if (!novo) return { feito: false, motivo: 'ja_ativo' };
      alvoId = novo.id;
    }
    await tx.insert(curadorAuditoria).values({
      acao: existente ? 'reativou' : 'adicionou',
      autorId: autorId ?? alvoId,
      alvoId,
    });
    return { feito: true, curadorId: alvoId };
  });
}

/** Tira o acesso. Ninguém desativa a si mesmo, e o último administrador ativo fica. */
export async function desativarCurador(
  db: Db,
  { autorId, alvoId }: { autorId: string; alvoId: string },
): Promise<ResultadoCurador> {
  if (autorId === alvoId) return { feito: false, motivo: 'proprio_curador' };
  return db.transaction(async (tx) => {
    // Duas desativações ao mesmo tempo não zeram o grupo de administradores.
    const administradores = await travarAdministradores(tx);
    const [alvo] = await tx
      .select({ ativo: curadores.ativo, papel: curadores.papel })
      .from(curadores)
      .where(eq(curadores.id, alvoId))
      .for('update');
    if (!alvo) return { feito: false, motivo: 'inexistente' };
    if (!alvo.ativo) return { feito: false, motivo: 'ja_inativo' };
    if (alvo.papel === 'administrador' && administradores.length <= 1) {
      return { feito: false, motivo: 'ultimo_administrador' };
    }
    await tx.update(curadores).set({ ativo: false }).where(eq(curadores.id, alvoId));
    await tx.insert(curadorAuditoria).values({ acao: 'desativou', autorId, alvoId });
    return { feito: true, curadorId: alvoId };
  });
}

/** Devolve o acesso a quem foi desativado. */
export async function reativarCurador(
  db: Db,
  { autorId, alvoId }: { autorId: string; alvoId: string },
): Promise<ResultadoCurador> {
  return db.transaction(async (tx) => {
    await travarAdministradores(tx);
    const [alvo] = await tx
      .select({ ativo: curadores.ativo })
      .from(curadores)
      .where(eq(curadores.id, alvoId))
      .for('update');
    if (!alvo) return { feito: false, motivo: 'inexistente' };
    if (alvo.ativo) return { feito: false, motivo: 'ja_ativo' };
    await tx.update(curadores).set({ ativo: true }).where(eq(curadores.id, alvoId));
    await tx.insert(curadorAuditoria).values({ acao: 'reativou', autorId, alvoId });
    return { feito: true, curadorId: alvoId };
  });
}

/**
 * O e-mail para o administrador ler. Um registro que não abre com a CHAVE_CIFRA atual (os
 * curadores fictícios do seed, `seed:v1:email:…`, ou um que sobrou de outra chave) não derruba a
 * lista inteira: aparece como indisponível.
 */
function emailLegivel(emailCifrado: string, chave: Buffer): string {
  try {
    return decifrar(emailCifrado, chave);
  } catch {
    return 'E-mail indisponível';
  }
}

/** Todos, ativos primeiro e por nome, com o e-mail decifrado: só para mostrar a administrador. */
export async function listarCuradores(db: Db, chaves: ChavesDeCurador): Promise<CuradorListado[]> {
  const linhas = await db
    .select({
      id: curadores.id,
      nome: curadores.nome,
      emailCifrado: curadores.emailCifrado,
      papel: curadores.papel,
      ativo: curadores.ativo,
      criadoEm: curadores.criadoEm,
    })
    .from(curadores);
  return linhas
    .map(({ emailCifrado, ...resto }) => ({
      ...resto,
      email: emailLegivel(emailCifrado, chaves.cifra),
    }))
    .sort((a, b) => Number(b.ativo) - Number(a.ativo) || a.nome.localeCompare(b.nome, 'pt-BR'));
}

/**
 * Recifra o e-mail dos curadores de `chaveAntiga` para `chaveNova`, numa transação só (SCRUM-295):
 * os curadores usam a CHAVE_CIFRA_PAINEL, e quem foi cadastrado antes dela ficou com a CHAVE_CIFRA.
 * Pode rodar de novo sem estragar nada: o e-mail que já abre com a chave nova fica como está, e o
 * que não abre com nenhuma das duas (os fictícios do seed) também.
 */
export async function recifrarEmailsDeCuradores(
  db: Db,
  chaveAntiga: Buffer,
  chaveNova: Buffer,
): Promise<{ recifrados: number; jaNaChaveNova: number; ilegiveis: number }> {
  return db.transaction(async (tx) => {
    const linhas = await tx
      .select({ id: curadores.id, emailCifrado: curadores.emailCifrado })
      .from(curadores)
      .for('update');
    const contagem = { recifrados: 0, jaNaChaveNova: 0, ilegiveis: 0 };
    for (const { id, emailCifrado } of linhas) {
      const nova = tentarDecifrar(emailCifrado, chaveNova);
      if (nova !== undefined) {
        contagem.jaNaChaveNova++;
        continue;
      }
      const antiga = tentarDecifrar(emailCifrado, chaveAntiga);
      if (antiga === undefined) {
        contagem.ilegiveis++;
        continue;
      }
      await tx
        .update(curadores)
        .set({ emailCifrado: cifrar(antiga, chaveNova) })
        .where(eq(curadores.id, id));
      contagem.recifrados++;
    }
    return contagem;
  });
}

function tentarDecifrar(cifrado: string, chave: Buffer): string | undefined {
  try {
    return decifrar(cifrado, chave);
  } catch {
    return undefined;
  }
}
