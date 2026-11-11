import { describe, expect, it } from 'vitest';
import { criarLogger } from '../../infra/logger';
import { montarMensagemModelo } from './mensagem-modelo';
import { ErroDaMeta, graphSender, logModeloSender, VERSAO_GRAPH } from './sender';

const MENSAGEM = montarMensagemModelo(
  {
    tipo: 'meta_batida',
    aviso: 'pauta-1',
    modelo: 'lumens_meta_batida',
    parametros: ['Bebedouro', '120', 'bebedouro'],
  },
  '5582999990000',
);

/** fetch falso que guarda a chamada e responde com `status` e `corpo`. */
function fetchFalso(status: number, corpo: unknown) {
  const chamadas: { url: string; init: RequestInit }[] = [];
  // O graphSender sempre chama com a URL em string e o corpo em JSON.
  const fn: typeof fetch = (url, init) => {
    chamadas.push({ url: url as string, init: init ?? {} });
    return Promise.resolve(new Response(JSON.stringify(corpo), { status }));
  };
  return { fn, chamadas };
}

const erroDa = (codigo: number) => ({ error: { code: codigo, message: 'erro da Meta' } });

async function falhaDo(sender: ReturnType<typeof graphSender>): Promise<ErroDaMeta> {
  try {
    await sender.enviar(MENSAGEM);
  } catch (erro) {
    if (erro instanceof ErroDaMeta) return erro;
    throw erro;
  }
  throw new Error('devia ter falhado');
}

describe('graphSender', () => {
  it('manda para o número do bot com o token, e devolve o wamid', async () => {
    const { fn, chamadas } = fetchFalso(200, { messages: [{ id: 'wamid.ABC' }] });
    const sender = graphSender({ token: 'tok', phoneNumberId: '123', fetch: fn });

    expect(await sender.enviar(MENSAGEM)).toEqual({ wamid: 'wamid.ABC' });
    expect(chamadas[0]?.url).toBe(`https://graph.facebook.com/${VERSAO_GRAPH}/123/messages`);
    expect(new Headers(chamadas[0]?.init.headers).get('authorization')).toBe('Bearer tok');
    expect(JSON.parse(chamadas[0]?.init.body as string)).toEqual(MENSAGEM);
  });

  it.each([
    [131026, 'número sem WhatsApp'],
    [131030, 'fora da lista do número de teste'],
    [132000, 'parâmetros não batem com o modelo'],
  ])('%i (%s) é permanente: o disparo sai da fila', async (codigo) => {
    const erro = await falhaDo(
      graphSender({ token: 't', phoneNumberId: '1', fetch: fetchFalso(400, erroDa(codigo)).fn }),
    );

    expect(erro).toMatchObject({ codigo, permanente: true, pararLote: false });
  });

  it.each([
    [130429, 'limite de vazão'],
    [190, 'token inválido'],
  ])('%i (%s) para o lote inteiro', async (codigo) => {
    const erro = await falhaDo(
      graphSender({ token: 't', phoneNumberId: '1', fetch: fetchFalso(400, erroDa(codigo)).fn }),
    );

    expect(erro).toMatchObject({ permanente: false, pararLote: true });
  });

  it('modelo ainda não aprovado (132001) é passageiro: espera na fila', async () => {
    const erro = await falhaDo(
      graphSender({ token: 't', phoneNumberId: '1', fetch: fetchFalso(404, erroDa(132001)).fn }),
    );

    expect(erro).toMatchObject({ permanente: false, pararLote: false });
  });

  it('falha de rede é passageira e para o lote', async () => {
    const fn = (() => Promise.reject(new Error('ECONNRESET'))) as typeof fetch;

    const erro = await falhaDo(graphSender({ token: 't', phoneNumberId: '1', fetch: fn }));

    expect(erro).toMatchObject({ codigo: null, permanente: false, pararLote: true });
  });

  it('resposta 200 sem wamid não conta como enviada', async () => {
    const erro = await falhaDo(
      graphSender({ token: 't', phoneNumberId: '1', fetch: fetchFalso(200, {}).fn }),
    );

    expect(erro.permanente).toBe(false);
  });
});

describe('logModeloSender', () => {
  it('devolve um wamid de mentira para a fila andar no dev', async () => {
    const { wamid } = await logModeloSender(criarLogger('silent')).enviar(MENSAGEM);

    expect(wamid).toMatch(/^dev\./);
  });
});
