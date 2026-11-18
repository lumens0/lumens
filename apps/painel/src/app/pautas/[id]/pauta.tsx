import {
  CATEGORIAS,
  MOTIVO_RECUSA_MAXIMO,
  type BlocoParaRelato,
  type DetalhePautaDaCuradoria,
  type EventoDaLinha,
} from '@lumens/dominio';
import Link from 'next/link';
import estilos from '../../painel.module.css';
import { dataHora, textoDoPrazo } from '../../prazo';
import { Foto } from '../../arquivos';
import { ACEITA_PROMESSA } from './promessa/formulario';
import { PREFIXO_FOTO_VISTA } from './decisoes';
import { LinhaDoTempo } from './linha-do-tempo/linha';
import { STATUS } from '../status';
import { AjustesDeMeta } from './ajustes-de-meta';
import { AjustesDePrazo } from './ajustes-de-prazo';

const ERRO: Record<string, string> = {
  pauta_inexistente: 'A pauta não foi encontrada.',
  motivo_obrigatorio: 'Para recusar, escreva o motivo. Ele é enviado a quem criou a pauta.',
  motivo_invalido: 'O motivo da urgência deve ter até 200 caracteres e uma única linha.',
  pauta_nao_publica: 'A urgência só pode ser alterada em pautas públicas.',
  motivo_longo: `O motivo passou de ${String(MOTIVO_RECUSA_MAXIMO)} caracteres. Resuma e recuse de novo.`,
  ja_decidida: 'Outra pessoa da curadoria já decidiu esta pauta.',
  categoria_invalida: 'Escolha uma categoria válida para esta pauta.',
  relato_com_dado_pessoal:
    'O relato de quem criou a pauta tem e-mail ou telefone. Recuse só o relato e aprove depois.',
  relato_mudou:
    'O relato de quem criou a pauta mudou desde que a tela abriu (foto nova ou relato novo). Confira e aprove de novo.',
  sem_relato: 'Esta pauta não tem relato pendente de quem a criou.',
  pauta_nao_publicada:
    'A categoria só muda depois de a pauta ser aprovada; antes disso, escolha ao aprovar.',
};

type Acao = (formulario: FormData) => Promise<void>;

async function acaoVazia(): Promise<void> {}

/** Tela da pauta para a curadoria (5.2, SCRUM-168): o que foi relatado e as duas decisões. */
const TIPO_CAMINHO = {
  falabr: 'Fala.BR',
  comunidade: 'Comunidade',
  representante: 'Representante',
};
const MODERACAO = { pendente: 'Pendente', aprovado: 'Aprovado', recusado: 'Recusado' };
const MOTIVO_ACHADO: Record<string, string> = {
  nome_conhecido: 'nome de quem participa',
  email: 'e-mail',
  telefone: 'telefone',
  matricula: 'matrícula',
  possivel_nome: 'possível nome de pessoa',
};

export function Pauta({
  pauta,
  erro,
  feito,
  avisados,
  eventos = [],
  aprovar,
  recusar,
  definirCategoria = async () => {},
  atualizarUrgencia = async () => {},
  recusarRelatoDeOrigem = async () => {},
  linhaAberta = false,
  categoriaSalva,
  blocos = [],
  corrigirBloco = acaoVazia,
  ajustarMeta = acaoVazia,
  prorrogarPrazo,
  corrigirProtocolo,
  remarcarPromessa,
}: {
  pauta: DetalhePautaDaCuradoria;
  erro?: string | undefined;
  feito?: string | undefined;
  eventos?: EventoDaLinha[];
  /** Vem depois de registrar a promessa: quantos apoiadores entraram na fila de aviso. */
  avisados?: number | undefined;
  aprovar: Acao;
  recusar: Acao;
  definirCategoria?: Acao;
  atualizarUrgencia?: Acao;
  recusarRelatoDeOrigem?: Acao;
  linhaAberta?: boolean;
  categoriaSalva?: boolean;
  blocos?: BlocoParaRelato[];
  corrigirBloco?: Acao;
  ajustarMeta?: Acao;
  prorrogarPrazo?: Acao;
  corrigirProtocolo?: Acao;
  remarcarPromessa?: Acao;
}) {
  const aviso = erro === undefined ? undefined : ERRO[erro];
  const categoria =
    pauta.categoria === 'a_classificar'
      ? 'A classificar'
      : ((CATEGORIAS as Record<string, string | undefined>)[pauta.categoria] ?? pauta.categoria);
  const relatoComDadoPessoal = pauta.relatos.some(
    (relato) =>
      relato.moderacao === 'pendente' &&
      relato.achados.some((achado) => achado.severidade === 'bloqueio'),
  );
  return (
    <>
      <h1>{pauta.titulo}</h1>
      {feito === 'aprovada' && (
        <p className={estilos.aviso} role="status">
          Pauta aprovada. Ela já aparece no site e pode receber apoios; o relato de quem a criou
          também foi publicado.
        </p>
      )}
      {feito === 'relato_recusado' && (
        <p className={estilos.aviso} role="status">
          Relato recusado. A pauta continua esperando a decisão e, aprovada, vai ao site sem ele.
        </p>
      )}
      {feito === 'recusada' && (
        <p className={estilos.aviso} role="status">
          Pauta recusada. Quem criou recebe o motivo pelo WhatsApp.
        </p>
      )}
      {avisados !== undefined && (
        <p className={estilos.aviso} role="status">
          Promessa registrada.{' '}
          {avisados === 1 ? '1 apoiador vai' : `${String(avisados)} apoiadores vão`} receber o aviso
          da resposta pelo WhatsApp.
        </p>
      )}
      {categoriaSalva && <p role="status">Categoria atualizada.</p>}
      {feito === 'ajuste_prazo' && (
        <p className={estilos.aviso} role="status">
          Ajuste de prazo registrado.
        </p>
      )}
      {aviso !== undefined && (
        <p className={estilos.erro} role="alert">
          {aviso}
        </p>
      )}
      <dl className={estilos.ficha}>
        <dt>Situação</dt>
        <dd>{STATUS[pauta.status]}</dd>
        <dt>Categoria</dt>
        <dd>{categoria}</dd>
        <dt>Onde</dt>
        <dd>{pauta.bloco ?? 'Campus inteiro'}</dd>
        <dt>Criada em</dt>
        <dd>{dataHora(pauta.criadaEm)}</dd>
        {pauta.status === 'em_curadoria' && (
          <>
            <dt>Prazo</dt>
            <dd className={pauta.restanteMs < 0 ? estilos.atrasada : undefined}>
              {dataHora(pauta.prazo)} ({textoDoPrazo(pauta.restanteMs)})
            </dd>
          </>
        )}
        <dt>Foto</dt>
        <dd>{pauta.fotoChave === null ? 'Sem foto' : <Foto chave={pauta.fotoChave} />}</dd>
        {pauta.motivoRecusa !== null && (
          <>
            <dt>Motivo da recusa</dt>
            <dd>{pauta.motivoRecusa}</dd>
          </>
        )}
      </dl>
      <p className={estilos.descricaoDaPauta}>{pauta.descricao}</p>
      {feito === 'urgencia' && (
        <p className={estilos.aviso} role="status">
          Urgência atualizada.
        </p>
      )}

      <section aria-labelledby="numeros-pauta">
        <h2 id="numeros-pauta">Apoios e meta</h2>
        <p>
          {pauta.apoios} de {pauta.meta} apoios
        </p>
        <progress
          aria-label="Progresso até a meta de apoios"
          max={pauta.meta}
          value={Math.min(pauta.apoios, pauta.meta)}
        />
        {pauta.metaBatidaEm && <p>Meta batida em {dataHora(pauta.metaBatidaEm)}</p>}
      </section>

      {['em_curadoria', 'juntando_apoios'].includes(pauta.status) && (
        <AjustesDeMeta
          pautaId={pauta.id}
          meta={pauta.meta}
          blocoId={pauta.blocoId}
          blocos={blocos}
          corrigirBloco={corrigirBloco}
          ajustarMeta={ajustarMeta}
          erro={erro}
          feito={feito}
        />
      )}

      <section aria-labelledby="relatos-pauta">
        <h2 id="relatos-pauta">Relatos</h2>
        {pauta.relatos.length === 0 ? (
          <p>Nenhum relato registrado.</p>
        ) : (
          <ul className={estilos.lista}>
            {pauta.relatos.map((relato, indice) => (
              <li className={estilos.cartao} key={`${String(indice)}-${relato.texto}`}>
                <p>{relato.texto}</p>
                {relato.achados.length > 0 && (
                  <ul className={estilos.aviso}>
                    {relato.achados.map((achado) => (
                      <li key={`${String(achado.inicio)}-${achado.motivo}`}>
                        {achado.severidade === 'bloqueio' ? 'Barrar' : 'Conferir'}:{' '}
                        {MOTIVO_ACHADO[achado.motivo]} ({achado.trecho})
                      </li>
                    ))}
                  </ul>
                )}
                <p>Curso: {relato.curso ?? 'Não informado'}</p>
                <p>Situação da moderação: {MODERACAO[relato.moderacao]}</p>
                <p>Data registrada: {relato.data ? dataHora(relato.data) : 'Não registrada'}</p>
                {relato.fotoChave ? <Foto chave={relato.fotoChave} /> : <p>Sem foto</p>}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="responsaveis-pauta">
        <h2 id="responsaveis-pauta">Responsáveis</h2>
        {pauta.responsaveis.length === 0 ? (
          <p>Nenhum responsável ativo.</p>
        ) : (
          <ul>
            {pauta.responsaveis.map((responsavel, indice) => (
              <li key={indice}>{responsavel.curso ?? 'Curso não informado'}</li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="caminhos-pauta">
        <h2 id="caminhos-pauta">Caminhos abertos</h2>
        {pauta.caminhos.length === 0 ? (
          <p>Nenhum caminho aberto.</p>
        ) : (
          <ul>
            {pauta.caminhos.map((caminho, indice) => (
              <li key={indice}>
                {TIPO_CAMINHO[caminho.tipo]}
                {caminho.protocolo ? ` · Protocolo ${caminho.protocolo}` : ''}
                {caminho.prazo ? ` · Prazo ${caminho.prazo}` : ''}
              </li>
            ))}
          </ul>
        )}
      </section>

      {pauta.promessa && (
        <section aria-labelledby="promessa-pauta">
          <h2 id="promessa-pauta">Promessa registrada</h2>
          <p>{pauta.promessa.resumo}</p>
          <p>Quem respondeu: {pauta.promessa.fonte}</p>
          <p>Data prometida: {pauta.promessa.dataEntrega}</p>
          <p>Conferência aberta até {dataHora(pauta.promessa.conferenciaFechaEm)}</p>
          <p>
            Votos: {pauta.promessa.votos.sim} sim, {pauta.promessa.votos.em_parte} em parte,{' '}
            {pauta.promessa.votos.nao} não
          </p>
        </section>
      )}

      <LinhaDoTempo
        pautaId={pauta.id}
        titulo={pauta.titulo}
        eventos={eventos}
        recolhivel
        aberta={linhaAberta}
      />

      {prorrogarPrazo && corrigirProtocolo && remarcarPromessa && (
        <AjustesDePrazo
          pauta={pauta}
          eventos={eventos}
          erro={erro}
          prorrogar={prorrogarPrazo}
          corrigir={corrigirProtocolo}
          remarcar={remarcarPromessa}
        />
      )}

      {ACEITA_PROMESSA.includes(pauta.status) && (
        <Link className={estilos.acao} href={`/pautas/${pauta.id}/promessa`}>
          Registrar resposta e promessa
        </Link>
      )}

      {pauta.status === 'em_curadoria' && relatoComDadoPessoal && (
        <form action={recusarRelatoDeOrigem} className={estilos.aviso} role="alert">
          <p>
            O relato de quem criou a pauta tem e-mail ou telefone. Aprovar publicaria esse dado:
            recuse só o relato e depois aprove a pauta sem ele.
          </p>
          <input type="hidden" name="pautaId" value={pauta.id} />
          <button className={estilos.botaoPerigo} type="submit">
            Recusar só o relato
          </button>
        </form>
      )}

      {pauta.status === 'em_curadoria' && (
        <div className={estilos.decisoes}>
          <form action={aprovar} className={estilos.cartao}>
            <h2>Aprovar</h2>
            <p className={estilos.detalhes}>
              A pauta passa a aparecer no site e a juntar apoios. Confira antes se o texto não tem
              nome de pessoa, ofensa nem dado pessoal.
            </p>
            <p className={estilos.detalhes}>
              Aprovar a pauta também publica o relato de quem a criou. Confira o texto, a foto e os
              achados de dado pessoal.
            </p>
            <input type="hidden" name="pautaId" value={pauta.id} />
            {pauta.relatos
              .filter((relato) => relato.moderacao === 'pendente')
              .map((relato) => (
                <input
                  key={relato.id}
                  type="hidden"
                  name={`${PREFIXO_FOTO_VISTA}${relato.id}`}
                  value={relato.fotoChave ?? ''}
                />
              ))}
            <label htmlFor="categoria">Categoria</label>
            <select id="categoria" name="categoria" required defaultValue="">
              <option value="" disabled>
                Escolha uma categoria
              </option>
              {Object.entries(CATEGORIAS).map(([valor, rotulo]) => (
                <option key={valor} value={valor}>
                  {rotulo}
                </option>
              ))}
            </select>
            <label>
              <input type="checkbox" name="urgente" /> Marcar como urgente
            </label>
            <button className={estilos.botao} type="submit" style={{ marginTop: 10 }}>
              Aprovar pauta
            </button>
          </form>
          <form action={recusar} className={estilos.cartao}>
            <h2>Recusar</h2>
            <input type="hidden" name="pautaId" value={pauta.id} />
            <label htmlFor="motivo">Motivo (vai pelo WhatsApp para quem criou a pauta)</label>
            <textarea id="motivo" name="motivo" required maxLength={MOTIVO_RECUSA_MAXIMO} />
            <button className={estilos.botaoPerigo} type="submit">
              Recusar pauta
            </button>
          </form>
        </div>
      )}
      {pauta.status !== 'em_curadoria' && pauta.status !== 'recusada' && (
        <form action={atualizarUrgencia} className={estilos.cartao}>
          <h2>Urgência</h2>
          <input type="hidden" name="pautaId" value={pauta.id} />
          <label>
            <input type="checkbox" name="urgente" defaultChecked={pauta.urgente} /> Marcar como
            urgente
          </label>
          <label htmlFor="motivo-urgencia">Motivo curto (opcional)</label>
          <input
            id="motivo-urgencia"
            name="motivo"
            maxLength={200}
            defaultValue={pauta.urgenteMotivo ?? ''}
          />
          <p className={estilos.detalhes}>
            O motivo fica só no painel. No site aparece apenas que a pauta é urgente.
          </p>
          <button className={estilos.botao} type="submit">
            Salvar urgência
          </button>
        </form>
      )}
      {pauta.status !== 'em_curadoria' && pauta.status !== 'recusada' && (
        <form action={definirCategoria} className={estilos.cartao}>
          <h2>Trocar categoria</h2>
          <input type="hidden" name="pautaId" value={pauta.id} />
          <label htmlFor="nova-categoria">Categoria</label>
          <select id="nova-categoria" name="categoria" required defaultValue={pauta.categoria}>
            <option value="" disabled>
              Escolha uma categoria
            </option>
            {Object.entries(CATEGORIAS).map(([valor, rotulo]) => (
              <option key={valor} value={valor}>
                {rotulo}
              </option>
            ))}
          </select>
          <button className={estilos.botao} type="submit">
            Salvar categoria
          </button>
        </form>
      )}
    </>
  );
}
