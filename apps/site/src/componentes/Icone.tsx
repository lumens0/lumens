/*
 * Ícones de linha copiados do Lucide (https://lucide.dev), só os que o site usa: um conjunto, um
 * traço (1,5) e a cor do texto em volta. Sem dependência nova para 18 desenhos.
 *
 * ISC License. Copyright (c) for portions of Lucide are held by Cole Bemis 2013-2022 as part of
 * Feather (MIT). All other copyright (c) for Lucide are held by Lucide Contributors 2022.
 * Permission to use, copy, modify, and/or distribute this software for any purpose with or without
 * fee is hereby granted, provided that the above copyright notice and this permission notice appear
 * in all copies. THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES WITH
 * REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS. IN NO
 * EVENT SHALL THE AUTHOR BE LIABLE FOR ANY SPECIAL, DIRECT, INDIRECT, OR CONSEQUENTIAL DAMAGES OR
 * ANY DAMAGES WHATSOEVER RESULTING FROM LOSS OF USE, DATA OR PROFITS, WHETHER IN AN ACTION OF
 * CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION, ARISING OUT OF OR IN CONNECTION WITH THE USE OR
 * PERFORMANCE OF THIS SOFTWARE.
 */
import type { StatusPublico } from '@lumens/contratos';

type Forma =
  | readonly ['path', string]
  | readonly ['circle', number, number, number]
  | readonly ['rect', number, number, number, number];

const DESENHOS = {
  flag: [
    ['path', 'M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z'],
    ['path', 'M4 22v-7'],
  ],
  apoio: [
    ['path', 'M11 14h2a2 2 0 1 0 0-4h-3c-.6 0-1.1.2-1.4.6L3 16'],
    [
      'path',
      'm7 20 1.6-1.4c.3-.4.8-.6 1.4-.6h4c1.1 0 2.1-.4 2.8-1.2l4.6-4.4a2 2 0 0 0-2.75-2.91l-4.2 3.9',
    ],
    ['path', 'm2 15 6 6'],
    [
      'path',
      'M19.5 8.5c.7-.7 1.5-1.6 1.5-2.7A2.73 2.73 0 0 0 16 4a2.78 2.78 0 0 0-5 1.8c0 1.2.8 2 1.5 2.8L16 12Z',
    ],
  ],
  trofeu: [
    ['path', 'M6 9H4.5a2.5 2.5 0 0 1 0-5H6'],
    ['path', 'M18 9h1.5a2.5 2.5 0 0 0 0-5H18'],
    ['path', 'M4 22h16'],
    ['path', 'M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22'],
    ['path', 'M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22'],
    ['path', 'M18 2H6v7a6 6 0 0 0 12 0V2Z'],
  ],
  pessoas: [
    ['path', 'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2'],
    ['circle', 9, 7, 4],
    ['path', 'M22 21v-2a4 4 0 0 0-3-3.87'],
    ['path', 'M16 3.13a4 4 0 0 1 0 7.75'],
  ],
  alvo: [
    ['circle', 12, 12, 10],
    ['circle', 12, 12, 6],
    ['circle', 12, 12, 2],
  ],
  megafone: [
    ['path', 'm3 11 18-5v12L3 14v-3z'],
    ['path', 'M11.6 16.8a3 3 0 1 1-5.8-1.6'],
  ],
  acordo: [
    ['path', 'm11 17 2 2a1 1 0 1 0 3-3'],
    [
      'path',
      'm14 14 2.5 2.5a1 1 0 1 0 3-3l-3.88-3.88a3 3 0 0 0-4.24 0l-.88.88a1 1 0 1 1-3-3l2.81-2.81a5.79 5.79 0 0 1 7.06-.87l.47.28a2 2 0 0 0 1.42.25L21 4',
    ],
    ['path', 'm21 3 1 11h-2'],
    ['path', 'M3 3 2 14l6.5 6.5a1 1 0 1 0 3-3'],
    ['path', 'M3 4h8'],
  ],
  caixaAberta: [
    ['path', 'M12 22v-9'],
    [
      'path',
      'M15.17 2.21a1.67 1.67 0 0 1 1.63 0L21 4.57a1.93 1.93 0 0 1 0 3.36L8.82 14.79a1.655 1.655 0 0 1-1.64 0L3 12.43a1.93 1.93 0 0 1 0-3.36z',
    ],
    [
      'path',
      'M20 13v3.87a2.06 2.06 0 0 1-1.11 1.83l-6 3.08a1.93 1.93 0 0 1-1.78 0l-6-3.08A2.06 2.06 0 0 1 4 16.87V13',
    ],
    [
      'path',
      'M21 12.43a1.93 1.93 0 0 0 0-3.36L8.83 2.2a1.64 1.64 0 0 0-1.63 0L3 4.57a1.93 1.93 0 0 0 0 3.36l12.18 6.86a1.636 1.636 0 0 0 1.63 0z',
    ],
  ],
  circuloX: [
    ['circle', 12, 12, 10],
    ['path', 'm15 9-6 6'],
    ['path', 'm9 9 6 6'],
  ],
  local: [
    [
      'path',
      'M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0',
    ],
    ['circle', 12, 10, 3],
  ],
  etiqueta: [
    [
      'path',
      'M12.586 2.586A2 2 0 0 0 11.172 2H4a2 2 0 0 0-2 2v7.172a2 2 0 0 0 .586 1.414l8.704 8.704a2.426 2.426 0 0 0 3.42 0l6.58-6.58a2.426 2.426 0 0 0 0-3.42z',
    ],
    ['circle', 7.5, 7.5, 0.5],
  ],
  calendario: [
    ['path', 'M21 7.5V6a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h3.5'],
    ['path', 'M16 2v4'],
    ['path', 'M8 2v4'],
    ['path', 'M3 10h5'],
    ['path', 'M17.5 17.5 16 16.3V14'],
    ['circle', 16, 16, 6],
  ],
  conversa: [['path', 'M7.9 20A9 9 0 1 0 4 16.1L2 22Z']],
  anterior: [['path', 'm15 18-6-6 6-6']],
  proxima: [['path', 'm9 18 6-6-6-6']],
  lista: [
    ['path', 'M3 12h.01'],
    ['path', 'M3 18h.01'],
    ['path', 'M3 6h.01'],
    ['path', 'M8 12h13'],
    ['path', 'M8 18h13'],
    ['path', 'M8 6h13'],
  ],
  fechar: [
    ['path', 'M18 6 6 18'],
    ['path', 'm6 6 12 12'],
  ],
  abrir: [
    ['path', 'M7 7h10v10'],
    ['path', 'M7 17 17 7'],
  ],
  mapa: [
    [
      'path',
      'M14.106 5.553a2 2 0 0 0 1.788 0l3.659-1.83A1 1 0 0 1 21 4.619v12.764a1 1 0 0 1-.553.894l-4.553 2.277a2 2 0 0 1-1.788 0l-4.212-2.106a2 2 0 0 0-1.788 0l-3.659 1.83A1 1 0 0 1 3 19.381V6.618a1 1 0 0 1 .553-.894l4.553-2.277a2 2 0 0 1 1.788 0z',
    ],
    ['path', 'M15 5.764v15'],
    ['path', 'M9 3.236v15'],
  ],
  grade: [
    ['rect', 3, 3, 7, 7],
    ['rect', 14, 3, 7, 7],
    ['rect', 14, 14, 7, 7],
    ['rect', 3, 14, 7, 7],
  ],
  grafico: [
    ['path', 'M3 3v16a2 2 0 0 0 2 2h16'],
    ['path', 'M18 17V9'],
    ['path', 'M13 17V5'],
    ['path', 'M8 17v-3'],
  ],
  lampada: [
    [
      'path',
      'M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5',
    ],
    ['path', 'M9 18h6'],
    ['path', 'M10 22h4'],
  ],
  atividade: [
    [
      'path',
      'M22 12h-2.48a2 2 0 0 0-1.93 1.46l-2.35 8.36a.25.25 0 0 1-.48 0L9.24 2.18a.25.25 0 0 0-.48 0l-2.35 8.36A2 2 0 0 1 4.49 12H2',
    ],
  ],
  vistoSelo: [
    [
      'path',
      'M3.85 8.62a4 4 0 0 1 4.78-4.77 4 4 0 0 1 6.74 0 4 4 0 0 1 4.78 4.78 4 4 0 0 1 0 6.74 4 4 0 0 1-4.77 4.78 4 4 0 0 1-6.75 0 4 4 0 0 1-4.78-4.77 4 4 0 0 1 0-6.76Z',
    ],
    ['path', 'm9 12 2 2 4-4'],
  ],
  relato: [
    ['path', 'M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z'],
    ['path', 'M13 8H7'],
    ['path', 'M17 12H7'],
  ],
  rota: [
    ['circle', 6, 19, 3],
    ['path', 'M9 19h8.5a3.5 3.5 0 0 0 0-7h-11a3.5 3.5 0 0 1 0-7H15'],
    ['circle', 18, 5, 3],
  ],
  documento: [
    ['path', 'M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z'],
    ['path', 'M14 2v4a2 2 0 0 0 2 2h4'],
    ['path', 'M10 9H8'],
    ['path', 'M16 13H8'],
    ['path', 'M16 17H8'],
  ],
  predioPublico: [
    ['path', 'M3 22h18'],
    ['path', 'M6 18v-7'],
    ['path', 'M10 18v-7'],
    ['path', 'M14 18v-7'],
    ['path', 'M18 18v-7'],
    ['path', 'm12 2 8 5H4Z'],
  ],
  escudo: [
    [
      'path',
      'M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z',
    ],
    ['path', 'm9 12 2 2 4-4'],
  ],
  olho: [
    [
      'path',
      'M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0',
    ],
    ['circle', 12, 12, 3],
  ],
  lapis: [
    [
      'path',
      'M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z',
    ],
    ['path', 'm15 5 4 4'],
  ],
  busca: [
    ['circle', 11, 11, 8],
    ['path', 'm21 21-4.3-4.3'],
  ],
  email: [
    ['rect', 2, 4, 20, 16],
    ['path', 'm22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7'],
  ],
  camera: [
    [
      'path',
      'M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z',
    ],
    ['circle', 12, 13, 3],
  ],
  qr: [
    ['rect', 3, 3, 5, 5],
    ['rect', 16, 3, 5, 5],
    ['rect', 3, 16, 5, 5],
    ['path', 'M21 16h-3a2 2 0 0 0-2 2v3'],
    ['path', 'M21 21v.01'],
    ['path', 'M12 7v3a2 2 0 0 1-2 2H7'],
    ['path', 'M3 12h.01'],
    ['path', 'M12 3h.01'],
    ['path', 'M12 16v.01'],
    ['path', 'M16 12h1'],
    ['path', 'M21 12v.01'],
    ['path', 'M12 21v-1'],
  ],
  enviar: [
    [
      'path',
      'M14.536 21.686a.5.5 0 0 0 .937-.024l6.5-19a.496.496 0 0 0-.635-.635l-19 6.5a.5.5 0 0 0-.024.937l7.93 3.18a2 2 0 0 1 1.112 1.11z',
    ],
    ['path', 'm21.854 2.147-10.94 10.939'],
  ],
  sino: [
    ['path', 'M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9'],
    ['path', 'M10.3 21a1.94 1.94 0 0 0 3.4 0'],
  ],
  visto: [['path', 'M20 6 9 17l-5-5']],
  relogio: [
    ['circle', 12, 12, 10],
    ['path', 'M12 6v6l4 2'],
  ],
  mao: [
    ['path', 'M18 11V6a2 2 0 0 0-2-2 2 2 0 0 0-2 2'],
    ['path', 'M14 10V4a2 2 0 0 0-2-2 2 2 0 0 0-2 2v2'],
    ['path', 'M10 10.5V6a2 2 0 0 0-2-2 2 2 0 0 0-2 2v8'],
    [
      'path',
      'M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-5.99-2.34l-3.6-3.6a2 2 0 0 1 2.83-2.82L7 15',
    ],
  ],
  mira: [
    ['path', 'M2 12h3'],
    ['path', 'M19 12h3'],
    ['path', 'M12 2v3'],
    ['path', 'M12 19v3'],
    ['circle', 12, 12, 7],
    ['circle', 12, 12, 3],
  ],
  girarEsquerda: [
    ['path', 'M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8'],
    ['path', 'M3 3v5h5'],
  ],
  girarDireita: [
    ['path', 'M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8'],
    ['path', 'M21 3v5h-5'],
  ],
  mais: [
    ['path', 'M5 12h14'],
    ['path', 'M12 5v14'],
  ],
  menos: [['path', 'M5 12h14']],
  camadas: [
    [
      'path',
      'm12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83Z',
    ],
    ['path', 'm22 17.65-9.17 4.16a2 2 0 0 1-1.66 0L2 17.65'],
    ['path', 'm22 12.65-9.17 4.16a2 2 0 0 1-1.66 0L2 12.65'],
  ],
} satisfies Record<string, readonly Forma[]>;

export type NomeDoIcone = keyof typeof DESENHOS;

/** O ícone de cada etapa pública: o mesmo no carrossel, nos filtros e na lista. */
export const ICONE_DA_ETAPA: Record<StatusPublico, NomeDoIcone> = {
  juntando_apoios: 'pessoas',
  meta_batida: 'alvo',
  cobrando: 'megafone',
  prometido: 'acordo',
  entregue_em_parte: 'caixaAberta',
  descumprida: 'circuloX',
  conquistada: 'trofeu',
};

/** Ícone decorativo: o texto ao lado diz o que ele quer dizer, então o leitor de tela pula. */
export function Icone({ nome, className }: { nome: NomeDoIcone; className?: string | undefined }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      width="18"
      height="18"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {(DESENHOS[nome] as readonly Forma[]).map((forma, i) =>
        forma[0] === 'path' ? (
          <path key={i} d={forma[1]} />
        ) : forma[0] === 'circle' ? (
          <circle key={i} cx={forma[1]} cy={forma[2]} r={forma[3]} />
        ) : (
          <rect key={i} x={forma[1]} y={forma[2]} width={forma[3]} height={forma[4]} rx="1" />
        ),
      )}
    </svg>
  );
}
