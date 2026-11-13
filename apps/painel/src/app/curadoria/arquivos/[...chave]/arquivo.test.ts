import { describe, expect, it, vi } from 'vitest';
import { destino } from '../../../../destino';
import { criarGetArquivo } from './arquivo';
import * as rota from './route';

// A rota publicada com a sessão do Auth.js trocada: sem sessão, ou com a de um curador.
const sessao = vi.hoisted(() => ({ atual: undefined as { id: string; nome: string } | undefined }));
vi.mock('../../../../auth', () => ({ curadorDaSessao: () => Promise.resolve(sessao.atual) }));

const FOTO = 'fotos/2026/11/5f1c2d3e-4a5b-4c6d-8e7f-0123456789ab.jpg';
const PDF = 'respostas/2026/11/5f1c2d3e-4a5b-4c6d-8e7f-0123456789ab.pdf';
const contexto = (chave: string) => ({ params: Promise.resolve({ chave: chave.split('/') }) });
const pedido = (chave: string) => new Request(`http://painel.local/curadoria/arquivos/${chave}`);
const bytes = new Uint8Array([1, 2, 3]);

describe('arquivo da curadoria (foto e PDF)', () => {
  it('sem curador na sessão: 401, sem tocar no storage, nem para chave inválida', async () => {
    const ler = vi.fn();
    const GET = criarGetArquivo({ autorizado: () => false, ler });
    expect((await GET(pedido(FOTO), contexto(FOTO))).status).toBe(401);
    expect((await GET(pedido('../segredo'), contexto('../segredo'))).status).toBe(401);
    expect(ler).not.toHaveBeenCalled();
  });

  it('a rota publicada confere a sessão do Auth.js e o proxy também barra', async () => {
    sessao.atual = undefined;
    expect((await rota.GET(pedido(FOTO), contexto(FOTO))).status).toBe(401);
    // O proxy já barra antes, com 401 em vez do redirecionamento para o login.
    expect(destino(`/curadoria/arquivos/${FOTO}`, false)).toBe('nao_autorizado');
  });

  it.each([
    [FOTO, 'image/jpeg'],
    [FOTO.replace('.jpg', '.png'), 'image/png'],
    [PDF, 'application/pdf'],
  ])('curador abre %s como %s, sem cache compartilhado', async (chave, tipo) => {
    const ler = vi.fn(() => Promise.resolve(bytes));
    const GET = criarGetArquivo({ autorizado: () => true, ler });
    const res = await GET(pedido(chave), contexto(chave));
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe(tipo);
    expect(res.headers.get('cache-control')).toBe('private, no-store');
    expect(res.headers.get('x-content-type-options')).toBe('nosniff');
    expect(new Uint8Array(await res.arrayBuffer())).toEqual(bytes);
    expect(ler).toHaveBeenCalledWith(chave);
  });

  it.each([
    ['../../.env'],
    ['fotos/2026/11/../../respostas/x.pdf'],
    ['fotos/2026/11/arquivo.gif'],
    ['outra-pasta/2026/11/5f1c2d3e-4a5b-4c6d-8e7f-0123456789ab.jpg'],
    ['respostas/2026/11/5f1c2d3e-4a5b-4c6d-8e7f-0123456789ab.jpg'],
  ])('chave fora do formato do bot (%s): 404 sem ler o storage', async (chave) => {
    const ler = vi.fn();
    const GET = criarGetArquivo({ autorizado: () => true, ler });
    expect((await GET(pedido(chave), contexto(chave))).status).toBe(404);
    expect(ler).not.toHaveBeenCalled();
  });

  it('arquivo que não está no storage: 404', async () => {
    const GET = criarGetArquivo({ autorizado: () => true, ler: () => Promise.resolve(null) });
    expect((await GET(pedido(FOTO), contexto(FOTO))).status).toBe(404);
  });
});
