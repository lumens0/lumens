import { describe, expect, it } from 'vitest';
import { ErroDeMidia } from '../../../fotos/meta-midia';
import { ErroDaEvolution, type ClienteEvolution } from './cliente';
import { baixarMidiaDaEvolution } from './midia';

const REFERENCIA = JSON.stringify({
  key: { id: '3EB0IMG', remoteJid: '5582988887777@s.whatsapp.net', fromMe: false },
  message: { imageMessage: { mimetype: 'image/jpeg', fileLength: '3', mediaKey: 'k' } },
});

/** `resposta` é o que a Evolution devolve; um `Error` simula a falha da chamada. */
function clienteFalso(resposta: unknown) {
  const chamadas: { caminho: string; corpo: unknown }[] = [];
  const chamar: ClienteEvolution = (caminho, corpo) => {
    chamadas.push({ caminho, corpo });
    return resposta instanceof Error ? Promise.reject(resposta) : Promise.resolve(resposta);
  };
  return { chamar, chamadas };
}

async function motivo(promessa: Promise<unknown>) {
  try {
    await promessa;
  } catch (erro) {
    if (erro instanceof ErroDeMidia) return erro.motivo;
    throw erro;
  }
  throw new Error('devia ter falhado');
}

describe('baixarMidiaDaEvolution (SCRUM-275)', () => {
  it('pede a mídia pela mensagem inteira e devolve os bytes e o tipo', async () => {
    const { chamar, chamadas } = clienteFalso({
      base64: Buffer.from('abc').toString('base64'),
      mimetype: 'image/png',
    });

    const midia = await baixarMidiaDaEvolution(REFERENCIA, chamar);

    expect(midia).toEqual({ bytes: Buffer.from('abc'), mimeType: 'image/png' });
    expect(chamadas).toEqual([
      {
        caminho: '/chat/getBase64FromMediaMessage',
        corpo: { message: JSON.parse(REFERENCIA) as unknown, convertToMp4: false },
      },
    ]);
  });

  it('o fileLength acima do limite recusa antes de baixar', async () => {
    const { chamar, chamadas } = clienteFalso({ base64: 'eA==' });
    const grande = REFERENCIA.replace('"fileLength":"3"', '"fileLength":{"low":0,"high":1}');

    expect(await motivo(baixarMidiaDaEvolution(grande, chamar))).toBe('tamanho');
    expect(chamadas).toEqual([]);
  });

  it('os bytes acima do limite também são recusados (o fileLength pode mentir)', async () => {
    const { chamar } = clienteFalso({ base64: Buffer.alloc(11).toString('base64') });
    expect(await motivo(baixarMidiaDaEvolution(REFERENCIA, chamar, { tamanhoMaximo: 10 }))).toBe(
      'tamanho',
    );
  });

  it.each([
    ['Evolution fora do ar', new ErroDaEvolution(502, 'HTTP 502')],
    ['resposta sem base64', {}],
  ])('%s: indisponível', async (_caso, resposta) => {
    expect(await motivo(baixarMidiaDaEvolution(REFERENCIA, clienteFalso(resposta).chamar))).toBe(
      'indisponivel',
    );
  });

  it('referência ilegível: indisponível', async () => {
    expect(await motivo(baixarMidiaDaEvolution('{', clienteFalso({}).chamar))).toBe('indisponivel');
  });
});
