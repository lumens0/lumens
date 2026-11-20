/** O que o navegador oferece para compartilhar e copiar; nos testes, um objeto de mentira. */
export interface RecursosDoNavegador {
  share?: (dados: { files?: File[]; title?: string; url?: string }) => Promise<void>;
  canShare?: (dados: { files?: File[] }) => boolean;
  clipboard?: {
    write?: (itens: ClipboardItem[]) => Promise<void>;
    writeText?: (texto: string) => Promise<void>;
  };
  /** Cria o item de imagem da área de transferência (`ClipboardItem`). */
  itemDeImagem?: (blob: Blob) => ClipboardItem;
}

export type Resultado =
  | { resultado: 'compartilhado' | 'copiado' | 'link-copiado'; mensagem: string }
  | { resultado: 'cancelado'; mensagem: '' }
  | { resultado: 'sem-suporte'; mensagem: string };

/** Mensagem de reserva: o navegador não deixou copiar, e há dois outros caminhos. */
export const SEM_SUPORTE =
  "Este navegador não deixou copiar a imagem aqui. Toque e segure no card para salvar ou copiar, ou use 'Copiar só o link'.";
export const SEM_SUPORTE_DO_LINK =
  'Este navegador não deixou copiar o link. Selecione o endereço abaixo do card e copie.';

/**
 * Compartilha a imagem do card: pela folha de compartilhar do aparelho quando ela aceita arquivos;
 * senão copia a imagem; senão devolve a mensagem de reserva. A pessoa que fecha a folha do aparelho
 * não é erro (`cancelado`).
 */
export async function compartilharCard(
  imagem: Blob,
  { titulo, link }: { titulo: string; link: string },
  nav: RecursosDoNavegador,
  nome = 'lumens-card.png',
): Promise<Resultado> {
  const arquivo = new File([imagem], nome, { type: 'image/png' });
  if (nav.share && nav.canShare?.({ files: [arquivo] })) {
    try {
      await nav.share({ files: [arquivo], title: titulo, url: link });
      return { resultado: 'compartilhado', mensagem: 'Card compartilhado.' };
    } catch (erro) {
      if (erro instanceof DOMException && erro.name === 'AbortError') {
        return { resultado: 'cancelado', mensagem: '' };
      }
      // Qualquer outra falha cai na cópia da imagem.
    }
  }
  if (nav.clipboard?.write && nav.itemDeImagem) {
    try {
      await nav.clipboard.write([nav.itemDeImagem(imagem)]);
      return { resultado: 'copiado', mensagem: 'Card copiado.' };
    } catch {
      // Sem permissão ou sem suporte a imagem: mensagem de reserva.
    }
  }
  return { resultado: 'sem-suporte', mensagem: SEM_SUPORTE };
}

/** Copia só o endereço da pauta. */
export async function copiarLink(link: string, nav: RecursosDoNavegador): Promise<Resultado> {
  try {
    await nav.clipboard?.writeText?.(link);
    if (nav.clipboard?.writeText) return { resultado: 'link-copiado', mensagem: 'Link copiado.' };
  } catch {
    // Cai na mensagem de reserva.
  }
  return { resultado: 'sem-suporte', mensagem: SEM_SUPORTE_DO_LINK };
}
