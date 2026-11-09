import { describe, expect, it } from 'vitest';
import { ErroDeMidia, TAMANHO_MAXIMO_FOTO, VERSAO_GRAPH, baixarMidiaDaMeta } from './meta-midia';

interface Chamada {
  url: string;
  autorizacao: string | null;
}

/** `fetch` falso: a 1ª chamada responde as informações da mídia, a 2ª os bytes. */
function fetchFalso(
  informacoes: { status?: number; corpo?: unknown },
  arquivo: { status?: number; bytes?: Buffer } = {},
) {
  const chamadas: Chamada[] = [];
  const buscar = ((entrada: string | URL | Request, init?: RequestInit) => {
    const url = entrada instanceof Request ? entrada.url : entrada.toString();
    chamadas.push({ url, autorizacao: new Headers(init?.headers).get('authorization') });
    if (chamadas.length === 1) {
      return Promise.resolve(
        new Response(JSON.stringify(informacoes.corpo ?? {}), {
          status: informacoes.status ?? 200,
        }),
      );
    }
    return Promise.resolve(
      new Response(new Uint8Array(arquivo.bytes ?? Buffer.from('imagem')), {
        status: arquivo.status ?? 200,
      }),
    );
  }) as typeof fetch;
  return { buscar, chamadas };
}

const INFO = {
  url: 'https://cdn.meta.example/foto?assinatura=x',
  mime_type: 'image/jpeg',
  file_size: 6,
};

describe('baixarMidiaDaMeta', () => {
  it('pergunta a URL pelo id e baixa os bytes, com o token nas duas chamadas', async () => {
    const { buscar, chamadas } = fetchFalso({ corpo: INFO });
    const midia = await baixarMidiaDaMeta('midia-1', { token: 'tok', fetch: buscar });

    expect(midia).toEqual({ bytes: Buffer.from('imagem'), mimeType: 'image/jpeg' });
    expect(chamadas).toEqual([
      { url: `https://graph.facebook.com/${VERSAO_GRAPH}/midia-1`, autorizacao: 'Bearer tok' },
      { url: INFO.url, autorizacao: 'Bearer tok' },
    ]);
  });

  it('foto maior que 5 MB pelo file_size: nem baixa', async () => {
    const { buscar, chamadas } = fetchFalso({
      corpo: { ...INFO, file_size: TAMANHO_MAXIMO_FOTO + 1 },
    });
    await expect(baixarMidiaDaMeta('m', { token: 't', fetch: buscar })).rejects.toMatchObject({
      motivo: 'tamanho',
    });
    expect(chamadas).toHaveLength(1);
  });

  it('foto maior que 5 MB nos bytes, mesmo com file_size menor', async () => {
    const { buscar } = fetchFalso(
      { corpo: INFO },
      { bytes: Buffer.alloc(TAMANHO_MAXIMO_FOTO + 1) },
    );
    await expect(baixarMidiaDaMeta('m', { token: 't', fetch: buscar })).rejects.toMatchObject({
      motivo: 'tamanho',
    });
  });

  it.each([
    ['a Meta responde erro', { status: 404, corpo: {} }, {}],
    ['a resposta não tem url', { corpo: { mime_type: 'image/jpeg' } }, {}],
    ['o download falha', { corpo: INFO }, { status: 500 }],
  ])('%s: indisponível, sem o token na mensagem', async (_, informacoes, arquivo) => {
    const { buscar } = fetchFalso(informacoes, arquivo);
    const erro: unknown = await baixarMidiaDaMeta('m', { token: 'segredo', fetch: buscar }).catch(
      (e: unknown) => e,
    );
    expect(erro).toBeInstanceOf(ErroDeMidia);
    expect(erro).toMatchObject({ motivo: 'indisponivel' });
    expect((erro as Error).message).not.toContain('segredo');
  });

  it('o id da mídia vai codificado na URL', async () => {
    const { buscar, chamadas } = fetchFalso({ corpo: INFO });
    await baixarMidiaDaMeta('a/b?c', { token: 't', fetch: buscar });
    expect(chamadas[0]?.url).toBe(`https://graph.facebook.com/${VERSAO_GRAPH}/a%2Fb%3Fc`);
  });
});
