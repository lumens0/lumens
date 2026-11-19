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
