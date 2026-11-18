/**
 * As seções do manual. O `id` é a âncora: `linkDoManual('falabr')` é o que o "Saiba mais" dos
 * caminhos da pauta (`Caminhos.tsx`) usa, e o teste da página confere que cada âncora existe.
 * Fica fora de `page.tsx` porque uma página do Next só pode exportar o que o Next conhece.
 */
export const SECOES = {
  pauta: { id: 'pauta', titulo: 'O que é uma pauta' },
  relatar: { id: 'relatar-e-apoiar', titulo: 'Como relatar e apoiar' },
  perdido: { id: 'se-perder', titulo: 'Se você se perder na conversa' },
  editar: { id: 'editar-pauta', titulo: 'Como corrigir uma pauta' },
  categoria: { id: 'categoria', titulo: 'Categorias e a sugestão do bot' },
  caminhos: { id: 'caminhos', titulo: 'Os caminhos da pauta' },
  falabr: { id: 'fala-br', titulo: 'O Fala.BR e os 3 passos até o protocolo' },
  protocolo: { id: 'protocolo', titulo: 'O que é o protocolo' },
  cuidar: { id: 'cuidar-da-pauta', titulo: 'Como cuidar de uma pauta' },
  privacidade: { id: 'privacidade-em-resumo', titulo: 'Privacidade em resumo' },
} as const;

/** O endereço de uma seção do manual, para os links de outras páginas. */
export const linkDoManual = (secao: keyof typeof SECOES): string => `/manual#${SECOES[secao].id}`;
