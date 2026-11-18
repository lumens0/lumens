import type { Metadata } from 'next';
import localFont from 'next/font/local';
import type { ReactNode } from 'react';
import '@lumens/marca/tokens.css';
import './globals.css';

// As fontes são locais, não `next/font/google`: aquele baixa os arquivos durante o build, e uma
// falha de rede no runner quebra o `check` — que o `deploy` exige. São as mesmas do site
// (SCRUM-285); procedência e licença em src/fontes/README.md.
const titulo = localFont({
  src: '../fontes/bricolage-grotesque-latin-600-800.woff2',
  weight: '600 800',
  display: 'swap',
  variable: '--fonte-titulo',
  fallback: ['system-ui', 'sans-serif'],
});

const corpo = localFont({
  src: '../fontes/instrument-sans-latin-400-700.woff2',
  weight: '400 700',
  display: 'swap',
  variable: '--fonte-corpo',
  fallback: ['system-ui', 'sans-serif'],
});

export const metadata: Metadata = {
  title: 'Painel de curadoria · Lumens',
  description: 'Área restrita da equipe de curadoria do Lumens.',
  icons: { icon: '/lumens-marca.svg' },
  robots: {
    index: false,
    follow: false,
  },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="pt-BR" className={[titulo.variable, corpo.variable].join(' ')}>
      <body>{children}</body>
    </html>
  );
}
