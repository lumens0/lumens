import { describe, expect, it } from 'vitest';
import { listarModelosNaMeta } from './situacao-modelos';

const modelo = (name: string) => ({
  id: `id-${name}`,
  name,
  status: 'APPROVED',
  category: 'UTILITY',
  language: 'pt_BR',
});

/** `fetch` falso: responde as páginas na ordem e guarda o que foi pedido. */
function fetchFalso(paginas: { status?: number; corpo: unknown }[]) {
  const chamadas: { url: string; autorizacao: string | null }[] = [];
  const buscar = ((entrada: string | URL | Request, init?: RequestInit) => {
    const url = entrada instanceof Request ? entrada.url : entrada.toString();
    chamadas.push({ url, autorizacao: new Headers(init?.headers).get('authorization') });
    const pagina = paginas[chamadas.length - 1] ?? { corpo: { data: [] } };
    return Promise.resolve(
      new Response(JSON.stringify(pagina.corpo), { status: pagina.status ?? 200 }),
    );
  }) as typeof fetch;
  return { buscar, chamadas };
}

const OPCOES = { waba: 'WABA', token: 'tok', versao: 'v23.0' };
const SEGUNDA = 'https://graph.facebook.com/v23.0/WABA/message_templates?after=CURSOR';

describe('listarModelosNaMeta', () => {
  it('modelo que só aparece na segunda página é encontrado', async () => {
    const { buscar, chamadas } = fetchFalso([
      { corpo: { data: [modelo('outro_modelo')], paging: { next: SEGUNDA } } },
      { corpo: { data: [modelo('lumens_conferencia')], paging: {} } },
    ]);

    const modelos = await listarModelosNaMeta({ ...OPCOES, fetch: buscar });

    expect(modelos.map((m) => m.name)).toEqual(['outro_modelo', 'lumens_conferencia']);
    expect(chamadas).toEqual([
      {
        url: 'https://graph.facebook.com/v23.0/WABA/message_templates?fields=id,name,status,category,language&limit=200',
        autorizacao: 'Bearer tok',
      },
      { url: SEGUNDA, autorizacao: 'Bearer tok' },
    ]);
  });

  it('conta sem modelos devolve lista vazia, numa chamada só', async () => {
    const { buscar, chamadas } = fetchFalso([{ corpo: { data: [] } }]);
    expect(await listarModelosNaMeta({ ...OPCOES, fetch: buscar })).toEqual([]);
    expect(chamadas).toHaveLength(1);
  });

  it('erro numa página posterior não vira lista parcial', async () => {
    const { buscar } = fetchFalso([
      { corpo: { data: [modelo('lumens_meta_batida')], paging: { next: SEGUNDA } } },
      { status: 500, corpo: { error: 'fora do ar' } },
    ]);
    await expect(listarModelosNaMeta({ ...OPCOES, fetch: buscar })).rejects.toThrow('HTTP 500');
  });

  it('paginação que nunca termina é erro, não lista cortada', async () => {
    const semFim = { corpo: { data: [modelo('x')], paging: { next: SEGUNDA } } };
    const { buscar } = fetchFalso(Array.from({ length: 60 }, () => semFim));
    await expect(listarModelosNaMeta({ ...OPCOES, fetch: buscar })).rejects.toThrow('páginas');
  });
});
