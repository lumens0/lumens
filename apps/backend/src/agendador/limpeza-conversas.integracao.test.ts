import { criarDb, criarPool } from '@lumens/db';
import { criarBancoTemporario } from '@lumens/db/teste';
import { describe, expect, it } from 'vitest';
import { ConversationStore } from '../bot/conversation/store';
import { limparConversasExpiradas } from './limpeza-conversas';

/**
 * Concorrência da limpeza com a mensagem da pessoa. Precisa de duas conexões ao mesmo tempo, o que o
 * PGlite não tem: roda só com `DATABASE_URL_TESTE`.
 */
const URL_TESTE = process.env.DATABASE_URL_TESTE;
if (!URL_TESTE && process.env.CI) throw new Error('No CI, defina DATABASE_URL_TESTE.');

describe.skipIf(!URL_TESTE)('limpeza de conversas com Postgres de verdade', () => {
  it('espera a mensagem em andamento e, se ela renovou a conversa, não apaga as fotos', async () => {
    const temporario = await criarBancoTemporario(URL_TESTE ?? '');
    const pool = criarPool(
      temporario.url,
      { conexaoMs: 5000, consultaMs: 15_000 },
      () => undefined,
    );
    const db = criarDb(pool);
    let agora = new Date('2026-11-18T12:00:00Z');
    const store = new ConversationStore(db, () => agora);
    const removidas: string[] = [];
    try {
      await store.save('tel', 'NEW_ASK_PHOTO', {
        fotoChaves: ['fotos/2026/11/a.jpg', 'fotos/2026/11/b.jpg'],
      });
      agora = new Date(agora.getTime() + 25 * 3600_000);

      let soltar: () => void = () => undefined;
      const segurando = new Promise<void>((resolve) => {
        soltar = resolve;
      });
      let pronto: () => void = () => undefined;
      const lockAdquirido = new Promise<void>((resolve) => {
        pronto = resolve;
      });

      // A "mensagem": trava o telefone, demora (o download da 3ª foto) e renova a conversa.
      const mensagem = db.transaction(async (tx) => {
        const dela = store.withDb(tx);
        await dela.lock('tel');
        pronto();
        await segurando;
        await dela.save('tel', 'NEW_ASK_PHOTO', {
          fotoChaves: ['fotos/2026/11/a.jpg', 'fotos/2026/11/b.jpg', 'fotos/2026/11/c.jpg'],
        });
      });
      await lockAdquirido;

      let terminou = false;
      const limpeza = limparConversasExpiradas({
        store,
        db,
        fotos: {
          guardarFoto: () => Promise.resolve({ ok: false, motivo: 'indisponivel' } as const),
          removerFotos: (chaves) => {
            removidas.push(...chaves);
            return Promise.resolve();
          },
        },
      }).then((n) => {
        terminou = true;
        return n;
      });

      // Enquanto a mensagem segura o lock, a limpeza não anda.
      await new Promise((r) => setTimeout(r, 500));
      expect(terminou).toBe(false);

      soltar();
      await mensagem;
      expect(await limpeza).toBe(0);
      expect(removidas).toEqual([]);
      expect(await store.fotoChavesDaConversa('tel')).toHaveLength(3);
    } finally {
      await pool.end();
      await temporario.apagar();
    }
  }, 30_000);
});
