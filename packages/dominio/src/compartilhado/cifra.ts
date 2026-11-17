/**
 * Cifra dos dados pessoais (AES-256-GCM, CHAVE_CIFRA). Fonte única: o back-end reexporta daqui
 * (`apps/backend/src/cripto/cifra.ts`) e o painel usa pelo domínio, então o que um cifra o outro
 * decifra.
 */
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

const TAMANHO_IV = 12;
const TAMANHO_TAG = 16;

/** AES-256-GCM. Saída em base64: iv (12 bytes) | tag (16 bytes) | texto cifrado. */
export function cifrar(texto: string, chave: Buffer): string {
  const iv = randomBytes(TAMANHO_IV);
  const cifra = createCipheriv('aes-256-gcm', chave, iv);
  const cifrado = Buffer.concat([cifra.update(texto, 'utf8'), cifra.final()]);
  return Buffer.concat([iv, cifra.getAuthTag(), cifrado]).toString('base64');
}

/** Inverso de `cifrar`. Lança se a chave for outra ou se o conteúdo tiver sido alterado. */
export function decifrar(cifradoBase64: string, chave: Buffer): string {
  const bytes = Buffer.from(cifradoBase64, 'base64');
  // Sem isto, uma entrada curta viraria uma tag de 4 a 15 bytes, que o Node aceita: a
  // autenticação ficaria mais fraca que os 16 bytes que `cifrar` sempre gera.
  if (bytes.length < TAMANHO_IV + TAMANHO_TAG) throw new Error('Conteúdo cifrado curto demais.');
  const iv = bytes.subarray(0, TAMANHO_IV);
  const tag = bytes.subarray(TAMANHO_IV, TAMANHO_IV + TAMANHO_TAG);
  const decifra = createDecipheriv('aes-256-gcm', chave, iv, { authTagLength: TAMANHO_TAG });
  decifra.setAuthTag(tag);
  return Buffer.concat([
    decifra.update(bytes.subarray(TAMANHO_IV + TAMANHO_TAG)),
    decifra.final(),
  ]).toString('utf8');
}
