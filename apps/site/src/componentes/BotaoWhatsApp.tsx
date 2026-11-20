import { aceitaApoio } from '../dados/pautas-publicas';
import type { StatusPauta } from '../dados/tipos';
import {
  COMANDO_NOVA_PAUTA,
  comandoAjudar,
  comandoApoiar,
  comandoNovaPautaNoBloco,
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
  relatar = false,
  semIcone = false,
}: {
  comando: string;
  texto: string;
  rotulo: string;
  /** O "Relatar um problema" do protótipo: balão de 17 px e brilho maior ao passar o mouse. */
  relatar?: boolean;
  /** Botão só de texto, como o "Apoiar pelo WhatsApp" das linhas da lista. */
  semIcone?: boolean;
}) {
  const href = linkDoBot(comando);
  if (!href) return null;
  return (
    <a
      href={href}
      className={[estilos.wa, relatar ? estilos.relatar : ''].join(' ').trim()}
      aria-label={rotulo}
      target="_blank"
      rel="noopener noreferrer"
    >
      {!semIcone && (
        <svg
          width={relatar ? 17 : 16}
          height={relatar ? 17 : 16}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={relatar ? 2.2 : 1.5}
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path
            d={
              relatar
                ? 'M21 12a8 8 0 0 1-11.6 7.1L3 21l1.9-5.4A8 8 0 1 1 21 12z'
                : 'M21 11.5a8.4 8.4 0 0 1-9 8.4 8.6 8.6 0 0 1-3.9-.9L3 20l1.1-4.6A8.4 8.4 0 0 1 3 11.5 8.5 8.5 0 0 1 12 3a8.4 8.4 0 0 1 9 8.5z'
            }
          />
        </svg>
      )}
      {texto}
    </a>
  );
}

/** Se a pauta mostra "Apoiar": o status precisa aceitar apoio. O bot entende `apoiar <slug>` (2.8). */
export function mostraApoiar(status: StatusPauta): boolean {
  return aceitaApoio(status);
}

/** "Apoiar" uma pauta: abre o bot com `apoiar <slug>`. Quem chama decide com `mostraApoiar`. */
export function BotaoApoiar({
  slug,
  titulo,
  texto = 'Apoiar',
  semIcone = false,
}: {
  slug: string;
  titulo: string;
  texto?: string;
  semIcone?: boolean;
}) {
  return (
    <BotaoWhatsApp
      comando={comandoApoiar(slug)}
      semIcone={semIcone}
      texto={texto}
      rotulo={`Apoiar a pauta ${titulo} pelo ${nomeDoCanal()}`}
    />
  );
}

/**
 * "Criar pauta neste bloco": abre o bot com `nova pauta <slug>`, e a conversa já começa nesse
 * bloco (SCRUM-396). O `aria-label` começa pelo texto visível (WCAG 2.5.3) e diz de qual bloco se
 * fala.
 */
export function BotaoCriarPauta({ bloco, slug }: { bloco: string; slug: string }) {
  return (
    <BotaoWhatsApp
      comando={comandoNovaPautaNoBloco(slug)}
      texto="Criar pauta neste bloco"
      rotulo={`Criar pauta neste bloco: ${bloco}, pelo ${nomeDoCanal()}`}
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
      relatar
      texto="Relatar um problema"
      rotulo={`Relatar um problema do campus pelo ${nomeDoCanal()}`}
    />
  );
}
