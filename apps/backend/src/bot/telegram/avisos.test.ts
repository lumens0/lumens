import { describe, expect, it } from 'vitest';
import { renderizarAviso } from '../envio/aviso';
import { ErroDeEnvio } from '../envio/sender';
import { MODELOS, type NomeModelo } from '../whatsapp/modelos';
import { ErroDaApiDoTelegram } from './api';
import { mensagensDoAviso, telegramAvisoSender } from './avisos';

const ORIGEM = 'https://lumens.exemplo.br';
const CHAT = 4242;
const AVISO = '0b9c1f9e-8d2e-4c39-9a51-2f6f3a1d7c10';

const TIPO: Record<NomeModelo, string> = {
  lumens_meta_batida: 'meta_batida',
  lumens_resposta_oficial: 'resposta_oficial',
  lumens_conferencia: 'conferencia',
  lumens_lembrete_prazo: 'lembrete',
  lumens_owner_inativo: 'lembrete',
  lumens_pauta_recusada: 'recusa',
};

/** O disparo de um modelo com os exemplos do catálogo e, se houver link, o slug de exemplo. */
function disparoDe(nome: NomeModelo) {
  const modelo = MODELOS[nome];
  const slugs = modelo.botoes.flatMap((b) => (b.tipo === 'URL' ? [b.exemploSlug] : []));
  return {
    tipo: TIPO[nome],
    aviso: AVISO,
    modelo: nome,
    parametros: [...modelo.exemplos, ...slugs],
  };
}

describe('mensagensDoAviso: os seis modelos no Telegram', () => {
  const nomes = Object.keys(MODELOS) as NomeModelo[];

  it('cobre os seis modelos do catálogo', () => {
    expect(nomes).toHaveLength(6);
  });

  it.each(nomes)('%s: o texto do catálogo preenchido, o rodapé e os botões', (nome) => {
    const modelo = MODELOS[nome];
    const [envio, ...resto] = mensagensDoAviso(renderizarAviso(disparoDe(nome)), CHAT, ORIGEM);

    expect(resto).toEqual([]);
    expect(envio?.chat_id).toBe(CHAT);
    // Uma fonte só: o corpo do catálogo, com cada {{n}} trocado pelo exemplo n.
    const esperado = modelo.exemplos.reduce(
      (texto, valor, i) => texto.replaceAll(`{{${String(i + 1)}}}`, valor),
      modelo.corpo,
    );
    expect(envio?.text).toBe(`${esperado}\n\n${modelo.rodape}`);
    expect(envio?.text).not.toMatch(/\{\{\d+\}\}/);

    const teclado = envio?.reply_markup?.inline_keyboard ?? [];
    const links = teclado.flat().filter((b) => 'url' in b);
    const respostas = teclado.flat().filter((b) => 'callback_data' in b);
    expect(links).toEqual(
      modelo.botoes.flatMap((b) =>
        b.tipo === 'URL' ? [{ text: b.texto, url: `${ORIGEM}/p/${b.exemploSlug}` }] : [],
      ),
    );
    expect(respostas).toEqual(
      modelo.botoes.flatMap((b, i) =>
        b.tipo === 'QUICK_REPLY'
          ? [{ text: b.texto, callback_data: `${TIPO[nome]}:${AVISO}:${String(i)}` }]
          : [],
      ),
    );
    if (modelo.botoes.length === 0) expect(envio).not.toHaveProperty('reply_markup');
  });

  it('meta batida: o texto exato e o link da pauta', () => {
    const [envio] = mensagensDoAviso(
      renderizarAviso({
        tipo: 'meta_batida',
        aviso: AVISO,
        modelo: 'lumens_meta_batida',
        parametros: ['Bebedouro do bloco 12', '120', 'bebedouro-bloco-12'],
      }),
      CHAT,
      ORIGEM,
    );

    expect(envio).toEqual({
      chat_id: CHAT,
      text:
        'A pauta "Bebedouro do bloco 12", que você apoiou, chegou à meta de 120 apoios. ' +
        'Agora ela segue para os responsáveis na universidade, e você recebe aqui a resposta oficial quando ela chegar.' +
        '\n\nLumens · pautas estudantis da UFAL',
      reply_markup: {
        inline_keyboard: [[{ text: 'Ver a pauta', url: `${ORIGEM}/p/bebedouro-bloco-12` }]],
      },
    });
  });

  it('conferência: as três respostas lado a lado, com o payload do WhatsApp', () => {
    const [envio] = mensagensDoAviso(renderizarAviso(disparoDe('lumens_conferencia')), CHAT);
    expect(envio?.reply_markup?.inline_keyboard).toEqual([
      [
        { text: 'Sim', callback_data: `conferencia:${AVISO}:0` },
        { text: 'Em parte', callback_data: `conferencia:${AVISO}:1` },
        { text: 'Não', callback_data: `conferencia:${AVISO}:2` },
      ],
    ]);
  });

  it('título com *x* sai em negrito, sem asteriscos (limitação conhecida, inofensiva)', () => {
    const [envio] = mensagensDoAviso(
      renderizarAviso({
        tipo: 'recusa',
        aviso: AVISO,
        modelo: 'lumens_pauta_recusada',
        parametros: ['Bebedouro *quebrado*', 'duplicada'],
      }),
      CHAT,
    );
    expect(envio?.text).toContain('"Bebedouro quebrado"');
    expect(envio?.entities).toEqual([
      { type: 'bold', offset: 'A pauta "Bebedouro '.length, length: 'quebrado'.length },
    ]);
  });

  it('título com $& não vira padrão de substituição', () => {
    const { texto } = renderizarAviso({
      tipo: 'recusa',
      aviso: AVISO,
      modelo: 'lumens_pauta_recusada',
      parametros: ['R$& 10', 'motivo $1'],
    });
    expect(texto).toContain('"R$& 10"');
    expect(texto).toContain('Motivo: motivo $1.');
  });
});

/** API falsa: responde pela ordem de `respostas` (message_id ou erro) e guarda as chamadas. */
function apiFalsa(respostas: (number | Error)[]) {
  const chamadas: { metodo: string; parametros: unknown }[] = [];
  return {
    chamadas,
    api: {
      chamar: <T>(metodo: string, parametros?: object): Promise<T> => {
        chamadas.push({ metodo, parametros });
        const r = respostas.shift() ?? 1;
        return r instanceof Error ? Promise.reject(r) : Promise.resolve({ message_id: r } as T);
      },
    },
  };
}

/** Relógio de mentira que só anda quando alguém espera. */
function tempoFalso() {
  let agora = 1_000_000;
  const esperas: number[] = [];
  return {
    esperas,
    relogio: () => agora,
    esperar: (ms: number) => {
      esperas.push(ms);
      agora += ms;
      return Promise.resolve();
    },
  };
}

const aviso = renderizarAviso(disparoDe('lumens_meta_batida'));

describe('telegramAvisoSender', () => {
  it('manda pelo sendMessage e vale como entregue; o id leva o chat e a mensagem', async () => {
    const { api, chamadas } = apiFalsa([777]);
    const sender = telegramAvisoSender({ api, origem: ORIGEM, ...tempoFalso() });

    expect(await sender.enviar(aviso, String(CHAT))).toEqual({
      id: `tg:${String(CHAT)}:777`,
      entregue: true,
    });
    expect(chamadas).toEqual([
      { metodo: 'sendMessage', parametros: mensagensDoAviso(aviso, CHAT, ORIGEM)[0] },
    ]);
  });

  it('403 (bloqueou o bot) é falha permanente deste disparo, sem parar o canal', async () => {
    const { api } = apiFalsa([
      new ErroDaApiDoTelegram('sendMessage', 403, 'Forbidden: bot was blocked by the user'),
    ]);
    const sender = telegramAvisoSender({ api, ...tempoFalso() });

    const erro = await sender.enviar(aviso, String(CHAT)).catch((e: unknown) => e);

    expect(erro).toBeInstanceOf(ErroDeEnvio);
    expect(erro).toMatchObject({
      motivo: 'telegram:403',
      permanente: true,
      pararLote: false,
      // O chat não serve mais: o worker o apaga, e o próximo aviso vai pelo WhatsApp.
      destinoPerdido: true,
    });
  });

  it('400 é falha permanente, mas o chat continua (pode ser defeito da mensagem)', async () => {
    const { api } = apiFalsa([new ErroDaApiDoTelegram('sendMessage', 400, 'Bad Request')]);
    const sender = telegramAvisoSender({ api, ...tempoFalso() });

    const erro = await sender.enviar(aviso, String(CHAT)).catch((e: unknown) => e);

    expect(erro).toMatchObject({ motivo: 'telegram:400', permanente: true, destinoPerdido: false });
  });

  it('429 espera o retry_after e manda a mesma mensagem de novo', async () => {
    const { api, chamadas } = apiFalsa([
      new ErroDaApiDoTelegram('sendMessage', 429, 'Too Many Requests', 3),
      55,
    ]);
    const tempo = tempoFalso();
    const sender = telegramAvisoSender({ api, ...tempo });

    expect((await sender.enviar(aviso, String(CHAT))).id).toBe(`tg:${String(CHAT)}:55`);
    expect(chamadas).toHaveLength(2);
    expect(chamadas[1]).toEqual(chamadas[0]);
    expect(tempo.esperas).toContain(3000);
  });

  it('429 longo demais para o canal neste lote, sem falhar o disparo', async () => {
    const { api } = apiFalsa([new ErroDaApiDoTelegram('sendMessage', 429, 'Too Many', 600)]);
    const sender = telegramAvisoSender({ api, ...tempoFalso() });

    await expect(sender.enviar(aviso, String(CHAT))).rejects.toMatchObject({
      motivo: 'telegram:429',
      permanente: false,
      pararLote: true,
    });
  });

  it('rede fora para o canal; chat id ilegível sai da fila', async () => {
    const semRede = telegramAvisoSender({
      api: apiFalsa([new ErroDaApiDoTelegram('sendMessage', undefined, 'TimeoutError')]).api,
      ...tempoFalso(),
    });
    await expect(semRede.enviar(aviso, String(CHAT))).rejects.toMatchObject({
      permanente: false,
      pararLote: true,
    });

    const { api, chamadas } = apiFalsa([]);
    await expect(
      telegramAvisoSender({ api, ...tempoFalso() }).enviar(aviso, 'não é chat'),
    ).rejects.toMatchObject({ motivo: 'telefone_ilegivel', permanente: true });
    expect(chamadas).toHaveLength(0);
  });

  it('não dispara em rajada: intervalo entre envios e 1 s entre dois para o mesmo chat', async () => {
    const tempo = tempoFalso();
    const sender = telegramAvisoSender({ api: apiFalsa([]).api, ...tempo });

    await sender.enviar(aviso, '1');
    await sender.enviar(aviso, '2');
    await sender.enviar(aviso, '2');

    // Do 1 para o 2: o intervalo geral. Do 2 para o 2 de novo: o que falta para 1 s.
    expect(tempo.esperas).toEqual([40, 1000]);
  });
});
