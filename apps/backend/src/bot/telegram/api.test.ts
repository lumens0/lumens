import { describe, expect, it, vi } from 'vitest';
import { classificarErro, criarApiDoTelegram, destinoPerdido, ErroDaApiDoTelegram } from './api';

const TOKEN = '123456:SEGREDO-DO-BOT';

const respostaJson = (corpo: object, status = 200) =>
  new Response(JSON.stringify(corpo), { status, headers: { 'content-type': 'application/json' } });

describe('classificarErro', () => {
  it.each([
    [
      new ErroDaApiDoTelegram('sendMessage', 403, 'Forbidden: bot was blocked by the user'),
      'permanente',
    ],
    [new ErroDaApiDoTelegram('sendMessage', 400, 'Bad Request: chat not found'), 'permanente'],
    [new ErroDaApiDoTelegram('sendMessage', 429, 'Too Many Requests', 5), 'esperar'],
    [new ErroDaApiDoTelegram('sendMessage', 502, 'Bad Gateway'), 'passageiro'],
    [new ErroDaApiDoTelegram('sendMessage', undefined, 'TimeoutError'), 'passageiro'],
    [new Error('qualquer'), 'passageiro'],
  ])('%s → %s', (erro, classe) => {
    expect(classificarErro(erro)).toBe(classe);
  });
});

describe('destinoPerdido', () => {
  it.each([
    [new ErroDaApiDoTelegram('sendMessage', 403, 'Forbidden: user is deactivated'), true],
    [new ErroDaApiDoTelegram('sendMessage', 400, 'Bad Request: chat not found'), true],
    [new ErroDaApiDoTelegram('sendMessage', 400, 'Bad Request: CHAT NOT FOUND'), true],
    [new ErroDaApiDoTelegram('sendMessage', 400, "Bad Request: can't parse entities"), false],
    [new ErroDaApiDoTelegram('sendMessage', 400, ''), false],
    [new ErroDaApiDoTelegram('sendMessage', 429, 'Too Many Requests', 5), false],
    [new ErroDaApiDoTelegram('sendMessage', undefined, 'TimeoutError'), false],
    [new Error('chat not found'), false],
  ])('%s → %s', (erro, perdido) => {
    expect(destinoPerdido(erro)).toBe(perdido);
  });
});

describe('criarApiDoTelegram', () => {
  it('faz POST com JSON no método e devolve o result', async () => {
    const buscar = vi.fn((_url: string, _init?: RequestInit) =>
      Promise.resolve(respostaJson({ ok: true, result: { message_id: 1 } })),
    );
    const api = criarApiDoTelegram({ token: TOKEN, fetch: buscar as typeof fetch });
    expect(await api.chamar('sendMessage', { chat_id: 1, text: 'oi' })).toEqual({ message_id: 1 });
    const [url, init] = buscar.mock.calls[0] ?? [];
    expect(url).toBe(`https://api.telegram.org/bot${TOKEN}/sendMessage`);
    expect(init?.method).toBe('POST');
    expect(init?.body).toBe(JSON.stringify({ chat_id: 1, text: 'oi' }));
  });

  it('erro da API traz código, descrição e retry_after', async () => {
    const buscar = () =>
      Promise.resolve(
        respostaJson(
          {
            ok: false,
            error_code: 429,
            description: 'Too Many Requests: retry after 9',
            parameters: { retry_after: 9 },
          },
          429,
        ),
      );
    const api = criarApiDoTelegram({ token: TOKEN, fetch: buscar });
    const erro = await api.chamar('sendMessage').catch((e: unknown) => e);
    expect(erro).toBeInstanceOf(ErroDaApiDoTelegram);
    expect(erro).toMatchObject({ codigo: 429, esperarSegundos: 9 });
  });

  it('o token não aparece na mensagem de erro, nem quando a falha é de rede', async () => {
    const falhaDeRede = () =>
      Promise.reject(new TypeError(`fetch failed for https://api.telegram.org/bot${TOKEN}/x`));
    const api = criarApiDoTelegram({ token: TOKEN, fetch: falhaDeRede });
    const erros = [
      await api.chamar('getMe').catch((e: unknown) => e),
      await api.baixarArquivo('photos/a.jpg').catch((e: unknown) => e),
    ];
    const comToken = criarApiDoTelegram({
      token: TOKEN,
      fetch: () =>
        Promise.resolve(
          respostaJson({ ok: false, error_code: 401, description: `Unauthorized ${TOKEN}` }, 401),
        ),
    });
    erros.push(await comToken.chamar('getMe').catch((e: unknown) => e));
    for (const erro of erros) {
      expect(erro).toBeInstanceOf(ErroDaApiDoTelegram);
      expect((erro as Error).message).not.toContain('SEGREDO-DO-BOT');
      expect(JSON.stringify(erro)).not.toContain('SEGREDO-DO-BOT');
    }
  });
});
