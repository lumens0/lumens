/** Um modelo como a Meta o lista em `GET /{waba-id}/message_templates`. */
export interface ModeloNaMeta {
  id: string;
  name: string;
  status: string;
  category: string;
  language: string;
}

export interface OpcoesDaConsulta {
  waba: string;
  token: string;
  versao: string;
  /** Trocável nos testes. */
  fetch?: typeof fetch;
}

// Trava contra uma resposta que nunca deixa de mandar `paging.next`.
const MAX_PAGINAS = 50;

/**
 * Todos os modelos da conta, de todas as páginas. A Meta pagina a lista mesmo com `limit` alto:
 * parar na primeira página faria um modelo que existe parecer ausente.
 */
export async function listarModelosNaMeta({
  waba,
  token,
  versao,
  fetch: buscar = fetch,
}: OpcoesDaConsulta): Promise<ModeloNaMeta[]> {
  const modelos: ModeloNaMeta[] = [];
  let url: string | undefined =
    `https://graph.facebook.com/${versao}/${waba}/message_templates` +
    '?fields=id,name,status,category,language&limit=200';

  for (let i = 0; url !== undefined && i < MAX_PAGINAS; i++) {
    const res: Response = await buscar(url, { headers: { authorization: `Bearer ${token}` } });
    if (!res.ok) throw new Error(`HTTP ${String(res.status)} ${await res.text()}`);
    const pagina = (await res.json()) as { data?: ModeloNaMeta[]; paging?: { next?: string } };
    modelos.push(...(pagina.data ?? []));
    url = pagina.paging?.next;
  }
  // Lista cortada pela trava não serve para dizer que um modelo não existe.
  if (url !== undefined)
    throw new Error(`a lista de modelos passou de ${String(MAX_PAGINAS)} páginas`);
  return modelos;
}
