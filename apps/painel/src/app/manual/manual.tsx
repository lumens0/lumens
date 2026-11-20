import estilos from '../painel.module.css';
import { FLUXO_DE_ADMINISTRACAO, FLUXOS_DA_CURADORIA } from './fluxos';
import { FluxosDoManual } from './fluxos-do-manual';

/** Manual da curadoria: o passo a passo de cada tarefa e as regras que valem sempre. */
export function ManualDaCuradoria({ administrador }: { administrador: boolean }) {
  const fluxos = administrador
    ? [...FLUXOS_DA_CURADORIA, FLUXO_DE_ADMINISTRACAO]
    : FLUXOS_DA_CURADORIA;
  return (
    <>
      <h1>Manual da curadoria</h1>
      <p className={estilos.apoio}>O passo a passo de cada tarefa e as regras que valem sempre.</p>
      <FluxosDoManual fluxos={fluxos} />
      <h2>Regras que valem sempre</h2>
      <ul className={estilos.regras}>
        <li>
          Decida pautas novas em até <b>24 horas</b>.
        </li>
        <li>Nada de nome de pessoa, ofensa ou dado pessoal: nem no texto, nem nas fotos.</li>
        <li>
          A meta vai de <b>30 a 300</b> apoios.
        </li>
        <li>
          Motivo de recusa: até <b>500 caracteres</b>.
        </li>
        <li>
          Conferência de <b>7 dias</b>, com quórum de <b>10%</b> de quem apoiou.
        </li>
        <li>
          Nem a curadoria nem quem cuida marcam conquista: o resultado sai pelo voto de quem apoiou.
        </li>
      </ul>
    </>
  );
}
