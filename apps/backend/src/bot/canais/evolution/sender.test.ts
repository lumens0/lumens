import { describe, expect, it } from 'vitest';
import { cifrar, type Chaves } from '../../../cripto/cifra';
import { lista } from '../../conversation/resposta';
import { renderizarAviso } from '../../envio/aviso';
import type { OutgoingReplies } from '../../worker';
import { DICA_DO_MENU } from '../menu-em-texto';
import { ABERTURAS, avisosPelaEvolution, textoDoAviso } from './avisos';
import { criarCliente, ErroDaEvolution } from './cliente';
import { respostasPelaEvolution, tempoDigitando } from './respostas';

const chaves: Chaves = { cifra: Buffer.alloc(32, 3), hmac: Buffer.alloc(32, 4) };
const PHONE = '5582988887777';

interface Chamada {
  url: string;
  headers: Headers;
  corpo: Record<string, unknown>;
}

/** fetch falso: responde em sequência; `Error` simula falha de rede. */
function fetchFalso(respostas: ({ status: number; corpo: unknown } | Error)[]) {
  const chamadas: Chamada[] = [];
  let i = 0;
  const fn: typeof fetch = (url, init) => {
    chamadas.push({
      url: url as string,
      headers: new Headers(init?.headers),
      corpo: JSON.parse((init?.body as string | undefined) ?? '{}') as Record<string, unknown>,
    });
    const resposta = respostas[Math.min(i++, respostas.length - 1)];
    if (resposta === undefined || resposta instanceof Error) {
      return Promise.reject(resposta ?? new Error('sem resposta'));
    }
    return Promise.resolve(
      new Response(JSON.stringify(resposta.corpo), { status: resposta.status }),
    );
  };
  return { fn, chamadas };
}

const ENVIADA = { status: 201, corpo: { key: { id: '3EB0ENVIADA' } } };

const cliente = (fn: typeof fetch) =>
  criarCliente({ url: 'http://evolution:8080/', apiKey: 'chave', instancia: 'lumens', fetch: fn });

async function erroDe(promessa: Promise<unknown>): Promise<ErroDaEvolution> {
  try {
    await promessa;
  } catch (erro) {
    if (erro instanceof ErroDaEvolution) return erro;
    throw erro;
  }
  throw new Error('devia ter falhado');
}

describe('cliente da Evolution', () => {
  it('chama a rota da instância com a apikey', async () => {
    const { fn, chamadas } = fetchFalso([ENVIADA]);
    expect(await cliente(fn)('/message/sendText', { a: 1 })).toEqual(ENVIADA.corpo);
    expect(chamadas[0]?.url).toBe('http://evolution:8080/message/sendText/lumens');
    expect(chamadas[0]?.headers.get('apikey')).toBe('chave');
  });

  it.each([
    [
      'número sem WhatsApp',
      { status: 400, corpo: { response: { message: [{ exists: false, number: PHONE }] } } },
      { codigo: 'numero_inexistente', permanente: true, pararLote: false },
    ],
    [
      'pedido recusado',
      { status: 400, corpo: { response: { message: ['text is required'] } } },
      { codigo: 400, permanente: true, pararLote: false },
    ],
    [
      'instância desconectada',
      { status: 400, corpo: { response: { message: ['Connection Closed'] } } },
      { codigo: 'desconectada', permanente: false, pararLote: true },
    ],
    [
      'apikey errada',
      { status: 401, corpo: {} },
      { codigo: 401, permanente: false, pararLote: true },
    ],
    [
      'Evolution fora do ar',
      { status: 502, corpo: {} },
      { codigo: 502, permanente: false, pararLote: true },
    ],
  ])('%s', async (_caso, resposta, esperado) => {
    const erro = await erroDe(cliente(fetchFalso([resposta]).fn)('/message/sendText', {}));
    expect(erro).toMatchObject(esperado);
    expect(erro.motivo).toBe('evolution:' + String(esperado.codigo));
    // A Evolution devolve o número na resposta de erro; ele não pode ir para o log.
    expect(erro.message).not.toContain(PHONE);
  });

  it('falha de rede para o lote', async () => {
    const erro = await erroDe(cliente(fetchFalso([new Error('ECONNREFUSED')]).fn)('/x', {}));
    expect(erro).toMatchObject({ codigo: null, permanente: false, pararLote: true });
  });
});

describe('respostas pela Evolution', () => {
  const job = (respostas: unknown[]): OutgoingReplies => ({
    phoneHmac: 'h',
    phoneCifrado: cifrar(PHONE, chaves.cifra),
    phoneNumberId: 'lumens',
    wamidHmac: 'w',
    repliesCifradas: cifrar(JSON.stringify(respostas), chaves.cifra),
  });

  it('manda cada resposta em ordem, para o telefone decifrado, com "digitando" e sem prévia de link', async () => {
    const { fn, chamadas } = fetchFalso([ENVIADA]);
    const menu = lista({
      corpo: 'Escolha:',
      botao: 'Opções',
      linhas: [
        { id: 'a', titulo: 'Primeira' },
        { id: 'b', titulo: 'Segunda' },
      ],
    });

    await respostasPelaEvolution(cliente(fn), chaves).send(job(['Olá!', menu]));

    expect(chamadas.map((c) => c.corpo)).toEqual([
      { number: PHONE, text: 'Olá!', delay: tempoDigitando('Olá!'), linkPreview: false },
      {
        number: PHONE,
        text: ['Escolha:', '', '*1.* Primeira', '*2.* Segunda', '', DICA_DO_MENU].join('\n'),
        delay: expect.any(Number) as number,
        linkPreview: false,
      },
    ]);
  });

  const CARD = { tipo: 'imagem', url: 'https://lumens.exemplo/card.png', legenda: 'Veja a pauta' };

  it('o card da pauta vai como imagem, pelo link, com a legenda', async () => {
    const { fn, chamadas } = fetchFalso([ENVIADA]);

    await respostasPelaEvolution(cliente(fn), chaves).send(job([CARD]));

    expect(chamadas[0]?.url).toBe('http://evolution:8080/message/sendMedia/lumens');
    expect(chamadas[0]?.corpo).toMatchObject({
      number: PHONE,
      mediatype: 'image',
      media: CARD.url,
      caption: CARD.legenda,
    });
  });

  it('se a imagem falhar, vai a legenda em texto (ela leva o link)', async () => {
    const { fn, chamadas } = fetchFalso([{ status: 400, corpo: {} }, ENVIADA]);

    await respostasPelaEvolution(cliente(fn), chaves).send(job([CARD]));

    expect(chamadas.map((c) => c.url)).toEqual([
      'http://evolution:8080/message/sendMedia/lumens',
      'http://evolution:8080/message/sendText/lumens',
    ]);
    expect(chamadas[1]?.corpo).toMatchObject({ text: CARD.legenda, linkPreview: false });
  });

  it('falha no envio sobe para o retry do worker', async () => {
    const { fn } = fetchFalso([{ status: 500, corpo: {} }]);
    await expect(respostasPelaEvolution(cliente(fn), chaves).send(job(['oi']))).rejects.toThrow(
      ErroDaEvolution,
    );
  });

  it('"digitando" fica entre 1 e 4 segundos', () => {
    expect(tempoDigitando('')).toBe(1_000);
    expect(tempoDigitando('x'.repeat(5_000))).toBe(4_000);
  });
});

describe('avisos pela Evolution', () => {
  const AVISO = renderizarAviso({
    tipo: 'conferencia',
    aviso: 'promessa-1',
    modelo: 'lumens_conferencia',
    parametros: ['Bebedouro', '15/10/2026', 'trocar o bebedouro', '22/10/2026'],
  });

  it('o texto do aviso: corpo do catálogo, respostas rápidas digitáveis e o rodapé', () => {
    const texto = textoDoAviso(AVISO, 'https://lumens.exemplo');
    expect(texto.startsWith('A pauta "Bebedouro", que você apoiou')).toBe(true);
    expect(texto).toContain('Responda *Sim*, *Em parte* ou *Não*.');
    expect(texto.endsWith('_Lumens · pautas estudantis da UFAL_')).toBe(true);
    expect(texto).not.toContain('{{');
  });

  it('o botão de link vira o endereço da pauta', () => {
    const metaBatida = renderizarAviso({
      tipo: 'meta_batida',
      aviso: 'pauta-1',
      modelo: 'lumens_meta_batida',
      parametros: ['Bebedouro', '120', 'bebedouro-quebrado'],
    });
    expect(textoDoAviso(metaBatida, 'https://lumens.exemplo')).toContain(
      'Ver a pauta: https://lumens.exemplo/p/bebedouro-quebrado',
    );
  });

  it('telefone ilegível tira o aviso da fila sem chamar a Evolution', async () => {
    const { fn, chamadas } = fetchFalso([ENVIADA]);
    const sender = avisosPelaEvolution(cliente(fn), { intervaloMinMs: 0, intervaloMaxMs: 0 });
    await expect(sender.enviar(AVISO, 'abc')).rejects.toMatchObject({
      motivo: 'telefone_ilegivel',
      permanente: true,
    });
    expect(chamadas).toEqual([]);
  });

  function relogio() {
    let agora = 1_000_000;
    const esperas: number[] = [];
    return {
      esperas,
      agora: () => agora,
      esperar: (ms: number) => {
        esperas.push(ms);
        agora += ms;
        return Promise.resolve();
      },
      passar: (ms: number) => {
        agora += ms;
      },
    };
  }

  it('manda o texto do modelo e devolve o id da mensagem como wamid', async () => {
    const { fn, chamadas } = fetchFalso([ENVIADA]);
    const r = relogio();
    const sender = avisosPelaEvolution(cliente(fn), {
      intervaloMinMs: 20_000,
      intervaloMaxMs: 45_000,
      aleatorio: () => 0,
      ...r,
    });

    expect(await sender.enviar(AVISO, PHONE)).toEqual({ id: '3EB0ENVIADA', entregue: false });
    const corpo = chamadas[0]?.corpo;
    expect(corpo).toMatchObject({ number: PHONE, linkPreview: false });
    expect(corpo?.text).toContain('A pauta "Bebedouro", que você apoiou');
    expect(corpo?.text).toContain('Responda *Sim*, *Em parte* ou *Não*.');
    expect(r.esperas).toEqual([]);
  });

  it('espera um intervalo aleatório entre o mínimo e o máximo desde o aviso anterior', async () => {
    const { fn } = fetchFalso([ENVIADA]);
    const r = relogio();
    let sorteio = 0.5;
    const sender = avisosPelaEvolution(cliente(fn), {
      intervaloMinMs: 20_000,
      intervaloMaxMs: 40_000,
      aleatorio: () => sorteio,
      ...r,
    });

    await sender.enviar(AVISO, PHONE);
    r.passar(5_000);
    await sender.enviar(AVISO, PHONE);
    sorteio = 0;
    r.passar(60_000);
    await sender.enviar(AVISO, PHONE);

    // 30 s sorteados, 5 s já passados: espera 25 s. No terceiro, já passou mais que o mínimo.
    expect(r.esperas).toEqual([25_000]);
  });

  it('a abertura varia com o sorteio, e o corpo continua o mesmo', async () => {
    const textos: string[] = [];
    for (const sorteio of [0, 0.99]) {
      const { fn, chamadas } = fetchFalso([ENVIADA]);
      await avisosPelaEvolution(cliente(fn), {
        intervaloMinMs: 0,
        intervaloMaxMs: 0,
        aleatorio: () => sorteio,
        ...relogio(),
      }).enviar(AVISO, PHONE);
      textos.push(String(chamadas[0]?.corpo.text));
    }
    expect(textos[0]).not.toBe(textos[1]);
    expect(textos[1]?.startsWith(`${ABERTURAS.at(-1) ?? ''}\n\n`)).toBe(true);
    expect(textos[1]?.endsWith(textos[0] ?? '')).toBe(true);
  });

  it('resposta sem o id da mensagem para o lote', async () => {
    const { fn } = fetchFalso([{ status: 201, corpo: {} }]);
    const erro = await erroDe(
      avisosPelaEvolution(cliente(fn), {
        intervaloMinMs: 0,
        intervaloMaxMs: 0,
        ...relogio(),
      }).enviar(AVISO, PHONE),
    );
    expect(erro.pararLote).toBe(true);
  });
});
