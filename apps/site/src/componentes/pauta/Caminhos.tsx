import type { Caminho } from '@lumens/contratos';
import Link from 'next/link';
import { BotaoVouAjudar } from '../BotaoWhatsApp';
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

/** Feito em verde, juntando gente em lilás, o resto (esperando resposta) em amarelo. */
function corDoChip(status: string): 'chipFeito' | 'chipJuntando' | 'chipEsperando' {
  if (status === 'executada') return 'chipFeito';
  return status === 'aberta' ? 'chipJuntando' : 'chipEsperando';
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
          Quem cuida da pauta ainda vai escolher os caminhos para levá-la adiante.
        </p>
      ) : (
        <ul className={estilos.caminhos}>
          {caminhos.map((caminho, i) => (
            <li key={i} className={estilos.caminho}>
              <span className={estilos.caminhoTipo}>{TIPOS[caminho.tipo]}</span>
              <strong className={[estilos.chip, estilos[corDoChip(caminho.status)]].join(' ')}>
                {rotuloStatusCaminho(caminho.status)}
              </strong>
              {explicacaoDe(caminho) && (
                <span className={estilos.vazio}>
                  {explicacaoDe(caminho)}
                  {caminho.tipo === 'falabr' && (
                    <>
                      {' '}
                      <Link href="/privacidade#fala-br" aria-label="Saiba mais sobre o Fala.BR">
                        Saiba mais
                      </Link>
                    </>
                  )}
                </span>
              )}
              {detalhes(caminho, agora, conquistada).map((linha) => (
                <span key={linha} className={estilos.vazio}>
                  {linha}
                </span>
              ))}
              {caminho.tipo === 'proposta' && caminho.status === 'aberta' && (
                <BotaoVouAjudar slug={slug} titulo={caminho.descricao ?? ''} />
              )}
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
