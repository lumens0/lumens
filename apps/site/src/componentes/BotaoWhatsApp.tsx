import { COMANDO_NOVA_PAUTA, comandoAjudar, linkWhatsApp } from '../whatsapp';
import estilos from './componentes.module.css';

/**
 * Botão que abre o WhatsApp do bot com o comando pronto. Sem número configurado, não aparece.
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
  const href = linkWhatsApp(comando);
  if (!href) return null;
  return (
    <a
      href={href}
      className={estilos.botao}
      aria-label={rotulo}
      target="_blank"
      rel="noopener noreferrer"
    >
      {texto}
    </a>
  );
}

/**
 * "Vou ajudar" num caminho. Desligado por padrão: só aparece com `NEXT_PUBLIC_FLAG_VOU_AJUDAR=1`,
 * até o bot aceitar o comando `ajudar` (3.5, SCRUM-197).
 */
export function BotaoVouAjudar({ caminhoId, titulo }: { caminhoId: string; titulo: string }) {
  if (process.env.NEXT_PUBLIC_FLAG_VOU_AJUDAR !== '1') return null;
  return (
    <BotaoWhatsApp
      comando={comandoAjudar(caminhoId)}
      texto="Vou ajudar"
      rotulo={`Vou ajudar no caminho ${titulo} pelo WhatsApp`}
    />
  );
}

/** "Relatar um problema": abre o bot com `nova pauta`. Usado na home e na lista vazia. */
export function BotaoRelatar() {
  return (
    <BotaoWhatsApp
      comando={COMANDO_NOVA_PAUTA}
      texto="Relatar um problema"
      rotulo="Relatar um problema do campus pelo WhatsApp"
    />
  );
}
