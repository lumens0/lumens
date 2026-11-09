import Link from 'next/link';
import type { Bloco } from '../dados/tipos';
import { COMANDO_NOVA_PAUTA, linkWhatsApp } from '../whatsapp';
import estilos from './componentes.module.css';

/** Lista sem pautas: no campus todo ou no bloco do filtro. */
export function ListaVazia({ bloco }: { bloco: Bloco | undefined }) {
  // Sem número do bot configurado, o botão de relatar não aparece.
  const whatsapp = linkWhatsApp(COMANDO_NOVA_PAUTA);
  return (
    <div role="status" className={estilos.estado}>
      <p className={estilos.estadoTitulo}>
        {bloco ? `Ainda não tem pauta no ${bloco.nome}.` : 'Ainda não tem pauta no site.'}
      </p>
      <p>Viu um problema no campus? Relate pelo WhatsApp: com apoios, ele vira pauta.</p>
      <div className={estilos.acoes}>
        {bloco && (
          <Link href="/" className={estilos.botaoSecundario}>
            Ver todos os blocos
          </Link>
        )}
        {whatsapp && (
          <a href={whatsapp} className={estilos.botao}>
            Relatar um problema
          </a>
        )}
      </div>
    </div>
  );
}
