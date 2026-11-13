export { META_MAXIMA, META_MINIMA, calcularMeta } from './pauta/meta';
export type { BlocoParaMeta } from './pauta/meta';

export { conferirAnonimato } from './compartilhado/anonimato';
export type {
  Achado,
  MotivoAchado,
  OpcoesDeConferencia,
  Severidade,
  Veredicto,
} from './compartilhado/anonimato';

export {
  MARCA_DE_REMOVIDO,
  gerarTextoFalaBr,
  prepararParaProtocolar,
} from './caminhos/texto-falabr';
export type { PautaParaTexto, TextoFalaBr, TextoParaProtocolar } from './caminhos/texto-falabr';
export { textoFalaBrDaPauta } from './caminhos/texto-falabr-da-pauta';

export {
  PRAZO_INICIAL_DIAS,
  PRAZO_PRORROGACAO_DIAS,
  calcularPrazo,
  diasAteOPrazo,
  prazoLegal,
} from './caminhos/prazo';
export type { ParametrosDePrazo, Prazo, TipoCaminho } from './caminhos/prazo';

export { registrarProtocolo } from './caminhos/caminho-registro';
export type {
  MotivoRecusaProtocolo,
  RegistroDeProtocolo,
  ResultadoProtocolo,
} from './caminhos/caminho-registro';

export { QUORUM_MINIMO, apurarConferencia } from './conferencia/conferencia';
export type {
  Apuracao,
  ContagemRespostas,
  ParametrosApuracao,
  RespostaConferencia,
  ResultadoApuracao,
} from './conferencia/conferencia';

export { interpretarResposta } from './conferencia/conferencia';
export { registrarRespostaConferencia } from './conferencia/conferencia-registro';
export type {
  MotivoRecusa,
  RegistroDeResposta,
  ResultadoRegistro,
} from './conferencia/conferencia-registro';

export {
  LIMITE_PARECIDAS,
  SIMILARIDADE_MINIMA,
  STATUS_ABERTOS,
  buscarPautasParecidas,
  listarBlocos,
  palavrasDe,
  termosDaBusca,
} from './pauta/pautas-parecidas';
export type { BlocoParaRelato, BuscaDeParecidas, PautaParecida } from './pauta/pautas-parecidas';

export { ORCAMENTO_SEM_VERIFICACAO, PRIORIDADE, planejarEnvio } from './avisos/envio';
export type { Disparo, ParametrosDeEnvio, PlanoDeEnvio, TipoDisparo } from './avisos/envio';

export {
  PREFIXO_IDENTIDADE_TELEGRAM,
  RESERVA_EXPIRA_MS,
  VALIDADE_DO_AVISO_MS,
  enfileirarDisparos,
  registrarEntrega,
  registrarEnvio,
  registrarFalha,
  registrarFalhaDeEntrega,
  renovarReserva,
  reservarLote,
} from './avisos/fila';

export {
  MODELO_META_BATIDA,
  PRAZO_DO_AVISO_DE_META_MS,
  enfileirarAvisoMetaBatida,
  pautasComMetaBatidaSemAviso,
} from './avisos/aviso-meta-batida';
export type { CanalDoBot, DisparoReservado, NovoAviso, ParametrosDeLote } from './avisos/fila';

export { ErroDeRegra } from './compartilhado/erros';
export type { CodigoErroDeRegra } from './compartilhado/erros';

export { TIPOS_EVENTO, registrarEvento } from './compartilhado/eventos';
export type {
  DadosPorTipo,
  NovoEventoDeDominio,
  OrigemEvento,
  TipoEvento,
} from './compartilhado/eventos';

export {
  MODELO_PAUTA_RECUSADA,
  PRAZO_DE_CURADORIA_MS,
  aprovarPauta,
  buscarPautaDaCuradoria,
  listarFilaDeCuradoria,
  listarPautasDaCuradoria,
  recusarPauta,
} from './pauta/curadoria';
export type { PautaDaCuradoria, PautaNaFila, ResultadoDecisao } from './pauta/curadoria';

export { aprovarRelato, listarRelatosPendentes, recusarRelato } from './pauta/moderacao';
export type {
  DecisaoDeModeracao,
  PautaComRelatosPendentes,
  RelatoPendente,
  ResultadoModeracao,
} from './pauta/moderacao';

export { listarLinhaDoTempo } from './pauta/linha-do-tempo';
export type { EventoDaLinha } from './pauta/linha-do-tempo';

export { TRANSICOES, podeTransicionar, transicionarStatus } from './pauta/status';
export type { Transicao } from './pauta/status';

export {
  CATEGORIA_A_CLASSIFICAR,
  DESCRICAO_MAXIMA,
  TITULO_MAXIMO,
  criarPauta,
  gerarSlug,
} from './pauta/pauta';
export type { NovaPautaDoEstudante, ResultadoCriacao } from './pauta/pauta';

export { SEM_APOIO, registrarApoio } from './pauta/apoio';
export type { NovoApoio, ResultadoApoio } from './pauta/apoio';

export { RELATO_MAXIMO, adicionarRelato } from './pauta/relato';
export type { NovoRelatoDoEstudante, ResultadoRelato } from './pauta/relato';

export { processarUmaVez } from './compartilhado/processar-uma-vez';
export type { ResultadoProcessamento } from './compartilhado/processar-uma-vez';

export {
  STATUS_COM_CAMINHOS,
  abrirCaminho,
  caminhosDaPauta,
  pautasDoOwner,
} from './caminhos/caminhos';
export type {
  CaminhoDaPauta,
  NovoCaminho,
  PautaDoOwner,
  ResultadoCaminho,
} from './caminhos/caminhos';

export {
  propostasAbertas,
  publicarProposta,
  registrarExecucaoProposta,
  registrarVoluntario,
} from './caminhos/proposta';
export type {
  NovaProposta,
  PropostaAberta,
  ResultadoExecucao,
  ResultadoPublicacao,
  ResultadoVoluntario,
} from './caminhos/proposta';

export {
  DIAS_DE_CONFERENCIA,
  MODELO_RESPOSTA_OFICIAL,
  RESUMO_NO_AVISO_MAXIMO,
  registrarPromessa,
} from './caminhos/promessa';
export type { NovaPromessa } from './caminhos/promessa';

export { encerrarConferencia } from './conferencia/conferencia-apuracao';
export type { ResultadoEncerramento } from './conferencia/conferencia-apuracao';

export {
  DIAS_SEM_ATIVIDADE,
  LIMITE_DE_OWNERS,
  adicionarCoOwner,
  podeVirarCoOwner,
  registrarAtividadeOwner,
  registrarAtividadePorTelefone,
  removerOwnerInativo,
} from './pauta/owners';
export type { ResultadoCoOwner } from './pauta/owners';

export {
  MODELO_CONFERENCIA,
  abrirConferencia,
  fecharConferencia,
  promessasParaAbrir,
  promessasParaFechar,
} from './conferencia/conferencia-agenda';
export type { ResultadoAbertura, ResultadoFecho } from './conferencia/conferencia-agenda';

export {
  DIAS_DE_ANTECEDENCIA_DO_PRAZO,
  DIA_DO_AVISO_DE_INATIVIDADE,
  MODELO_LEMBRETE_PRAZO,
  MODELO_OWNER_INATIVO,
  enfileirarAvisosDeInatividade,
  enfileirarLembretesDePrazo,
  removerOwnersAvisados,
} from './avisos/lembretes';

export { diaEmMaceio, formatarDia } from './compartilhado/datas';

export { sairDoLumens } from './estudante/sair';
export type { ResultadoSaida } from './estudante/sair';

export {
  CODIGO_EXPIRA_MS,
  DIGITOS_DO_CODIGO,
  DOMINIO_UFAL,
  EMAIL_MAXIMO,
  MAX_TENTATIVAS,
  REENVIO_APOS_MS,
  apagarCodigo,
  concluirVerificacao,
  conferirCodigo,
  cursoValido,
  emailInstitucional,
  esperaParaReenviar,
  gerarCodigo,
  guardarCodigo,
  hashDoCodigo,
  normalizarEmail,
  vincularEmail,
} from './estudante/verificacao';
export type {
  NovoVinculo,
  ResultadoConclusao,
  ResultadoConferencia,
  ResultadoEmail,
  ResultadoVinculo,
} from './estudante/verificacao';

export { documentosDeResposta, registrarDocumentoDeResposta } from './caminhos/documento-resposta';
export type { DocumentoDaPauta, ResultadoDocumento } from './caminhos/documento-resposta';
