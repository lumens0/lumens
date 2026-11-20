// A última busca que a pessoa enviou (a URL muda depois de uma pausa), guardada fora do React: os
// chips de etapa e de pendência são montados com a busca que a página ainda mostra, e um clique
// neles antes de o servidor responder derrubaria a busca já enviada.
import { mesmaBusca } from './url-da-lista';

let enviada: string | null = null;

/** Guarda a busca enviada, ou a que chegou de fora (entrada na tela, "Limpar filtros"). */
export function registrarBusca(q: string): void {
  enviada = q;
}

/** A busca que vale agora: a enviada por último; sem nenhuma, a que a página mostra. */
export function buscaVigente(q: string): string {
  return enviada === null || mesmaBusca(enviada, q) ? q : enviada;
}
