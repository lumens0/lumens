import { Fluxos } from '@lumens/marca/fluxo';
import estilos from '../painel.module.css';
import { FLUXO_DE_ADMINISTRACAO, FLUXOS_DA_CURADORIA } from './fluxos';

const REGRAS = [
  'Nada de nome de pessoa, ofensa ou dado pessoal vai ao site: nem no texto, nem na foto.',
  'Na dúvida entre aprovar e recusar, recuse com um motivo claro: quem criou pode corrigir e tentar de novo.',
  'Se outra pessoa da curadoria já decidiu a mesma pauta, o painel avisa e nada é gravado duas vezes.',
  'Só a conferência dos apoiadores faz uma pauta virar conquista. A curadoria registra a promessa, não o resultado.',
  'A caixa “Conferi…” é exigida pelo servidor também: sem ela, nada é aprovado.',
];

/** Manual da curadoria: os fluxos do painel em cards e as regras que valem sempre. */
export function ManualDaCuradoria({ administrador }: { administrador: boolean }) {
  const fluxos = administrador
    ? [...FLUXOS_DA_CURADORIA, FLUXO_DE_ADMINISTRACAO]
    : FLUXOS_DA_CURADORIA;
  return (
    <>
      <h1>Manual da curadoria</h1>
      <p className={estilos.apoio}>
        Como decidir pautas, moderar relatos e registrar promessas no painel. Escolha o que você vai
        fazer e ande pelos cards; toque num card para ver os detalhes.
      </p>
      <section aria-labelledby="fluxos-curadoria">
        <h2 id="fluxos-curadoria">Passo a passo</h2>
        <Fluxos fluxos={fluxos} rotulo="Passo a passo da curadoria" />
      </section>
      <section aria-labelledby="regras-curadoria">
        <h2 id="regras-curadoria">Regras que valem sempre</h2>
        <ul>
          {REGRAS.map((regra) => (
            <li key={regra}>{regra}</li>
          ))}
        </ul>
      </section>
    </>
  );
}
