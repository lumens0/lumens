import type { PautaDetalhe } from '@lumens/contratos';

/** Pauta pública de teste, no formato de GET /pautas/:slug. */
export const fixture: PautaDetalhe = {
  slug: 'iluminacao-no-bloco-de-artes',
  titulo: 'Iluminação no entorno do Bloco de Artes',
  descricao: 'Trocar luminárias apagadas.',
  categoria: 'seguranca',
  status: 'cobrando',
  meta: 80,
  apoios: 84,
  bloco_slug: 'artes',
  bloco_nome: 'Bloco de Artes',
  cursos_responsaveis: ['Enfermagem', 'Jornalismo'],
  criada_em: '2026-02-06T12:00:00.000Z',
  aprovada_em: '2026-02-07T12:00:00.000Z',
  meta_batida_em: '2026-02-08T12:00:00.000Z',
  proxima_etapa: null,
  relatos: [
    {
      texto: 'A saída das aulas noturnas fica muito escura.',
      foto_chave: 'relatos/1.jpg',
      curso: 'Pedagogia',
      moderado_em: '2026-02-13T12:00:00.000Z',
    },
    { texto: 'Sem curso informado.', foto_chave: null, curso: null, moderado_em: null },
  ],
  caminhos: [],
  linha_do_tempo: [
    {
      tipo: 'meta_batida',
      dados: {},
      criado_em: '2026-02-08T12:00:00.000Z',
    },
    {
      tipo: 'pauta_aprovada',
      dados: {},
      criado_em: '2026-02-07T12:00:00.000Z',
    },
  ],
};
