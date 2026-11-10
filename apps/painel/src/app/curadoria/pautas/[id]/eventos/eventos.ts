import type { EventoDaLinha } from '@lumens/dominio';

// Rota de leitura da linha do tempo da pauta para a curadoria (5.5, RF-C05, RN11). Só GET: o
// banco recusa UPDATE e DELETE em `evento`, e aqui não existe outro método.

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface DependenciasEventos {
  /** Login da 5.1 (SCRUM-112). Sem ele a rota nega todo pedido. */
  autorizado: (request: Request) => boolean | Promise<boolean>;
  listar: (pautaId: string) => Promise<EventoDaLinha[]>;
}

const SEM_CACHE = { 'Cache-Control': 'no-store' };

function resposta(status: number, corpo?: unknown): Response {
  return Response.json(corpo ?? null, { status, headers: SEM_CACHE });
}

export function criarGetEventos({ autorizado, listar }: DependenciasEventos) {
  return async function GET(
    request: Request,
    { params }: { params: Promise<{ id: string }> },
  ): Promise<Response> {
    // Autorização antes de olhar o id: quem não entrou não descobre se a pauta existe.
    if (!(await autorizado(request))) return resposta(401);

    const { id } = await params;
    if (!UUID.test(id)) return resposta(404);

    const eventos = await listar(id);
    return resposta(200, { eventos });
  };
}
