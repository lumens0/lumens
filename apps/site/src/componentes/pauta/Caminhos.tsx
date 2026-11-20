import type { Caminho } from '@lumens/contratos';
import Link from 'next/link';
import type { CSSProperties } from 'react';
import { linkDoManual } from '../../app/manual/secoes';
import { comandoAjudar, linkDoBot, nomeDoCanal } from '../../whatsapp';
import { formatarDia, prazoVencido, textoDoPrazo } from './prazos';

export { formatarDia };
import estilos from './pauta.module.css';

const TIPOS: Record<Caminho['tipo'], string> = {
  falabr: 'Fala.BR',
  comunidade: 'Solução da comunidade',
  representante: 'Representante',
  proposta: 'Proposta da comunidade',
};

/**
 * Uma frase por tipo, para quem chega pelo QR Code sem conhecer os termos (SCRUM-382). A do Fala.BR
 * repete a do bot ao abrir o caminho (`OPENED_TEXT.falabr`, SCRUM-370): se uma mudar, mude a outra.
 *
 * O texto de `representante` é o proposto no ticket; a equipe valida na revisão da PR.
 */
const EXPLICACAO: Record<Exclude<Caminho['tipo'], 'proposta'>, string> = {
  falabr:
    'Canal oficial do governo federal para registrar manifestações. A resposta tem prazo em lei e o protocolo fica público.',
  comunidade: 'Estudantes resolvendo o problema por conta própria.',
  representante:
    'Alguém que representa os estudantes leva a pauta à universidade e cobra uma resposta.',
};

/** A proposta só pede voluntários enquanto está aberta: é quando o "Vou ajudar" existe. */
function explicacaoDe(caminho: Caminho): string | undefined {
  if (caminho.tipo !== 'proposta') return EXPLICACAO[caminho.tipo];
  return caminho.status === 'aberta'
    ? 'Ideia de solução publicada por quem cuida da pauta. Precisa de voluntários: toque em Vou ajudar.'
    : 'Ideia de solução publicada por quem cuida da pauta.';
}

// `caminho.status` é texto livre no esquema; hoje o domínio só grava `aberto`. As propostas vêm do
// enum `status_proposta` (`aberta`, `executada`). Valor fora da lista vira texto legível.
const STATUS: Record<string, string> = {
  aberto: 'Em andamento',
  aberta: 'Juntando voluntários',
  executada: 'Executada',
};

export function rotuloStatusCaminho(status: string): string {
  return STATUS[status] ?? status.replaceAll('_', ' ');
}

/** "Vou ajudar" na proposta aberta: abre o bot com `ajudar <slug>`. Sem bot configurado, não aparece. */
function VouAjudar({ slug, titulo }: { slug: string; titulo: string }) {
  const href = linkDoBot(comandoAjudar(slug));
  if (!href) return null;
  return (
    <a
      href={href}
      className={estilos.ajudar}
      aria-label={`Vou ajudar na proposta ${titulo} pelo ${nomeDoCanal()}`}
      target="_blank"
      rel="noopener noreferrer"
    >
      Vou ajudar
    </a>
  );
}

/** A janela de cada caminho: âmbar da cobrança, azul da proposta, verde do que foi executado. */
function corDoCaminho(caminho: Caminho): string {
  if (caminho.status === 'executada') return 'var(--status-conquistada)';
  return caminho.tipo === 'proposta' ? 'var(--status-apoios)' : 'var(--status-cobrando)';
}

/** Caminho que já foi respondido (Fala.BR respondido): o prazo de resposta deixa de contar. */
export function caminhoRespondido(caminho: Caminho): boolean {
  return /^respondid[oa]$/i.test(caminho.status.trim());
}

function detalhes(caminho: Caminho, agora: Date, conquistada: boolean): string[] {
  const linhas: string[] = [];
  if (caminho.descricao) linhas.push(caminho.descricao);
  if (caminho.protocolo) linhas.push(`Protocolo ${caminho.protocolo}`);
  if (caminho.prazo) {
    // Prazo de quem já respondeu, ou de pauta conquistada, não é cobrança: sem marca de vencido.
    const vencido =
      !conquistada && !caminhoRespondido(caminho) && prazoVencido(caminho.prazo, agora);
    linhas.push(
      vencido
        ? `Prazo de resposta ${textoDoPrazo(caminho.prazo, agora, true)}`
        : `Prazo de resposta: ${formatarDia(caminho.prazo)}`,
    );
  }
  if (caminho.prorrogado) linhas.push('Prazo prorrogado');
  if (caminho.pessoas_necessarias !== null)
    linhas.push(
      `${String(caminho.voluntarios ?? 0)} de ${String(caminho.pessoas_necessarias)} voluntários`,
    );
  return linhas;
}

/**
 * Caminhos escolhidos por quem cuida da pauta, cada um com o status escrito (a cor nunca é o único sinal). A
 * proposta aberta tem o "Vou ajudar", que leva ao bot com o slug da pauta.
 */
export function Caminhos({
  caminhos,
  slug,
  conquistada = false,
  agora = new Date(),
}: {
  caminhos: readonly Caminho[];
  slug: string;
  /** Pauta conquistada não "ainda vai escolher caminhos": sem caminho, a seção some (SCRUM-354). */
  conquistada?: boolean;
  /** O "hoje" dos prazos vencidos; nos testes, uma data fixa. */
  agora?: Date;
}) {
  if (conquistada && caminhos.length === 0) return null;
  return (
    <section className={estilos.secao} aria-labelledby="caminhos-titulo">
      <h2 id="caminhos-titulo" className={estilos.secaoTitulo}>
        Caminhos
      </h2>
      {caminhos.length === 0 ? (
        <p className={estilos.vazio}>
          Ainda não há caminho aberto. Ele abre depois que a meta é batida e a curadoria escolhe
          como cobrar.
        </p>
      ) : (
        <ul className={estilos.caminhos}>
          {caminhos.map((caminho, i) => (
            <li key={i} className={estilos.caminho}>
              <i
                className={estilos.glifoPequeno}
                style={{ '--c': corDoCaminho(caminho) } as CSSProperties}
                aria-hidden="true"
              />
              <div>
                <strong className={estilos.caminhoTipo}>{TIPOS[caminho.tipo]}</strong>
                <span className={estilos.caminhoStatus}>{rotuloStatusCaminho(caminho.status)}</span>
                {explicacaoDe(caminho) && (
                  <p>
                    {explicacaoDe(caminho)}
                    {caminho.tipo === 'falabr' && (
                      <>
                        {' '}
                        <Link href={linkDoManual('falabr')} aria-label="Saiba mais sobre o Fala.BR">
                          Saiba mais
                        </Link>
                      </>
                    )}
                  </p>
                )}
                {detalhes(caminho, agora, conquistada).map((linha) => (
                  <span key={linha} className={estilos.detalhe}>
                    {linha}
                  </span>
                ))}
                {caminho.tipo === 'proposta' && caminho.status === 'aberta' && (
                  <VouAjudar slug={slug} titulo={caminho.descricao ?? ''} />
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
      {!conquistada && (
        <p className={estilos.regra}>
          <b>Regra:</b> uma solução da comunidade nunca fecha a pauta. A cobrança continua até a
          universidade resolver, e só vira conquista quando a maioria de quem apoiou confirma.
        </p>
      )}
    </section>
  );
}
