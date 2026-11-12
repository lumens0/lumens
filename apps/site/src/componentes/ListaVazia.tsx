import Link from 'next/link';
import type { Bloco } from '../dados/tipos';
import { nomeDoCanal } from '../whatsapp';
import { BotaoRelatar } from './BotaoWhatsApp';
import estilos from './componentes.module.css';

/** Lista sem pautas: no campus todo ou no bloco do filtro. */
export function ListaVazia({ bloco }: { bloco: Bloco | undefined }) {
  return (
    <div role="status" className={estilos.estado}>
      <p className={estilos.estadoTitulo}>
        {bloco ? `Ainda não tem pauta no ${bloco.nome}.` : 'Ainda não tem pauta no site.'}
      </p>
      <p>Viu um problema no campus? Relate pelo {nomeDoCanal()}: com apoios, ele vira pauta.</p>
      <div className={estilos.acoes}>
        {bloco && (
          <Link href="/" className={estilos.botaoSecundario}>
            Ver todos os blocos
          </Link>
        )}
        {/* Sem bot configurado no canal, o botão de relatar não aparece. */}
        <BotaoRelatar />
      </div>
    </div>
  );
}
