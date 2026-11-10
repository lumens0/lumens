export { META_MAXIMA, META_MINIMA, calcularMeta } from './meta';
export type { BlocoParaMeta } from './meta';

export { conferirAnonimato } from './anonimato';
export type { Achado, MotivoAchado, OpcoesDeConferencia, Severidade, Veredicto } from './anonimato';

export { gerarTextoFalaBr } from './texto-falabr';
export type { PautaParaTexto, TextoFalaBr } from './texto-falabr';
export { textoFalaBrDaPauta } from './texto-falabr-da-pauta';

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
  renovarReserva,
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
  MODELO_PAUTA_RECUSADA,
  PRAZO_DE_CURADORIA_MS,
  aprovarPauta,
  buscarPautaDaCuradoria,
  listarFilaDeCuradoria,
  listarPautasDaCuradoria,
  recusarPauta,
} from './curadoria';
export type { PautaDaCuradoria, PautaNaFila, ResultadoDecisao } from './curadoria';

export { listarLinhaDoTempo } from './linha-do-tempo';
export type { EventoDaLinha } from './linha-do-tempo';

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

export { STATUS_COM_CAMINHOS, abrirCaminho, caminhosDaPauta, pautasDoOwner } from './caminhos';
export type { CaminhoDaPauta, NovoCaminho, PautaDoOwner, ResultadoCaminho } from './caminhos';

export { registrarExecucaoProposta } from './proposta';
export type { ResultadoExecucao } from './proposta';

export { DIAS_DE_CONFERENCIA, MODELO_RESPOSTA_OFICIAL, registrarPromessa } from './promessa';
export type { NovaPromessa } from './promessa';

export { encerrarConferencia } from './conferencia-apuracao';
export type { ResultadoEncerramento } from './conferencia-apuracao';

export {
  DIAS_SEM_ATIVIDADE,
  LIMITE_DE_OWNERS,
  adicionarCoOwner,
  registrarAtividadeOwner,
  registrarAtividadePorTelefone,
  removerOwnerInativo,
} from './owners';
export type { ResultadoCoOwner } from './owners';

export {
  MODELO_CONFERENCIA,
  abrirConferencia,
  fecharConferencia,
  promessasParaAbrir,
  promessasParaFechar,
} from './conferencia-agenda';
export type { ResultadoAbertura, ResultadoFecho } from './conferencia-agenda';

export {
  DIAS_DE_ANTECEDENCIA_DO_PRAZO,
  DIA_DO_AVISO_DE_INATIVIDADE,
  MODELO_LEMBRETE_PRAZO,
  MODELO_OWNER_INATIVO,
  enfileirarAvisosDeInatividade,
  enfileirarLembretesDePrazo,
  removerOwnersAvisados,
} from './lembretes';

export { diaEmMaceio, formatarDia } from './datas';
