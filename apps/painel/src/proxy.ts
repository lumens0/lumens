import NextAuth from 'next-auth';
import { NextResponse } from 'next/server';
import { destino } from './destino';
import { configBase } from './auth.config';

// Só lê o JWT da sessão: nada de banco ou e-mail aqui.
const { auth } = NextAuth(configBase);

// Sem sessão: página vai para /login e rota de API de curadoria responde 401. As rotas conferem
// a sessão de novo no servidor; isto aqui é a primeira barreira, não a única.
export default auth((req) => {
  const para = destino(req.nextUrl.pathname, req.auth !== null);
  if (para === 'nao_autorizado') return NextResponse.json(null, { status: 401 });
  if (para === 'login') return NextResponse.redirect(new URL('/login', req.nextUrl));
  return NextResponse.next();
});

export const config = {
  // O próprio Auth.js (/api/auth) e os arquivos do Next ficam de fora.
  matcher: ['/((?!api/auth|_next/|favicon.ico).*)'],
};
