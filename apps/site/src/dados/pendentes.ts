import { escolhaSeguinte, type EscolhaPendente, type Escolhas } from './filtros';

/**
 * A última escolha de etapa e de bloco enviada ao servidor que a página ainda não refletiu, no
 * navegador, compartilhada por tudo que muda esses filtros (as linhas do Início, a folha de blocos e
 * os chips da lista). Assim, dois cliques antes de a primeira navegação terminar não perdem a
 * primeira escolha, nem entre controles diferentes. Vale por pouco tempo (`escolhaSeguinte`).
 */
let pendente: EscolhaPendente | null = null;

/** Chave de uma escolha que não depende da ordem dos itens (a URL devolve na ordem do catálogo). */
export function chaveDe(escolhas: Escolhas): string {
  return JSON.stringify([[...escolhas.status].sort(), [...escolhas.bloco].sort()]);
}

/** O servidor devolveu o que a página mostra: se era a escolha pendente, ela já foi absorvida. */
export function absorver(atual: Escolhas): void {
  if (pendente !== null && chaveDe(pendente.escolhas) === chaveDe(atual)) pendente = null;
}

/** Liga ou desliga um item partindo da escolha pendente e a registra como a nova pendente. */
export function proximaEscolha(
  atual: Escolhas,
  grupo: keyof Escolhas,
  valor: string,
  agora: number = Date.now(),
): Escolhas {
  const proxima = escolhaSeguinte({ atual, pendente, agora, grupo, valor });
  pendente = { escolhas: proxima, em: agora };
  return proxima;
}

/** Registra uma escolha feita de uma vez (a folha de blocos) como a pendente. */
export function registrarEscolha(escolhas: Escolhas, agora: number = Date.now()): void {
  pendente = { escolhas, em: agora };
}

/** Só para os testes. */
export function limparPendente(): void {
  pendente = null;
}
