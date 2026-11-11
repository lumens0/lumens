import { STATUS } from '../componentes/StatusPill';
import type { Pauta } from './tipos';

/**
 * Dados abertos (RF-S11): uma linha por pauta pública, só com números e campos que o site já
 * mostra. Nada de texto livre (descrição, relatos) nem quem está por trás da pauta.
 *
 * Separado por ponto e vírgula e com BOM: o Excel em português usa a vírgula como decimal e só
 * reconhece os acentos com o BOM; o Google Sheets lê os dois.
 */
const COLUNAS = [
  'pauta',
  'endereco',
  'categoria',
  'bloco',
  'situacao',
  'apoios',
  'meta',
  'criada_em',
  'aprovada_em',
  'meta_batida_em',
] as const;

const BOM = '\uFEFF';

/** Aspas só onde precisa, dobrando as que já existem (RFC 4180). */
function campo(valor: string | number | null): string {
  const texto = valor === null ? '' : String(valor);
  return /[;"\r\n]/.test(texto) ? `"${texto.replaceAll('"', '""')}"` : texto;
}

/** Só a data (AAAA-MM-DD), no fuso de Maceió: é o dia que aparece no site. */
const dia = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Maceio' });
const data = (instante: string | null | undefined) =>
  instante ? dia.format(new Date(instante)) : null;

export function gerarCsv(pautas: readonly Pauta[]): string {
  const linhas = pautas.map((p) =>
    [
      p.titulo,
      `/p/${p.slug}`,
      p.categoria,
      p.bloco_nome ?? 'Todo o campus',
      STATUS[p.status].rotulo,
      p.apoios,
      p.meta,
      data(p.criada_em),
      data(p.aprovada_em),
      data(p.meta_batida_em),
    ]
      .map(campo)
      .join(';'),
  );
  return BOM + [COLUNAS.join(';'), ...linhas].join('\r\n') + '\r\n';
}
