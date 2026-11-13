import type { Metadata } from 'next';
import localFont from 'next/font/local';
import type { ReactNode } from 'react';
import { Cabecalho } from '../componentes/Cabecalho';
import { metadadosDaMarca } from '../metadados';
import { origemDoSite } from '../origem';
import './globals.css';

// As fontes são locais, não `next/font/google`: aquele baixa os arquivos de
// fonts.gstatic.com durante o build, e uma falha de rede no runner quebra o
// `check` — que hoje é pré-requisito do `deploy`. Ver src/fontes/README.md.
//
// Bricolage Grotesque nos títulos (cara de cartaz, com eixo de tamanho óptico) e Instrument Sans
// no texto, nos números e nas datas. A faixa de `weight` bate com a de cada arquivo variável.
//
// Os arquivos servidos são recortes dos originais (`*-var.woff2`): sem o eixo de largura, que o
// site não usa, e a Bricolage só com os pesos dos títulos (600 a 800). De 185 KB para 97 KB, o que
// tira quase meio segundo do LCP no celular em 4G (SCRUM-59). Como gerar: src/fontes/README.md.

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
  // Base das URLs relativas dos metadados: o WhatsApp não resolve `og:image` relativa.
  metadataBase: origemDoSite(),
  ...metadadosDaMarca(),
  title: 'Lumens',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="pt-BR" className={`${titulo.variable} ${corpo.variable}`}>
      <body>
        <Cabecalho />
        {children}
      </body>
    </html>
  );
}
