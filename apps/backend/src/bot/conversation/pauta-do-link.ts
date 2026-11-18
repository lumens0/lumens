/**
 * A pauta que um link do site aponta: pelo slug, ou pelo id curto quando o slug não coube no `start`
 * do Telegram (SCRUM-293). Vale para o "apoiar", o "cuidar" e o "ajudar".
 */
import { eq, pautas, sql, type Db } from '@lumens/db';

/**
 * Os 8 primeiros caracteres do id, que fecham todo slug gerado (`gerarSlug`). É o que o link do
 * Telegram manda quando `apoiar_<slug>` não cabe nos 64 caracteres do `start`.
 */
const ID_CURTO = /^[0-9a-f]{8}$/;

export async function pautaDoLink(db: Db, alvo: string) {
  const chave = alvo.toLowerCase();
  const campos = { id: pautas.id, status: pautas.status };
  const [pauta] = await db.select(campos).from(pautas).where(eq(pautas.slug, chave));
  if (pauta !== undefined || !ID_CURTO.test(chave)) return pauta;
  // Dois ids com o mesmo começo são raros (1 em 4 bilhões por par), mas aí não se adivinha.
  const achadas = await db
    .select(campos)
    .from(pautas)
    .where(sql`${pautas.id}::text like ${`${chave}%`}`)
    .limit(2);
  return achadas.length === 1 ? achadas[0] : undefined;
}
