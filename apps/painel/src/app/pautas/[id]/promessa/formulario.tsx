import {
  ANOS_ATE_A_ENTREGA_MAXIMO,
  FONTE_MAXIMA,
  RESUMO_MAXIMO,
  type DocumentoDaPauta,
  type PautaDaCuradoria,
} from '@lumens/dominio';
import Link from 'next/link';
import { caminhoDoArquivo } from '../../../curadoria/arquivos/[...chave]/arquivo';
import estilos from '../../../painel.module.css';
import { dataHora } from '../../../prazo';
import { Enviar } from '../../../enviar';

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
  data_distante: `A data prometida passa de ${String(ANOS_ATE_A_ENTREGA_MAXIMO)} anos a partir de hoje. Confira o ano.`,
  resumo_longo: `O resumo passou de ${String(RESUMO_MAXIMO)} caracteres. Resuma e registre de novo.`,
  fonte_longa: `Quem respondeu passou de ${String(FONTE_MAXIMA)} caracteres. Resuma e registre de novo.`,
  transicao_invalida:
    'Esta pauta não pode receber promessa agora. Só pautas em cobrança, entregues em parte ou com promessa descumprida.',
};

/** Formulário da resposta oficial e da promessa (5.4, SCRUM-179). */
export function FormularioDaPromessa({
  pauta,
  documentos = [],
  hoje,
  ate,
  erro,
  registrar,
}: {
  pauta: PautaDaCuradoria;
  /** PDFs de resposta que o owner mandou pelo bot (3.6), do mais novo para o mais antigo. */
  documentos?: Pick<DocumentoDaPauta, 'id' | 'arquivoChave' | 'recebidoEm'>[];
  /** `YYYY-MM-DD`: a menor data que o campo aceita. */
  hoje: string;
  /** `YYYY-MM-DD`: a maior data que o campo aceita (`dataDeEntregaMaxima`). */
  ate: string;
  erro?: string | undefined;
  registrar: (formulario: FormData) => Promise<void>;
}) {
  const aviso = erro === undefined ? undefined : ERRO[erro];
  return (
    <>
      <Link className={estilos.voltar} href={`/pautas/${pauta.id}`}>
        ← {pauta.titulo}
      </Link>
      <h1>Registrar resposta e promessa</h1>
      <p className={estilos.detalhes}>
        Só pautas em cobrança, entregues em parte ou com promessa descumprida aceitam promessa.
      </p>
      {aviso !== undefined && (
        <p className={estilos.erro} role="alert">
          {aviso}
        </p>
      )}
      {!ACEITA_PROMESSA.includes(pauta.status) ? (
        <p className={estilos.aviso}>{ERRO.transicao_invalida}</p>
      ) : (
        <div className={estilos.grade}>
          <form action={registrar} className={[estilos.principal, estilos.formulario].join(' ')}>
            <input type="hidden" name="pautaId" value={pauta.id} />
            <label htmlFor="resumo">O que foi respondido e prometido</label>
            <textarea
              id="resumo"
              name="resumo"
              rows={5}
              required
              maxLength={RESUMO_MAXIMO}
              placeholder="Vai para a página pública: não cite nome de pessoa."
            />
            <label htmlFor="fonte">Quem respondeu</label>
            <input
              id="fonte"
              name="fonte"
              required
              maxLength={FONTE_MAXIMA}
              placeholder="Ex.: Prefeitura do Campus"
            />
            <label htmlFor="dataEntrega">Data prometida</label>
            <input id="dataEntrega" name="dataEntrega" type="date" required min={hoje} max={ate} />
            <p className={estilos.detalhes}>
              Nesse dia quem apoia a pauta recebe a pergunta &quot;Foi feito?&quot; e tem 7 dias
              para responder. Ao salvar, os apoiadores são avisados da resposta pelo bot.
            </p>
            <div className={estilos.acoes}>
              <Enviar className={estilos.botao}>Registrar e avisar quem apoiou</Enviar>
              <Link className={estilos.botaoSecundario} href={`/pautas/${pauta.id}`}>
                Cancelar
              </Link>
            </div>
          </form>
          <Documentos documentos={documentos} />
        </div>
      )}
    </>
  );
}

/**
 * O PDF da resposta ao lado do formulário (SCRUM-179, SCRUM-262): o mais novo aberto na tela, os
 * outros em links. Vem pela rota que exige sessão; o PDF nunca é publicado.
 */
function Documentos({
  documentos,
}: {
  documentos: Pick<DocumentoDaPauta, 'id' | 'arquivoChave' | 'recebidoEm'>[];
}) {
  const [maisNovo] = documentos;
  return (
    <aside className={[estilos.lado, estilos.documentos].join(' ')} aria-label="Resposta oficial">
      <h2>Resposta oficial</h2>
      {maisNovo === undefined ? (
        <div className={estilos.semPdf}>
          <i />
          <span>resposta-oficial.pdf</span>
          <small>
            Nenhum PDF chegou pelo bot para esta pauta. Quem cuida da pauta manda a resposta por lá;
            registre a partir do que a ouvidoria respondeu.
          </small>
        </div>
      ) : (
        <>
          <iframe
            src={caminhoDoArquivo(maisNovo.arquivoChave)}
            title={`PDF da resposta recebido em ${dataHora(maisNovo.recebidoEm)}`}
            className={estilos.pdf}
          />
          <p className={estilos.detalhes}>Enviado por quem cuida da pauta, pelo bot.</p>
          <ul className={estilos.responsaveis}>
            {documentos.map((documento) => (
              <li key={documento.id}>
                <a href={caminhoDoArquivo(documento.arquivoChave)} target="_blank" rel="noreferrer">
                  PDF recebido em {dataHora(documento.recebidoEm)}
                </a>
              </li>
            ))}
          </ul>
        </>
      )}
    </aside>
  );
}
