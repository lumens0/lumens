import type { Caminho } from '@lumens/contratos';
import estilos from './pauta.module.css';

const TIPOS: Record<Caminho['tipo'], string> = {
  falabr: 'Fala.BR',
  comunidade: 'Solução da comunidade',
  representante: 'Representante',
  proposta: 'Proposta da comunidade',
};

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

/** Data civil `AAAA-MM-DD` em `DD/MM/AAAA`, sem passar por `Date` (que mudaria o dia pelo fuso). */
export function formatarDia(dia: string): string {
  const [ano, mes, d] = dia.split('-');
  return `${d ?? ''}/${mes ?? ''}/${ano ?? ''}`;
}

function detalhes(caminho: Caminho): string[] {
  const linhas: string[] = [];
  if (caminho.descricao) linhas.push(caminho.descricao);
  if (caminho.protocolo) linhas.push(`Protocolo ${caminho.protocolo}`);
  if (caminho.prazo) linhas.push(`Prazo de resposta: ${formatarDia(caminho.prazo)}`);
  if (caminho.pessoas_necessarias !== null)
    linhas.push(
      `${String(caminho.voluntarios ?? 0)} de ${String(caminho.pessoas_necessarias)} voluntários`,
    );
  return linhas;
}

/** Caminhos escolhidos pelo owner, cada um com o status escrito (a cor nunca é o único sinal). */
export function Caminhos({ caminhos }: { caminhos: readonly Caminho[] }) {
  return (
    <section className={estilos.secao} aria-labelledby="caminhos-titulo">
      <h2 id="caminhos-titulo" className={estilos.secaoTitulo}>
        Caminhos
      </h2>
      {caminhos.length === 0 ? (
        <p className={estilos.vazio}>
          O owner ainda vai escolher os caminhos para levar esta pauta adiante.
        </p>
      ) : (
        <ul className={estilos.lista}>
          {caminhos.map((caminho, i) => (
            <li key={i} className={estilos.evento}>
              <span className={estilos.caminhoTipo}>{TIPOS[caminho.tipo]}</span>
              <span>
                Status: <strong>{rotuloStatusCaminho(caminho.status)}</strong>
              </span>
              {detalhes(caminho).map((linha) => (
                <span key={linha} className={estilos.vazio}>
                  {linha}
                </span>
              ))}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
