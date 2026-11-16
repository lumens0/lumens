/**
 * RF-B04 · RN01 · Verificação pelo e-mail institucional (história 2.4).
 *
 * 1. `emailInstitucional` (SCRUM-134): só e-mail da UFAL prova que a pessoa é estudante. O
 *    domínio tem de ser `ufal.br` ou um subdomínio dele (`ic.ufal.br`, `ctec.ufal.br`...).
 * 2. `gerarCodigo` e `guardarCodigo` (SCRUM-135): o código de 6 dígitos que vai por e-mail. O
 *    banco guarda só o hash, que vale 10 minutos; um pedido novo substitui o anterior.
 * 3. `conferirCodigo` e `esperaParaReenviar` (SCRUM-136): no máximo 5 tentativas por código, e
 *    um código novo só depois de 60 s do anterior. Juntos, limitam quem tenta adivinhar: 5
 *    palpites por minuto, num universo de 1 milhão de códigos.
 * 4. `vincularEmail` (SCRUM-137, RN01): com o código certo, o telefone fica ligado ao e-mail no
 *    cadastro do estudante. Um e-mail vale para um telefone só: é o que garante um apoio por
 *    estudante (RN02), já que o apoio é contado por estudante.
 * 5. `concluirVerificacao` (SCRUM-138): com o curso escolhido, o estudante passa a ser verificado
 *    (RN01). Só vale curso da lista `CURSOS`, porque o curso de quem cuida da pauta vai para o site.
 * 6. `bloqueioDaVerificacao` e `registrarNaVerificacao` (SCRUM-298): limites acumulados em 24 h,
 *    por e-mail e por identidade, que o "reenviar" não zera. Sem eles, 5 palpites por minuto davam
 *    ~7.200 por dia por identidade; com eles, no máximo 20 por dia por e-mail, somando todas as
 *    identidades. Também seguram o envio de e-mail em massa para endereços de terceiros.
 */
import { createHash, randomInt, timingSafeEqual } from 'node:crypto';
import {
  CURSOS,
  and,
  codigosVerificacao,
  eq,
  estudantes,
  gt,
  lt,
  or,
  registrosVerificacao,
  type Db,
} from '@lumens/db';

/** O domínio da UFAL. Subdomínios (`*.ufal.br`) também valem. */
export const DOMINIO_UFAL = 'ufal.br';

/** Tamanho máximo de um endereço de e-mail (RFC 5321). */
export const EMAIL_MAXIMO = 254;

export type ResultadoEmail =
  | { valido: true; email: string }
  | { valido: false; motivo: 'sem_email' | 'varios_emails' | 'formato' | 'fora_da_ufal' };

/** Minúsculas e sem espaços nas pontas: é assim que o e-mail é comparado e guardado. */
export function normalizarEmail(email: string): string {
  return email.trim().toLowerCase();
}

const PARTE_LOCAL = /^[a-z0-9!#$%&'*+/=?^_`{|}~-]+(\.[a-z0-9!#$%&'*+/=?^_`{|}~-]+)*$/;
const ROTULO = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/;

/** O domínio é `ufal.br` ou termina em `.ufal.br`, com cada rótulo válido. */
function dominioDaUfal(dominio: string): boolean {
  if (dominio !== DOMINIO_UFAL && !dominio.endsWith(`.${DOMINIO_UFAL}`)) return false;
  return dominio.split('.').every((rotulo) => ROTULO.test(rotulo));
}

/**
 * Acha o e-mail na mensagem e confere se é da UFAL. Aceita a frase inteira ("meu e-mail é
 * joao@ic.ufal.br.") desde que tenha um endereço só; a pontuação em volta não conta.
 */
export function emailInstitucional(mensagem: string): ResultadoEmail {
  const candidatos = mensagem
    .split(/\s+/)
    .filter((palavra) => palavra.includes('@'))
    .map((palavra) => palavra.replace(/^[<("'[]+|[>)"'\].,;:!?]+$/g, ''));
  const [candidato] = candidatos;
  if (candidato === undefined) return { valido: false, motivo: 'sem_email' };
  if (candidatos.length > 1) return { valido: false, motivo: 'varios_emails' };

  const email = normalizarEmail(candidato.replace(/^mailto:/i, ''));
  const partes = email.split('@');
  const [local, dominio] = partes;
  if (
    partes.length !== 2 ||
    local === undefined ||
    dominio === undefined ||
    email.length > EMAIL_MAXIMO ||
    !PARTE_LOCAL.test(local) ||
    !dominio.includes('.')
  ) {
    return { valido: false, motivo: 'formato' };
  }
  if (!dominioDaUfal(dominio)) return { valido: false, motivo: 'fora_da_ufal' };
  return { valido: true, email };
}

/** Quantos dígitos tem o código enviado por e-mail. */
export const DIGITOS_DO_CODIGO = 6;

/** Quanto tempo o código vale depois de enviado. */
export const CODIGO_EXPIRA_MS = 10 * 60_000;

/** Código de 6 dígitos, de "000000" a "999999", com o gerador criptográfico do Node. */
export function gerarCodigo(): string {
  return String(randomInt(0, 10 ** DIGITOS_DO_CODIGO)).padStart(DIGITOS_DO_CODIGO, '0');
}

/**
 * Hash SHA-256 do código, misturado ao telefone: o mesmo código em dois telefones dá hashes
 * diferentes. O código em si nunca vai para o banco.
 */
export function hashDoCodigo(telefoneHmac: string, codigo: string): string {
  return createHash('sha256').update(`${telefoneHmac}:${codigo}`).digest('hex');
}

/**
 * Guarda o hash do código do telefone, válido por 10 minutos, e zera as tentativas. Um código
 * novo para o mesmo telefone substitui o anterior: só vale o último enviado.
 */
export async function guardarCodigo(
  db: Db,
  {
    telefoneHmac,
    codigo,
    agora = new Date(),
  }: { telefoneHmac: string; codigo: string; agora?: Date },
): Promise<{ expiraEm: Date }> {
  const valores = {
    codigoHash: hashDoCodigo(telefoneHmac, codigo),
    expiraEm: new Date(agora.getTime() + CODIGO_EXPIRA_MS),
    tentativas: 0,
  };
  await db
    .insert(codigosVerificacao)
    .values({ telefoneHmac, ...valores })
    .onConflictDoUpdate({ target: codigosVerificacao.telefoneHmac, set: valores });
  return { expiraEm: valores.expiraEm };
}

/** Quanto tempo um código vencido ainda fica guardado antes da limpeza (SCRUM-332). */
export const CODIGO_GUARDADO_APOS_VENCER_MS = 24 * 3_600_000;

/**
 * Apaga os códigos vencidos há mais de um dia. Sem isto, o código de quem pediu e não terminou a
 * verificação ficava para sempre, com o HMAC do telefone. O dia de folga não muda nada para quem
 * está verificando: depois de vencer, o código já não serve para nada. Retorna quantos apagou.
 */
export async function apagarCodigosVencidos(db: Db, agora: Date = new Date()): Promise<number> {
  const linhas = await db
    .delete(codigosVerificacao)
    .where(
      lt(codigosVerificacao.expiraEm, new Date(agora.getTime() - CODIGO_GUARDADO_APOS_VENCER_MS)),
    )
    .returning({ telefoneHmac: codigosVerificacao.telefoneHmac });
  return linhas.length;
}

/** Tentativas por código. Esgotadas, só um código novo (reenvio) libera de novo. */
export const MAX_TENTATIVAS = 5;

/** Tempo mínimo entre dois envios de código para o mesmo telefone. */
export const REENVIO_APOS_MS = 60_000;

export type ResultadoConferencia =
  | { certo: true }
  | { certo: false; motivo: 'errado'; restantes: number }
  | { certo: false; motivo: 'sem_tentativas' | 'expirado' | 'sem_codigo' }
  | { certo: false; motivo: 'bloqueado'; liberaEm: Date };

/**
 * Confere o código digitado. Certo: o código é apagado (vale uma vez só). Errado: conta uma
 * tentativa e diz quantas restam. Código vencido, sem tentativas ou inexistente não é conferido:
 * a pessoa precisa pedir outro. A linha é travada (`FOR UPDATE`) para duas mensagens ao mesmo
 * tempo não contarem como uma tentativa só.
 *
 * SCRUM-298: com 20 erros nas últimas 24 h, pelo e-mail ou pela identidade, nem confere
 * (`bloqueado`), e cada erro fica no registro, que o "reenviar" não zera.
 */
export async function conferirCodigo(
  db: Db,
  {
    telefoneHmac,
    emailHmac,
    codigo,
    agora = new Date(),
  }: { telefoneHmac: string; emailHmac: string; codigo: string; agora?: Date },
): Promise<ResultadoConferencia> {
  const [linha] = await db
    .select()
    .from(codigosVerificacao)
    .where(eq(codigosVerificacao.telefoneHmac, telefoneHmac))
    .for('update');
  if (linha === undefined) return { certo: false, motivo: 'sem_codigo' };
  const bloqueio = await bloqueioPor(db, 'erro', { telefoneHmac, emailHmac, agora });
  if (bloqueio !== undefined) return { certo: false, motivo: 'bloqueado', liberaEm: bloqueio };
  if (linha.tentativas >= MAX_TENTATIVAS) return { certo: false, motivo: 'sem_tentativas' };
  if (linha.expiraEm.getTime() <= agora.getTime()) return { certo: false, motivo: 'expirado' };

  if (mesmoHash(linha.codigoHash, hashDoCodigo(telefoneHmac, codigo))) {
    await apagarCodigo(db, telefoneHmac);
    return { certo: true };
  }
  const tentativas = linha.tentativas + 1;
  await db
    .update(codigosVerificacao)
    .set({ tentativas })
    .where(eq(codigosVerificacao.telefoneHmac, telefoneHmac));
  await registrarNaVerificacao(db, 'erro', { telefoneHmac, emailHmac, agora });
  return { certo: false, motivo: 'errado', restantes: MAX_TENTATIVAS - tentativas };
}

/** Compara em tempo constante: o tempo da resposta não revela quantos caracteres bateram. */
function mesmoHash(a: string, b: string): boolean {
  const [x, y] = [Buffer.from(a), Buffer.from(b)];
  return x.length === y.length && timingSafeEqual(x, y);
}

/**
 * Quanto falta (em ms) para o telefone poder pedir outro código; 0 se já pode. O envio é a
 * validade menos 10 minutos: a tabela não precisa de outra coluna.
 */
export async function esperaParaReenviar(
  db: Db,
  { telefoneHmac, agora = new Date() }: { telefoneHmac: string; agora?: Date },
): Promise<number> {
  const [linha] = await db
    .select({ expiraEm: codigosVerificacao.expiraEm })
    .from(codigosVerificacao)
    .where(eq(codigosVerificacao.telefoneHmac, telefoneHmac));
  if (linha === undefined) return 0;
  const enviadoEm = linha.expiraEm.getTime() - CODIGO_EXPIRA_MS;
  return Math.max(0, enviadoEm + REENVIO_APOS_MS - agora.getTime());
}

/** Apaga o código do telefone: usado (certo) ou que não chegou a sair (envio falhou). */
export async function apagarCodigo(db: Db, telefoneHmac: string): Promise<void> {
  await db.delete(codigosVerificacao).where(eq(codigosVerificacao.telefoneHmac, telefoneHmac));
}

/** Janela dos limites acumulados (SCRUM-298). */
export const JANELA_DOS_LIMITES_MS = 24 * 60 * 60_000;

/** Códigos enviados em 24 h, por e-mail e por identidade. O 6º pedido é recusado sem e-mail. */
export const MAX_ENVIOS_POR_DIA = 5;

/** Códigos errados em 24 h, por e-mail e por identidade. Ao chegar aqui, a conferência para. */
export const MAX_ERROS_POR_DIA = 20;

export type TipoDeRegistro = 'envio' | 'erro';

export interface ChavesDaVerificacao {
  telefoneHmac: string;
  /** HMAC do e-mail normalizado, o mesmo de `estudante.email_hmac`. */
  emailHmac: string;
  agora?: Date;
}

const LIMITE: Record<TipoDeRegistro, number> = {
  envio: MAX_ENVIOS_POR_DIA,
  erro: MAX_ERROS_POR_DIA,
};

/**
 * Até quando um tipo está bloqueado; `undefined` se não está. Conta separado por e-mail e por
 * identidade: basta um dos dois chegar ao limite. Libera quando o registro que fez passar do limite
 * sai da janela de 24 h.
 */
async function bloqueioPor(
  db: Db,
  tipo: TipoDeRegistro,
  { telefoneHmac, emailHmac, agora = new Date() }: ChavesDaVerificacao,
): Promise<Date | undefined> {
  const desde = new Date(agora.getTime() - JANELA_DOS_LIMITES_MS);
  const linhas = await db
    .select({
      telefoneHmac: registrosVerificacao.telefoneHmac,
      emailHmac: registrosVerificacao.emailHmac,
      em: registrosVerificacao.em,
    })
    .from(registrosVerificacao)
    .where(
      and(
        eq(registrosVerificacao.tipo, tipo),
        gt(registrosVerificacao.em, desde),
        or(
          eq(registrosVerificacao.emailHmac, emailHmac),
          eq(registrosVerificacao.telefoneHmac, telefoneHmac),
        ),
      ),
    );
  const limite = LIMITE[tipo];
  const liberacoes = [
    linhas.filter((l) => l.emailHmac === emailHmac),
    linhas.filter((l) => l.telefoneHmac === telefoneHmac),
  ].flatMap((daChave) => {
    if (daChave.length < limite) return [];
    // Mais novo primeiro: o bloqueio dura até o `limite`-ésimo mais novo sair da janela.
    const emOrdem = daChave.map((l) => l.em.getTime()).sort((a, b) => b - a);
    const marco = emOrdem[limite - 1] ?? agora.getTime();
    return [marco + JANELA_DOS_LIMITES_MS];
  });
  return liberacoes.length === 0 ? undefined : new Date(Math.max(...liberacoes));
}

export type BloqueioDaVerificacao = { motivo: 'envios' | 'erros'; liberaEm: Date } | undefined;

/**
 * Pode mandar outro código para este e-mail, desta identidade? Bloqueia com 5 códigos enviados ou
 * 20 erros nas últimas 24 h, contados por e-mail e por identidade. Chame antes de gerar o código:
 * bloqueado, nenhum e-mail sai.
 */
export async function bloqueioDaVerificacao(
  db: Db,
  chaves: ChavesDaVerificacao,
): Promise<BloqueioDaVerificacao> {
  const erros = await bloqueioPor(db, 'erro', chaves);
  if (erros !== undefined) return { motivo: 'erros', liberaEm: erros };
  const envios = await bloqueioPor(db, 'envio', chaves);
  if (envios !== undefined) return { motivo: 'envios', liberaEm: envios };
  return undefined;
}

/**
 * Registra um código enviado ou um código errado, só com os HMACs. Aproveita para apagar o que já
 * saiu da janela de 24 h, de qualquer pessoa: a tabela não cresce sem limite.
 */
export async function registrarNaVerificacao(
  db: Db,
  tipo: TipoDeRegistro,
  { telefoneHmac, emailHmac, agora = new Date() }: ChavesDaVerificacao,
): Promise<void> {
  await apagarRegistrosVencidos(db, agora);
  await db.insert(registrosVerificacao).values({ telefoneHmac, emailHmac, tipo, em: agora });
}

/**
 * Apaga os registros que já saíram da janela de 24 h: não contam mais para limite nenhum. Roda a
 * cada registro novo e também na limpeza de hora em hora (SCRUM-332), para não depender de alguém
 * verificar: sem isso, as linhas de um dia sem verificações ficariam até a próxima. Retorna quantos
 * apagou.
 */
export async function apagarRegistrosVencidos(db: Db, agora: Date = new Date()): Promise<number> {
  const linhas = await db
    .delete(registrosVerificacao)
    .where(lt(registrosVerificacao.em, new Date(agora.getTime() - JANELA_DOS_LIMITES_MS)))
    .returning({ id: registrosVerificacao.id });
  return linhas.length;
}

export type ResultadoVinculo =
  | {
      vinculado: true;
      estudanteId: string;
      /**
       * SCRUM-298: o cadastro saiu de outra identidade para esta (troca de canal). Quem chama avisa
       * o dono pelo e-mail: se não foi ele, alguém acertou o código e tomou o cadastro.
       */
      transferido?: true;
    }
  | { vinculado: false; motivo: 'email_em_uso' };

export interface NovoVinculo {
  telefoneHmac: string;
  telefoneCifrado: string;
  /** HMAC do e-mail já normalizado (`normalizarEmail`), com a CHAVE_HMAC: é por ele que se busca. */
  emailHmac: string;
  emailCifrado: string;
}

/**
 * Liga o telefone ao e-mail no cadastro do estudante (RN01). Chame só depois do código certo: é
 * ele que prova que a pessoa é dona do e-mail.
 *
 * - E-mail de outra identidade, e esta identidade ainda sem cadastro: é a mesma pessoa chegando por
 *   outro canal (o bot trocou de WhatsApp para Telegram, por exemplo; SCRUM-267). O cadastro do
 *   dono passa para esta identidade: apoios, pautas, curso e `verificado_em` continuam no mesmo
 *   estudante, sem voto duplicado, e os avisos pendentes saem para o endereço novo.
 * - E-mail de outra identidade que já tem cadastro também: recusa (`email_em_uso`) e não mexe em
 *   nada. Juntar dois cadastros pediria uma regra para os apoios dos dois.
 * - Telefone novo: cria o estudante, ainda sem `verificado_em` (quem marca é o fim da 2.4).
 * - Telefone que já tem cadastro: troca o e-mail; o antigo fica livre. `verificado_em` e `saiu_em`
 *   não mudam aqui.
 *
 * As linhas são travadas (`FOR UPDATE`). Dois telefones novos tentando o mesmo e-mail ao mesmo
 * tempo esbarram no `UNIQUE` de `email_hmac`: o primeiro grava, o segundo recebe `email_em_uso`.
 * Se um deles já tinha cadastro (o `UPDATE`), o choque vira erro, a mensagem volta pelo retry do
 * worker e, na segunda vez, a leitura do dono já devolve `email_em_uso`. Para isso, os dois
 * precisariam ter recebido o código no mesmo e-mail no mesmo instante.
 */
export async function vincularEmail(db: Db, vinculo: NovoVinculo): Promise<ResultadoVinculo> {
  const [dono] = await db
    .select({ id: estudantes.id, telefoneHmac: estudantes.telefoneHmac })
    .from(estudantes)
    .where(eq(estudantes.emailHmac, vinculo.emailHmac))
    .for('update');

  const [meu] = await db
    .select({ id: estudantes.id })
    .from(estudantes)
    .where(eq(estudantes.telefoneHmac, vinculo.telefoneHmac))
    .for('update');

  if (dono !== undefined && dono.telefoneHmac !== vinculo.telefoneHmac) {
    if (meu !== undefined) return { vinculado: false, motivo: 'email_em_uso' };
    // A mesma pessoa em outro canal: o cadastro troca de chave, e o código certo já provou a posse
    // do e-mail. O UNIQUE de `telefone_hmac` não choca: esta identidade não tem cadastro.
    await db
      .update(estudantes)
      .set({ telefoneHmac: vinculo.telefoneHmac, telefoneCifrado: vinculo.telefoneCifrado })
      .where(eq(estudantes.id, dono.id));
    return { vinculado: true, estudanteId: dono.id, transferido: true };
  }

  if (meu !== undefined) {
    await db
      .update(estudantes)
      .set({ emailHmac: vinculo.emailHmac, emailCifrado: vinculo.emailCifrado })
      .where(eq(estudantes.id, meu.id));
    return { vinculado: true, estudanteId: meu.id };
  }

  // Sem alvo, o `ON CONFLICT DO NOTHING` vale para qualquer UNIQUE: se outro telefone gravou o
  // mesmo e-mail entre a leitura e aqui, nada é inserido e não há erro que derrube a transação.
  const [criado] = await db
    .insert(estudantes)
    .values({
      telefoneHmac: vinculo.telefoneHmac,
      telefoneCifrado: vinculo.telefoneCifrado,
      emailHmac: vinculo.emailHmac,
      emailCifrado: vinculo.emailCifrado,
    })
    .onConflictDoNothing()
    .returning({ id: estudantes.id });
  if (criado === undefined) return { vinculado: false, motivo: 'email_em_uso' };
  return { vinculado: true, estudanteId: criado.id };
}

export type ResultadoConclusao =
  | { verificado: true; estudanteId: string }
  | { verificado: false; motivo: 'curso_invalido' | 'sem_vinculo' };

/** O curso é um dos da lista? Texto livre não entra: o curso aparece no site. */
export function cursoValido(curso: string): boolean {
  return (CURSOS as readonly string[]).includes(curso);
}

/**
 * Último passo da verificação (RN01): grava o curso e marca o estudante como verificado. Precisa
 * do vínculo telefone ↔ e-mail (`vincularEmail`) já feito.
 *
 * - Quem já era verificado (e não saiu) mantém a data da primeira verificação.
 * - Quem tinha saído (`saiu_em`) e se verifica de novo volta a valer: `saiu_em` é limpo e
 *   `verificado_em` passa a ser agora.
 */
export async function concluirVerificacao(
  db: Db,
  {
    telefoneHmac,
    curso,
    agora = new Date(),
  }: { telefoneHmac: string; curso: string; agora?: Date },
): Promise<ResultadoConclusao> {
  if (!cursoValido(curso)) return { verificado: false, motivo: 'curso_invalido' };

  const [estudante] = await db
    .select({
      id: estudantes.id,
      emailHmac: estudantes.emailHmac,
      verificadoEm: estudantes.verificadoEm,
      saiuEm: estudantes.saiuEm,
    })
    .from(estudantes)
    .where(eq(estudantes.telefoneHmac, telefoneHmac))
    .for('update');
  if (estudante?.emailHmac == null) return { verificado: false, motivo: 'sem_vinculo' };

  const continuaValendo = estudante.verificadoEm !== null && estudante.saiuEm === null;
  await db
    .update(estudantes)
    .set({ curso, verificadoEm: continuaValendo ? estudante.verificadoEm : agora, saiuEm: null })
    .where(eq(estudantes.id, estudante.id));
  return { verificado: true, estudanteId: estudante.id };
}
