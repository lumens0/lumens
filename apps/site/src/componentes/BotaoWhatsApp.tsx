import { aceitaApoio } from '../dados/pautas-publicas';
import type { StatusPauta } from '../dados/tipos';
import {
  COMANDO_NOVA_PAUTA,
  comandoAjudar,
  comandoApoiar,
  linkDoBot,
  nomeDoCanal,
} from '../whatsapp';
import estilos from './componentes.module.css';

/**
 * Botão que abre o bot no canal ativo (WhatsApp ou Telegram) com o comando pronto. Sem bot
 * configurado no canal, não aparece. O nome ficou do tempo em que só havia WhatsApp.
 * O `rotulo` é o `aria-label`: diz a ação e o alvo, já que o texto visível é curto.
 */
export function BotaoWhatsApp({
  comando,
  texto,
  rotulo,
}: {
  comando: string;
  texto: string;
  rotulo: string;
}) {
  const href = linkDoBot(comando);
  if (!href) return null;
  return (
    <a
      href={href}
      className={estilos.wa}
      aria-label={rotulo}
      target="_blank"
      rel="noopener noreferrer"
    >
      <svg
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M21 11.5a8.4 8.4 0 0 1-9 8.4 8.6 8.6 0 0 1-3.9-.9L3 20l1.1-4.6A8.4 8.4 0 0 1 3 11.5 8.5 8.5 0 0 1 12 3a8.4 8.4 0 0 1 9 8.5z" />
      </svg>
      {texto}
    </a>
  );
}

/** Se a pauta mostra "Apoiar": o status precisa aceitar apoio. O bot entende `apoiar <slug>` (2.8). */
export function mostraApoiar(status: StatusPauta): boolean {
  return aceitaApoio(status);
}

/** "Apoiar" uma pauta: abre o bot com `apoiar <slug>`. Quem chama decide com `mostraApoiar`. */
export function BotaoApoiar({ slug, titulo }: { slug: string; titulo: string }) {
  return (
    <BotaoWhatsApp
      comando={comandoApoiar(slug)}
      texto="Apoiar"
      rotulo={`Apoiar a pauta ${titulo} pelo ${nomeDoCanal()}`}
    />
  );
}

/** "Vou ajudar" na proposta aberta da pauta: abre o bot com `ajudar <slug>` (3.5, SCRUM-197). */
export function BotaoVouAjudar({ slug, titulo }: { slug: string; titulo: string }) {
  return (
    <BotaoWhatsApp
      comando={comandoAjudar(slug)}
      texto="Vou ajudar"
      rotulo={`Vou ajudar na proposta ${titulo} pelo ${nomeDoCanal()}`}
    />
  );
}

/** "Relatar um problema": abre o bot com `nova pauta`. No cabeçalho, na home e na lista vazia. */
export function BotaoRelatar() {
  return (
    <BotaoWhatsApp
      comando={COMANDO_NOVA_PAUTA}
      texto="Relatar um problema"
      rotulo={`Relatar um problema do campus pelo ${nomeDoCanal()}`}
    />
  );
}
