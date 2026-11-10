import type { EventoDaLinha } from '@lumens/dominio';
import { describe, expect, it, vi } from 'vitest';
import * as rota from './route';
import { criarGetEventos } from './eventos';

// A rota publicada com a sessão do Auth.js e o banco trocados: sem sessão, ou com a de um curador.
const sessao = vi.hoisted(() => ({ atual: undefined as { id: string; nome: string } | undefined }));
vi.mock('../../../../../auth', () => ({
  curadorDaSessao: () => Promise.resolve(sessao.atual),
  servidor: () => ({ db: {} }),
}));
vi.mock('@lumens/dominio', () => ({ listarLinhaDoTempo: () => Promise.resolve([]) }));

const ID = '5f1c2d3e-4a5b-4c6d-8e7f-0123456789ab';
const contexto = (id: string) => ({ params: Promise.resolve({ id }) });
const pedido = () => new Request(`http://painel.local/curadoria/pautas/${ID}/eventos`);

const evento: EventoDaLinha = {
  id: 'e1',
  tipo: 'pauta_criada',
  dados: { titulo: 'Bebedouro quebrado' },
  origem: 'bot',
  publico: false,
  criadoEm: new Date('2026-11-09T12:00:00.000Z'),
};

describe('rota de leitura da linha do tempo', () => {
  it('nega sem login e não consulta o banco', async () => {
    const listar = vi.fn();
    const GET = criarGetEventos({ autorizado: () => false, listar });

    const res = await GET(pedido(), contexto(ID));

    expect(res.status).toBe(401);
    expect(listar).not.toHaveBeenCalled();
  });

  it('nega sem login mesmo com id inválido, para não revelar se a pauta existe', async () => {
    const GET = criarGetEventos({ autorizado: () => false, listar: vi.fn() });

    expect((await GET(pedido(), contexto('nao-e-uuid'))).status).toBe(401);
  });

  it('devolve os eventos na ordem recebida, inclusive os não públicos', async () => {
    const listar = vi.fn().mockResolvedValue([evento]);
    const GET = criarGetEventos({ autorizado: () => true, listar });

    const res = await GET(pedido(), contexto(ID));

    expect(res.status).toBe(200);
    expect(res.headers.get('Cache-Control')).toBe('no-store');
    expect(await res.json()).toEqual({
      eventos: [{ ...evento, criadoEm: '2026-11-09T12:00:00.000Z' }],
    });
    expect(listar).toHaveBeenCalledWith(ID);
  });

  it('pauta sem eventos devolve lista vazia', async () => {
    const GET = criarGetEventos({ autorizado: () => true, listar: () => Promise.resolve([]) });

    expect(await (await GET(pedido(), contexto(ID))).json()).toEqual({ eventos: [] });
  });

  it('id que não é UUID dá 404 sem consultar o banco', async () => {
    const listar = vi.fn();
    const GET = criarGetEventos({ autorizado: () => true, listar });

    expect((await GET(pedido(), contexto('1; DROP TABLE evento'))).status).toBe(404);
    expect(listar).not.toHaveBeenCalled();
  });

  it('a rota publicada só expõe GET, nega sem curador ativo e responde com ele', async () => {
    expect(Object.keys(rota)).toEqual(['GET']);

    // Sem sessão, ou sessão de curador já desativado: `curadorDaSessao` não devolve ninguém.
    sessao.atual = undefined;
    expect((await rota.GET(pedido(), contexto(ID))).status).toBe(401);

    sessao.atual = { id: 'curador-1', nome: 'Ana' };
    const res = await rota.GET(pedido(), contexto(ID));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ eventos: [] });
  });
});
