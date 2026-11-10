import type { NextAuthConfig } from 'next-auth';

/**
 * O que o proxy precisa para ler a sessão (o JWT), sem banco nem e-mail. O `auth.ts` completa com o
 * adapter, o provedor de e-mail e a checagem do curador.
 */
export const configBase = {
  providers: [],
  session: { strategy: 'jwt', maxAge: 7 * 24 * 60 * 60 },
  pages: { signIn: '/login', verifyRequest: '/login/verifique', error: '/login/erro' },
  callbacks: {
    // O Auth.js já põe o id do curador em `token.sub` no login; aqui ele vai para a sessão.
    session({ session, token }) {
      if (token.sub) session.user.id = token.sub;
      return session;
    },
  },
} satisfies NextAuthConfig;
