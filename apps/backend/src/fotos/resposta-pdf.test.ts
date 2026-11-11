import { describe, expect, it } from 'vitest';
import { ErroDeMidia } from './meta-midia';
import { criarServicoDeRespostas } from './resposta-pdf';
import type { Storage } from './storage';

const PDF = Buffer.from('%PDF-1.7\n1 0 obj\n<<>>\nendobj\n%%EOF', 'ascii');
const AGORA = new Date('2026-11-10T15:00:00.000Z');

function storageFalso(falhar = false) {
  const guardados: { chave: string; contentType: string; bytes: Buffer }[] = [];
  const storage: Storage = {
    guardar: (chave, bytes, contentType) => {
      if (falhar) return Promise.reject(new Error('fora do ar'));
      guardados.push({ chave, contentType, bytes });
      return Promise.resolve();
    },
  };
  return { storage, guardados };
}

const servico = (
  bytes: Buffer | Error,
  storage = storageFalso().storage,
  baixados: string[] = [],
) =>
  criarServicoDeRespostas({
    baixar: (id) => {
      baixados.push(id);
      return bytes instanceof Error
        ? Promise.reject(bytes)
        : Promise.resolve({ bytes, mimeType: 'application/pdf' });
    },
    storage,
    agora: () => AGORA,
  });

describe('guardarPdf (SCRUM-220)', () => {
  it('guarda o PDF numa chave aleatória da pasta do mês, sem o nome original', async () => {
    const { storage, guardados } = storageFalso();

    const r = await servico(PDF, storage).guardarPdf({
      id: 'midia-1',
      mimeType: 'application/pdf',
    });

    expect(r).toMatchObject({ ok: true });
    const chave = r.ok ? r.chave : '';
    expect(chave).toMatch(/^respostas\/2026\/11\/[0-9a-f-]{36}\.pdf$/);
    expect(guardados).toEqual([{ chave, contentType: 'application/pdf', bytes: PDF }]);
  });

  it('o que não é PDF nem é baixado', async () => {
    const baixados: string[] = [];

    const r = await servico(PDF, storageFalso().storage, baixados).guardarPdf({
      id: 'midia-2',
      mimeType: 'image/jpeg',
    });

    expect(r).toEqual({ ok: false, motivo: 'formato' });
    expect(baixados).toEqual([]);
  });

  it('arquivo que diz ser PDF mas não começa com %PDF- é recusado', async () => {
    const r = await servico(Buffer.from('<html>golpe</html>')).guardarPdf({
      id: 'midia-3',
      mimeType: 'application/pdf; charset=binary',
    });

    expect(r).toEqual({ ok: false, motivo: 'formato' });
  });

  it('acima do limite vira motivo "tamanho"', async () => {
    const r = await servico(new ErroDeMidia('tamanho', 'grande')).guardarPdf({
      id: 'midia-4',
      mimeType: 'application/pdf',
    });

    expect(r).toEqual({ ok: false, motivo: 'tamanho' });
  });

  it('download ou storage fora do ar viram "indisponivel", sem lançar', async () => {
    const semRede = await servico(new Error('ECONNRESET')).guardarPdf({
      id: 'midia-5',
      mimeType: 'application/pdf',
    });
    const semStorage = await servico(PDF, storageFalso(true).storage).guardarPdf({
      id: 'midia-6',
      mimeType: 'application/pdf',
    });

    expect([semRede, semStorage]).toEqual([
      { ok: false, motivo: 'indisponivel' },
      { ok: false, motivo: 'indisponivel' },
    ]);
  });
});
