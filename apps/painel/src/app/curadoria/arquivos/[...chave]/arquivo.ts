// Foto de relato e PDF de resposta oficial para a curadoria (SCRUM-262). O bucket é privado: o
// arquivo passa por aqui, que confere o curador a cada pedido, e o navegador nunca fala com o S3.
// Sem sessão de curador ativo, nada abre, nem com o endereço copiado.

/** As únicas chaves que o bot grava (`fotos/servico.ts` e `fotos/resposta-pdf.ts` do backend). */
const CHAVE =
  /^(fotos\/\d{4}\/\d{2}\/[0-9a-f-]{36}\.(jpg|png)|respostas\/\d{4}\/\d{2}\/[0-9a-f-]{36}\.pdf)$/;

const TIPO: Record<string, string> = {
  jpg: 'image/jpeg',
  png: 'image/png',
  pdf: 'application/pdf',
};

export interface DependenciasArquivo {
  /** Curador ativo na sessão (SCRUM-112). Sem ele a rota nega todo pedido. */
  autorizado: () => boolean | Promise<boolean>;
  /** Bytes do arquivo no storage; `null` se a chave não existe lá. */
  ler: (chave: string) => Promise<Uint8Array | null>;
}

const SEM_CACHE = { 'Cache-Control': 'private, no-store' };

export function caminhoDoArquivo(chave: string): string {
  return `/curadoria/arquivos/${chave}`;
}

export function criarGetArquivo({ autorizado, ler }: DependenciasArquivo) {
  return async function GET(
    _request: Request,
    { params }: { params: Promise<{ chave: string[] }> },
  ): Promise<Response> {
    // Autorização antes de olhar a chave: quem não entrou não descobre se o arquivo existe.
    if (!(await autorizado())) return new Response(null, { status: 401, headers: SEM_CACHE });

    const chave = (await params).chave.join('/');
    if (!CHAVE.test(chave)) return new Response(null, { status: 404, headers: SEM_CACHE });

    const bytes = await ler(chave);
    if (bytes === null) return new Response(null, { status: 404, headers: SEM_CACHE });

    return new Response(new Uint8Array(bytes), {
      headers: {
        ...SEM_CACHE,
        'Content-Type': TIPO[chave.slice(chave.lastIndexOf('.') + 1)] ?? 'application/octet-stream',
        'Content-Disposition': 'inline',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  };
}
