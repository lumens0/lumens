'use server';

import { signIn, signOut } from '../auth';

export async function entrar(formulario: FormData) {
  const email = formulario.get('email');
  await signIn('nodemailer', { email: typeof email === 'string' ? email : '', redirectTo: '/' });
}

export async function sair() {
  await signOut({ redirectTo: '/login' });
}
