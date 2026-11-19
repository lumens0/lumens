import type { Metadata } from 'next';
import localFont from 'next/font/local';
import type { ReactNode } from 'react';
import { Cabecalho } from '../componentes/Cabecalho';
import { metadadosDaMarca } from '../metadados';
import { origemDoSite } from '../origem';
import '@lumens/marca/tokens.css';
import '@lumens/marca/fluxo.css';
import './globals.css';

// As fontes são locais, não `next/font/google`: aquele baixa os arquivos de
// fonts.gstatic.com durante o build, e uma falha de rede no runner quebra o
// `check` — que hoje é pré-requisito do `deploy`. Ver src/fontes/README.md.
//
// Geist em tudo (SCRUM-374): pesos finos nos títulos grandes e nos números, 400 a 500 no texto. Um
// arquivo variável só (100 a 900, 29 KB), menor que as duas famílias de antes juntas (97 KB). O
// `--fonte-corpo` aponta para a mesma família, no globals.css.
const geist = localFont({
  src: '../fontes/geist-latin-var.woff2',
  weight: '100 900',
  display: 'swap',
  variable: '--fonte-titulo',
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
    <html lang="pt-BR" className={geist.variable}>
      <body>
        <Cabecalho />
        {children}
      </body>
    </html>
  );
}
