import Link from 'next/link';
import type { Bloco } from '../dados/tipos';
import { nomeDoCanal } from '../whatsapp';
import { BotaoRelatar } from './BotaoWhatsApp';
import estilos from './componentes.module.css';

/** Lista sem pautas: no campus todo ou no bloco do filtro. */
export function ListaVazia({
  bloco,
  status,
}: {
  bloco: Bloco | undefined;
  status?: string | undefined;
}) {
  const descricaoStatus: Record<string, string> = {
    juntando_apoios: 'juntando apoios',
    meta_batida: 'com a meta batida',
    cobrando: 'em cobrança',
    prometido: 'prometida',
    entregue_em_parte: 'entregue em parte',
    conquistada: 'conquistada',
    descumprida: 'descumprida',
  };
  return (
    <div role="status" className={estilos.estado}>
      <p className={estilos.estadoTitulo}>
        {status
          ? `Nenhuma pauta ${descricaoStatus[status] ?? status}${bloco ? ` neste bloco (${bloco.nome})` : ' no site'}.`
          : bloco
            ? `Ainda não tem pauta no ${bloco.nome}.`
            : 'Ainda não tem pauta no site.'}
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
