import {
  CATEGORIAS,
  MOTIVO_RECUSA_MAXIMO,
  type BlocoParaRelato,
  type DetalhePautaDaCuradoria,
  type EventoDaLinha,
  versaoDoTexto,
} from '@lumens/dominio';
import Link from 'next/link';
import estilos from '../../painel.module.css';
import { dataHora } from '../../prazo';
import { SeloDePrazo, SeloDeStatus, SeloUrgente } from '../selos';
import { Foto } from '../../arquivos';
import { ACEITA_PROMESSA } from './promessa/formulario';
import { PREFIXO_FOTO_VISTA } from './decisoes';
import { LinhaDoTempo } from './linha-do-tempo/linha';
import { AjustesDeMeta } from './ajustes-de-meta';
import { AjustesDePrazo } from './ajustes-de-prazo';
import { Enviar } from '../../enviar';

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
  pauta_editada:
    'O autor editou o título ou a descrição depois que a tela abriu. Releia o texto novo (veja a linha do tempo) e aprove de novo.',
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
      <p className={estilos.selos}>
        <SeloDeStatus status={pauta.status} />
        {pauta.status === 'em_curadoria' && (
          <SeloDePrazo prazo={pauta.prazo} restanteMs={pauta.restanteMs} />
        )}
        {pauta.urgente && <SeloUrgente />}
      </p>
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
          Pauta recusada. Quem criou recebe o motivo pelo bot.
        </p>
      )}
      {avisados !== undefined && (
        <p className={estilos.aviso} role="status">
          Promessa registrada.{' '}
          {avisados === 1 ? '1 apoiador vai' : `${String(avisados)} apoiadores vão`} receber o aviso
          da resposta pelo bot.
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
        <dt>Categoria</dt>
        <dd>{categoria}</dd>
        <dt>Onde</dt>
        <dd>{pauta.bloco ?? 'Campus inteiro'}</dd>
        <dt>Criada em</dt>
        <dd>{dataHora(pauta.criadaEm)}</dd>
        {pauta.status === 'em_curadoria' && (
          <>
            <dt>Prazo da curadoria</dt>
            <dd>{dataHora(pauta.prazo)}</dd>
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
        <p className={estilos.numeros}>
          <strong>{pauta.apoios}</strong> de {pauta.meta} apoios
        </p>
        <progress
          aria-label="Progresso até a meta de apoios"
          max={pauta.meta}
          value={Math.min(pauta.apoios, pauta.meta)}
        />
        {pauta.metaBatidaEm && (
          <p className={estilos.detalhes}>Meta batida em {dataHora(pauta.metaBatidaEm)}</p>
        )}
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
              <li
                className={[estilos.cartao, estilos.relato].join(' ')}
                key={`${String(indice)}-${relato.texto}`}
              >
                <p className={estilos.textoDoRelato}>{relato.texto}</p>
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
                <ul className={estilos.meta}>
                  <li>Curso: {relato.curso ?? 'Não informado'}</li>
                  <li>Situação da moderação: {MODERACAO[relato.moderacao]}</li>
                  <li>Data registrada: {relato.data ? dataHora(relato.data) : 'Não registrada'}</li>
                  {!relato.fotoChave && <li>Sem foto</li>}
                </ul>
                {relato.fotoChave && <Foto chave={relato.fotoChave} />}
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
          <p className={estilos.textoDoRelato}>{pauta.promessa.resumo}</p>
          <dl className={estilos.ficha}>
            <dt>Quem respondeu</dt>
            <dd>{pauta.promessa.fonte}</dd>
            <dt>Data prometida</dt>
            <dd>{pauta.promessa.dataEntrega}</dd>
            <dt>Conferência aberta até</dt>
            <dd>{dataHora(pauta.promessa.conferenciaFechaEm)}</dd>
            <dt>Votos</dt>
            <dd>
              {pauta.promessa.votos.sim} sim, {pauta.promessa.votos.em_parte} em parte,{' '}
              {pauta.promessa.votos.nao} não
            </dd>
          </dl>
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
          <Enviar className={estilos.botaoPerigo}>Recusar só o relato</Enviar>
        </form>
      )}

      {pauta.status === 'em_curadoria' && (
        <section aria-labelledby="decisao-pauta" className={estilos.decisoes}>
          <h2 id="decisao-pauta">Decisão</h2>
          <p className={estilos.detalhes}>
            Aprovar publica a pauta no site, junto com o relato de quem a criou, e ela passa a
            juntar apoios. Confira antes o texto, a foto e os achados: nada de nome de pessoa,
            ofensa ou dado pessoal.
          </p>
          <form action={aprovar} className={estilos.aprovacao}>
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
            <input
              type="hidden"
              name="textoVisto"
              value={versaoDoTexto(pauta.titulo, pauta.descricao)}
            />
            <label className={estilos.campo}>
              Categoria
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
            </label>
            <label className={estilos.marcar}>
              <input type="checkbox" name="urgente" /> Marcar como urgente
            </label>
            <Enviar className={estilos.botao}>Aprovar pauta</Enviar>
          </form>
          <details
            className={estilos.recusa}
            open={erro === 'motivo_obrigatorio' || erro === 'motivo_longo'}
          >
            <summary className={estilos.botaoSecundario}>Recusar pauta</summary>
            <form action={recusar} className={estilos.formulario}>
              <input type="hidden" name="pautaId" value={pauta.id} />
              <label htmlFor="motivo">Motivo (vai pelo bot para quem criou a pauta)</label>
              <textarea id="motivo" name="motivo" required maxLength={MOTIVO_RECUSA_MAXIMO} />
              <Enviar className={estilos.botaoPerigo}>Confirmar recusa</Enviar>
            </form>
          </details>
        </section>
      )}
      {pauta.status !== 'em_curadoria' && pauta.status !== 'recusada' && (
        <form action={atualizarUrgencia} className={estilos.formulario}>
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
          <Enviar className={estilos.botaoSecundario}>Salvar urgência</Enviar>
        </form>
      )}
      {pauta.status !== 'em_curadoria' && pauta.status !== 'recusada' && (
        <form action={definirCategoria} className={estilos.formulario}>
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
          <Enviar className={estilos.botaoSecundario}>Salvar categoria</Enviar>
        </form>
      )}
    </>
  );
}
