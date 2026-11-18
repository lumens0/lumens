import { dataDeEntregaMaxima } from '@lumens/dominio';
import type { DetalhePautaDaCuradoria, EventoDaLinha } from '@lumens/dominio';
import estilos from '../../painel.module.css';
import { Enviar } from '../../enviar';

type Acao = (formulario: FormData) => Promise<void>;

const ERROS: Record<string, string> = {
  entrada_invalida: 'Informe motivo e fonte em uma linha (até 200 e 120 caracteres).',
  caminho_inexistente: 'O caminho não foi encontrado.',
  caminho_sem_protocolo: 'O ajuste exige um protocolo Fala.BR registrado.',
  prazo_vencido: 'O prazo já venceu e não pode ser prorrogado.',
  ja_prorrogado: 'Este prazo já foi prorrogado uma vez.',
  data_invalida: 'Informe uma data válida, hoje ou anterior, e não posterior à criação da pauta.',
  pauta_criada_depois: 'A data do protocolo não pode ser anterior à criação da pauta.',
  promessa_inexistente: 'A promessa ativa não foi encontrada.',
  conferencia_aberta: 'A conferência já abriu; a data prometida não pode mais ser remarcada.',
  data_no_passado: 'A nova data prometida precisa ser futura.',
  data_distante: 'A nova data prometida pode ser no máximo dois anos à frente.',
};

// Maceió é UTC−3 o ano inteiro (sem horário de verão): deslocar o instante alinha o `min`/`max` do
// navegador ao dia civil que o domínio valida em `America/Maceio`.
const DESLOCAMENTO_MACEIO_MS = 3 * 3_600_000;
const MS_POR_DIA = 86_400_000;

function diaEmMaceio(instante: number): string {
  return new Date(instante - DESLOCAMENTO_MACEIO_MS).toISOString().slice(0, 10);
}

function CamposDeAuditoria() {
  return (
    <>
      <label>
        Motivo
        <textarea name="motivo" required maxLength={200} />
      </label>
      <label>
        Fonte
        <input name="fonte" required maxLength={120} />
      </label>
    </>
  );
}

export function AjustesDePrazo({
  pauta,
  eventos,
  erro,
  prorrogar,
  corrigir,
  remarcar,
}: {
  pauta: DetalhePautaDaCuradoria;
  eventos: EventoDaLinha[];
  erro?: string | undefined;
  prorrogar: Acao;
  corrigir: Acao;
  remarcar: Acao;
}) {
  const caminhos = pauta.caminhos.filter(
    (caminho) => caminho.tipo === 'falabr' && caminho.protocolo !== null,
  );
  const promessa = pauta.promessa;
  const conferenciaAberta = promessa !== null && Date.now() >= promessa.conferenciaAbreEm.getTime();
  const mostrar =
    pauta.status !== 'em_curadoria' &&
    pauta.status !== 'recusada' &&
    pauta.status !== 'conquistada';
  if (!mostrar || (caminhos.length === 0 && promessa === null)) return null;
  return (
    <section aria-labelledby="ajustes-prazo">
      <h2 id="ajustes-prazo">Ajustes de prazo</h2>
      {erro && ERROS[erro] && (
        <p className={estilos.erro} role="alert">
          {ERROS[erro]}
        </p>
      )}
      {caminhos.map((caminho) => {
        const prorrogado = eventos.some(
          (evento) =>
            evento.dados.caminho_id === caminho.id &&
            (evento.tipo === 'prazo_prorrogado' ||
              (evento.tipo === 'protocolo_registrado' && evento.dados.prorrogado === true)),
        );
        return (
          <div className={estilos.cartao} key={caminho.id}>
            <h3>Fala.BR · {caminho.protocolo}</h3>
            <form action={prorrogar}>
              <input type="hidden" name="pautaId" value={pauta.id} />
              <input type="hidden" name="caminhoId" value={caminho.id} />
              <CamposDeAuditoria />
              <Enviar className={estilos.botao} desabilitado={prorrogado || caminho.prazo === null}>
                {prorrogado ? 'Prazo já prorrogado' : 'Registrar prorrogação'}
              </Enviar>
            </form>
            <form action={corrigir}>
              <input type="hidden" name="pautaId" value={pauta.id} />
              <input type="hidden" name="caminhoId" value={caminho.id} />
              <label>
                Data correta do protocolo
                <input type="date" name="data" required max={diaEmMaceio(Date.now())} />
              </label>
              <CamposDeAuditoria />
              <Enviar className={estilos.botao}>Corrigir data do protocolo</Enviar>
            </form>
          </div>
        );
      })}
      {promessa && conferenciaAberta && (
        <p className={estilos.aviso} role="status">
          A conferência já abriu; a data prometida não pode ser remarcada.
        </p>
      )}
      {promessa && !conferenciaAberta && (
        <form action={remarcar} className={estilos.cartao}>
          <input type="hidden" name="pautaId" value={pauta.id} />
          <h3>Promessa de {promessa.dataEntrega}</h3>
          <input type="hidden" name="promessaId" value={promessa.id} />
          <label>
            Nova data prometida
            <input
              type="date"
              name="dataEntrega"
              required
              min={diaEmMaceio(Date.now() + MS_POR_DIA)}
              max={dataDeEntregaMaxima()}
            />
          </label>
          <CamposDeAuditoria />
          <Enviar className={estilos.botao}>Remarcar data prometida</Enviar>
        </form>
      )}
    </section>
  );
}
