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

/**
 * Aspas só onde precisa, dobrando as que já existem (RFC 4180). Texto que começa como fórmula
 * (`=`, `+`, `-`, `@`, tab ou CR) ganha um `'` na frente: o título vem de estudante, e o Excel e o
 * Sheets executariam a fórmula ao abrir o arquivo.
 */
function campo(valor: string | number | null): string {
  const bruto = valor === null ? '' : String(valor);
  const texto = typeof valor === 'string' && /^[=+\-@\t\r]/.test(bruto) ? `'${bruto}` : bruto;
  return /[;"\r\n]/.test(texto) ? `"${texto.replaceAll('"', '""')}"` : texto;
}

/** Só a data (AAAA-MM-DD), no fuso de Maceió: é o dia que aparece no site. */
const dia = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Maceio' });
const data = (instante: string | null | undefined) =>
  instante ? dia.format(new Date(instante)) : null;

/**
 * `origem` é a do site (`origemDoSite`): o endereço sai absoluto, porque o arquivo é usado longe do
 * site e um `/p/<slug>` sozinho não diz de onde é.
 */
export function gerarCsv(pautas: readonly Pauta[], origem: URL): string {
  const linhas = pautas.map((p) =>
    [
      p.titulo,
      new URL(`/p/${p.slug}`, origem).href,
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
