import { createHmac } from 'node:crypto';
import { cifrar, decifrar } from '@lumens/dominio';
import type { Env } from '../config/env';

/** As duas chaves da T17 já decodificadas do base64 (32 bytes cada; o env.ts garante). */
export interface Chaves {
  /** CHAVE_CIFRA: AES-256-GCM, para o que precisa voltar a ser lido (telefone, wamid). */
  cifra: Buffer;
  /** CHAVE_HMAC: identifica sem revelar (busca por telefone, dedup do wamid). */
  hmac: Buffer;
}

export function chavesDoEnv(env: Pick<Env, 'CHAVE_CIFRA' | 'CHAVE_HMAC'>): Chaves {
  return {
    cifra: Buffer.from(env.CHAVE_CIFRA, 'base64'),
    hmac: Buffer.from(env.CHAVE_HMAC, 'base64'),
  };
}

/** HMAC-SHA256 em hex. */
export function hmacHex(valor: string, chave: Buffer): string {
  return createHmac('sha256', chave).update(valor).digest('hex');
}

export { cifrar, decifrar };

/**
 * `cifrar`/`decifrar` com a chave já presa: o que os passos da conversa usam para guardar o que a
 * pessoa escreveu (o relato da 2.5) sem ver a chave.
 */
export function segredoCom(chave: Buffer): {
  cifrar(texto: string): string;
  decifrar(cifrado: string): string;
} {
  return {
    cifrar: (texto) => cifrar(texto, chave),
    decifrar: (cifrado) => decifrar(cifrado, chave),
  };
}
