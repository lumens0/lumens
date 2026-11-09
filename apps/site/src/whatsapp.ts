/**
 * Links wa.me para o bot do Lumens. O site não registra nada: só abre a conversa com o comando já
 * digitado, e quem interpreta o comando é o bot (2.7, SCRUM-102).
 */

/** Comando de apoio. O identificador é o slug público da pauta, o mesmo da URL `/p/<slug>`. */
export function comandoApoiar(slug: string): string {
  return `apoiar ${slug}`;
}

/** Comando de voluntariado num caminho (3.5, SCRUM-197). */
export function comandoAjudar(id: string): string {
  return `ajudar ${id}`;
}

export const COMANDO_NOVA_PAUTA = 'nova pauta';

/**
 * Link wa.me do bot, com o comando opcional no `text`. Devolve `null` sem número configurado: quem
 * chama esconde o botão.
 */
export function linkWhatsApp(comando?: string): string | null {
  // Lido literalmente: o Next só embute no bundle `process.env.NEXT_PUBLIC_*` escrito por extenso.
  const numero = numeroDoBot(process.env.NEXT_PUBLIC_WHATSAPP_BOT);
  if (!numero) return null;
  const base = `https://wa.me/${numero}`;
  return comando ? `${base}?text=${encodeURIComponent(comando)}` : base;
}

/** Só os dígitos do número do bot (`+55 82 ...` vira `5582...`); `''` quando não há nenhum. */
export function numeroDoBot(valor: string | undefined): string {
  return (valor ?? '').replace(/\D/g, '');
}

/**
 * Exige o número do bot. O `next.config.ts` chama no build de produção: sem número, o build falha
 * com esta mensagem em vez de publicar o site sem os botões (SCRUM-43).
 */
export function exigirNumeroDoBot(valor: string | undefined): string {
  const numero = numeroDoBot(valor);
  if (!numero) {
    throw new Error(
      'NEXT_PUBLIC_WHATSAPP_BOT não configurada: o build do site precisa do número do bot no WhatsApp (só dígitos, com DDI). Veja o .env.example.',
    );
  }
  return numero;
}
