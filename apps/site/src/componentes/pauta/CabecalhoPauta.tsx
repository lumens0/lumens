import type { PautaDetalhe } from '@lumens/contratos';
import type { CSSProperties } from 'react';
import { contextoDaPauta } from '../../dados/pautas-publicas';
import { diasEntre, textoDias } from '../../dados/dias';
import { formatarNumero, percentual } from '../BarraApoios';
import { mostraApoiar } from '../BotaoWhatsApp';
import { STATUS } from '../StatusPill';
import { origemDoSite } from '../../origem';
import { comandoApoiar, linkDoBot, nomeDoCanal } from '../../whatsapp';
import { CompartilharCard } from './CompartilharCard';
import { fraseDosCursosDaPauta } from '../../dados/cursos-do-bloco';
import estilos from './pauta.module.css';

/** O botão "Apoiar" da faixa: abre o bot com o comando pronto. Sem bot configurado, não aparece. */
export function BotaoDeApoio({
  slug,
  titulo,
  curto = false,
}: {
  slug: string;
  titulo: string;
  /** Na barra fixa do celular o texto é só "Apoiar". */
  curto?: boolean;
}) {
  const href = linkDoBot(comandoApoiar(slug));
  if (!href) return null;
  const texto = curto ? 'Apoiar' : `Apoiar pelo ${nomeDoCanal()}`;
  return (
    <a
      href={href}
      className={estilos.apoiar}
      aria-label={`${texto}: ${titulo}`}
      target="_blank"
      rel="noopener noreferrer"
    >
      {texto}
    </a>
  );
}

/** "aberta há 41 dias" a partir da criação da pauta; sem data válida, a frase some. */
function abertaHa(criadaEm: string, agora: Date): string | null {
  const dias = diasEntre(criadaEm, agora.toISOString());
  if (dias === null || dias < 0) return null;
  return `aberta ${dias === 0 ? 'hoje' : `há ${textoDias(dias)}`}`;
}

/**
 * O topo da pauta: etapa e título à esquerda; o número de apoios, a barra até a meta e as ações à
 * direita (no celular, empilhados). A barra na cor do status, cheia quando passa da meta.
 */
export function CabecalhoPauta({
  pauta,
  cursosDoBloco,
  agora = new Date(),
}: {
  pauta: PautaDetalhe;
  /** Cursos que apoiam no bloco da pauta (SCRUM-399); `undefined` quando não se sabe. */
  cursosDoBloco?: readonly string[] | undefined;
  agora?: Date;
}) {
  const status = STATUS[pauta.status];
  const aberta = abertaHa(pauta.criada_em, agora);
  return (
    <div className={estilos.cabeca}>
      <div>
        <p className={estilos.etiqueta}>
          <i
            className={[estilos.glifo, pauta.status === 'descumprida' ? estilos.glifoVazado : '']
              .join(' ')
              .trim()}
            aria-hidden="true"
          />
          {status.rotulo}
          {pauta.urgente && <span className={estilos.urgente}>Urgente</span>}
        </p>
        <h1 className={estilos.titulo}>{pauta.titulo}</h1>
        <p className={estilos.onde}>
          {[contextoDaPauta(pauta.categoria, pauta.bloco_nome), aberta].filter(Boolean).join(' · ')}
        </p>
        {fraseDosCursosDaPauta(pauta.bloco_slug, cursosDoBloco) !== null && (
          <p className={estilos.onde} data-quem-apoia>
            {fraseDosCursosDaPauta(pauta.bloco_slug, cursosDoBloco)}
          </p>
        )}
        {pauta.cursos_responsaveis.length > 0 && (
          <ul className={estilos.responsaveis} aria-label="Responsáveis pela pauta">
            {pauta.cursos_responsaveis.map((curso) => (
              <li key={curso}>Responsável · {curso}</li>
            ))}
          </ul>
        )}
      </div>
      <div>
        <p className={estilos.numero}>
          <span>{formatarNumero(pauta.apoios)}</span>
        </p>
        <p className={estilos.rotuloDoNumero}>apoios · meta de {formatarNumero(pauta.meta)}</p>
        <div
          className={estilos.barra}
          style={{ '--p': `${String(percentual(pauta.apoios, pauta.meta))}%` } as CSSProperties}
          role="progressbar"
          aria-label={`Apoios da pauta ${pauta.titulo}`}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={percentual(pauta.apoios, pauta.meta)}
          aria-valuetext={`${formatarNumero(pauta.apoios)} de ${formatarNumero(pauta.meta)} apoios`}
        >
          <i />
        </div>
        <div className={estilos.cta}>
          {mostraApoiar(pauta.status) && <BotaoDeApoio slug={pauta.slug} titulo={pauta.titulo} />}
          <CompartilharCard
            slug={pauta.slug}
            titulo={pauta.titulo}
            apoios={formatarNumero(pauta.apoios)}
            etapa={status.rotulo}
            link={new URL(`/p/${pauta.slug}`, origemDoSite()).href}
          />
        </div>
      </div>
    </div>
  );
}
