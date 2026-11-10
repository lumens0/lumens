import type { PautaDaCuradoria } from '@lumens/dominio';
import Link from 'next/link';
import estilos from '../../../painel.module.css';

/** Status em que a pauta pode receber promessa (as transições para `prometido`). */
export const ACEITA_PROMESSA: readonly PautaDaCuradoria['status'][] = [
  'cobrando',
  'entregue_em_parte',
  'descumprida',
];

const ERRO: Record<string, string> = {
  campos_obrigatorios: 'Preencha o resumo, a fonte e a data prometida.',
  data_no_passado: 'A data prometida não pode estar no passado.',
  data_invalida: 'A data prometida não existe. Confira o dia e o mês.',
  transicao_invalida:
    'Esta pauta não pode receber promessa agora. Só pautas em cobrança, entregues em parte ou com promessa descumprida.',
};

/** Formulário da resposta oficial e da promessa (5.4, SCRUM-179). */
export function FormularioDaPromessa({
  pauta,
  hoje,
  erro,
  registrar,
}: {
  pauta: PautaDaCuradoria;
  /** `YYYY-MM-DD`: a menor data que o campo aceita. */
  hoje: string;
  erro?: string | undefined;
  registrar: (formulario: FormData) => Promise<void>;
}) {
  const aviso = erro === undefined ? undefined : ERRO[erro];
  return (
    <>
      <h1>Registrar resposta e promessa</h1>
      <p className={estilos.apoio}>
        Pauta: <Link href={`/pautas/${pauta.id}`}>{pauta.titulo}</Link>
      </p>
      {aviso !== undefined && (
        <p className={estilos.erro} role="alert">
          {aviso}
        </p>
      )}
      {!ACEITA_PROMESSA.includes(pauta.status) ? (
        <p className={estilos.aviso}>{ERRO.transicao_invalida}</p>
      ) : (
        <form action={registrar} className={estilos.formulario}>
          <input type="hidden" name="pautaId" value={pauta.id} />
          <label htmlFor="resumo">O que foi respondido e prometido</label>
          <textarea id="resumo" name="resumo" required maxLength={500} />
          <p className={estilos.detalhes}>
            Esse texto aparece na página da pauta. Não cite nome de pessoa.
          </p>
          <label htmlFor="fonte">Quem respondeu</label>
          <input id="fonte" name="fonte" required maxLength={120} />
          <p className={estilos.detalhes}>
            Por exemplo: Pró-Reitoria de Gestão Institucional, pelo Fala.BR.
          </p>
          <label htmlFor="dataEntrega">Data prometida</label>
          <input id="dataEntrega" name="dataEntrega" type="date" required min={hoje} />
          <p className={estilos.detalhes}>
            Nesse dia quem apoia a pauta recebe a pergunta &quot;Foi feito?&quot; e tem 7 dias para
            responder. Ao salvar, os apoiadores são avisados da resposta pelo WhatsApp.
          </p>
          <button className={estilos.botao} type="submit">
            Registrar promessa
          </button>
        </form>
      )}
    </>
  );
}
