export { META_MAXIMA, META_MINIMA, calcularMeta } from './meta';
export type { BlocoParaMeta } from './meta';

export { conferirAnonimato } from './anonimato';
export type { Achado, MotivoAchado, OpcoesDeConferencia, Severidade, Veredicto } from './anonimato';

export { gerarTextoFalaBr } from './texto-falabr';
export type { PautaParaTexto, TextoFalaBr } from './texto-falabr';

export {
  PRAZO_INICIAL_DIAS,
  PRAZO_PRORROGACAO_DIAS,
  calcularPrazo,
  diasAteOPrazo,
  prazoLegal,
} from './prazo';
export type { ParametrosDePrazo, Prazo, TipoCaminho } from './prazo';

export { registrarProtocolo } from './caminho-registro';
export type {
  MotivoRecusaProtocolo,
  RegistroDeProtocolo,
  ResultadoProtocolo,
} from './caminho-registro';

export { QUORUM_MINIMO, apurarConferencia } from './conferencia';
export type {
  Apuracao,
  ContagemRespostas,
  ParametrosApuracao,
  RespostaConferencia,
  ResultadoApuracao,
} from './conferencia';

export { interpretarResposta } from './conferencia';
export { registrarRespostaConferencia } from './conferencia-registro';
export type { MotivoRecusa, RegistroDeResposta, ResultadoRegistro } from './conferencia-registro';

export {
  LIMITE_PARECIDAS,
  SIMILARIDADE_MINIMA,
  STATUS_ABERTOS,
  buscarPautasParecidas,
  listarBlocos,
  palavrasDe,
  termosDaBusca,
} from './pautas-parecidas';
export type { BlocoParaRelato, BuscaDeParecidas, PautaParecida } from './pautas-parecidas';

export { ORCAMENTO_SEM_VERIFICACAO, PRIORIDADE, planejarEnvio } from './envio';
export type { Disparo, ParametrosDeEnvio, PlanoDeEnvio, TipoDisparo } from './envio';

export {
  RESERVA_EXPIRA_MS,
  VALIDADE_DO_AVISO_MS,
  enfileirarDisparos,
  registrarEntrega,
  registrarEnvio,
  registrarFalha,
  registrarFalhaDeEntrega,
  reservarLote,
} from './fila';

export {
  MODELO_META_BATIDA,
  PRAZO_DO_AVISO_DE_META_MS,
  enfileirarAvisoMetaBatida,
  pautasComMetaBatidaSemAviso,
} from './aviso-meta-batida';
export type { DisparoReservado, NovoAviso, ParametrosDeLote } from './fila';

export { ErroDeRegra } from './erros';
export type { CodigoErroDeRegra } from './erros';

export { TIPOS_EVENTO, registrarEvento } from './eventos';
export type { DadosPorTipo, NovoEventoDeDominio, OrigemEvento, TipoEvento } from './eventos';

export {
  PRAZO_DE_CURADORIA_MS,
  aprovarPauta,
  listarFilaDeCuradoria,
  recusarPauta,
} from './curadoria';
export type { PautaNaFila, ResultadoDecisao } from './curadoria';

export { TRANSICOES, podeTransicionar, transicionarStatus } from './status';
export type { Transicao } from './status';

export {
  CATEGORIA_A_CLASSIFICAR,
  DESCRICAO_MAXIMA,
  TITULO_MAXIMO,
  criarPauta,
  gerarSlug,
} from './pauta';
export type { NovaPautaDoEstudante, ResultadoCriacao } from './pauta';

export { registrarApoio } from './apoio';
export type { NovoApoio, ResultadoApoio } from './apoio';

export { abrirCaminho } from './caminhos';
export type { NovoCaminho, ResultadoCaminho } from './caminhos';

export { registrarExecucaoProposta } from './proposta';
export type { ResultadoExecucao } from './proposta';

export { DIAS_DE_CONFERENCIA, registrarPromessa } from './promessa';
export type { NovaPromessa } from './promessa';

export { encerrarConferencia } from './conferencia-apuracao';
export type { ResultadoEncerramento } from './conferencia-apuracao';

export {
  DIAS_SEM_ATIVIDADE,
  LIMITE_DE_OWNERS,
  adicionarCoOwner,
  registrarAtividadeOwner,
  removerOwnerInativo,
} from './owners';
export type { ResultadoCoOwner } from './owners';
