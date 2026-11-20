import type { PautaComRelatosPendentes } from '@lumens/dominio';
import { CabecalhoDaPauta } from '../pautas/grupo';
import { ERRO_DE_FOTO, FEITO_DE_FOTO, FotosDoRelato } from '../fotos-do-relato';
import estilos from '../painel.module.css';
import { Enviar } from '../enviar';
import { CAMPO_CONFERIDO } from '../pautas/[id]/decisoes';

const FEITO: Record<string, string> = {
  aprovado:
    'Relato aprovado. Ele aparece no site junto com a pauta: na hora, se ela já é pública, ou quando a curadoria aprovar a pauta.',
  recusado: 'Relato recusado. Ele não vai ao site.',
  ...FEITO_DE_FOTO,
};

const ERRO: Record<string, string> = {
  ja_moderado: 'Outra pessoa da curadoria já decidiu este relato.',
  conferencia_pendente:
    'Marque que você conferiu o texto e a foto antes de aprovar o relato. Nada foi publicado.',
  relato_mudou:
    'As fotos do relato mudaram depois que você abriu a fila (foto nova ou foto recusada). Confira de novo antes de aprovar.',
  ...ERRO_DE_FOTO,
};

const MOTIVO: Record<string, string> = {
  nome_conhecido: 'nome de quem participa',
  email: 'e-mail',
  telefone: 'telefone',
  matricula: 'matrícula',
  possivel_nome: 'possível nome de pessoa',
};

/** Fila dos relatos que esperam moderação (5.3, SCRUM-171 e 172), agrupados por pauta. */
export function Relatos({
  pautas,
  feito,
  erro,
  aprovar,
  recusar,
  recusarFoto,
}: {
  pautas: PautaComRelatosPendentes[];
  feito?: string | undefined;
  erro?: string | undefined;
  aprovar: (formulario: FormData) => Promise<void>;
  recusar: (formulario: FormData) => Promise<void>;
  recusarFoto: (formulario: FormData) => Promise<void>;
}) {
  const aviso = feito === undefined ? undefined : FEITO[feito];
  const falha = erro === undefined ? undefined : ERRO[erro];
  return (
    <>
      <h1>Relatos em pautas publicadas</h1>
      {aviso !== undefined && (
        <p className={estilos.aviso} role="status">
          {aviso}
        </p>
      )}
      {falha !== undefined && (
        <p className={estilos.erro} role="alert">
          {falha}
        </p>
      )}
      <p className={estilos.apoio}>
        O relato de quem criou a pauta é conferido junto com a pauta. Aqui ficam os relatos novos de
        pautas já públicas. Barre nome de pessoa, ofensa e dado pessoal, também nas fotos.
      </p>
      {pautas.length === 0 ? (
        <p className={estilos.vazio}>Nenhum relato esperando moderação.</p>
      ) : (
        pautas.map((pauta) => (
          <section key={pauta.id} className={estilos.grupoDaPauta}>
            <CabecalhoDaPauta
              pautaId={pauta.id}
              titulo={pauta.titulo}
              status={pauta.status}
              onde={pauta.bloco ?? 'Campus inteiro'}
              quantidade={pauta.relatos.length}
              um="relato"
              varios="relatos"
            />
            {pauta.relatos.map((relato, i) => {
              const bloqueado = relato.achados.some((a) => a.severidade === 'bloqueio');
              return (
                <article key={relato.id} className={estilos.quadro}>
                  <p className={estilos.rotuloDoItem}>
                    Relato {i + 1} de {pauta.relatos.length}
                    {relato.curso ? ` · Estudante de ${relato.curso}` : ''}
                  </p>
                  <blockquote className={estilos.relato}>{relato.texto}</blockquote>
                  <FotosDoRelato
                    fotos={relato.fotos.map((f) => ({
                      ...f,
                      moderacao: 'pendente' as const,
                      motivoRecusa: null,
                    }))}
                    recusarFoto={recusarFoto}
                    voltar="/relatos"
                  />
                  {relato.achados.length === 0 ? (
                    <p className={estilos.ok}>Nenhum achado automático.</p>
                  ) : (
                    <ul className={estilos.achados}>
                      {relato.achados.map((achado) => (
                        <li
                          key={`${String(achado.inicio)}-${achado.motivo}`}
                          className={
                            achado.severidade === 'bloqueio' ? estilos.barrar : estilos.conferir
                          }
                        >
                          <b>{achado.severidade === 'bloqueio' ? 'Barrar' : 'Conferir'}</b>{' '}
                          {MOTIVO[achado.motivo]} ({achado.trecho})
                        </li>
                      ))}
                    </ul>
                  )}
                  <div className={estilos.acoesDoRelato}>
                    <form action={aprovar} className={estilos.emGrade}>
                      <input type="hidden" name="relatoId" value={relato.id} />
                      {relato.fotos.map((foto) => (
                        <input key={foto.id} type="hidden" name="fotoVista" value={foto.id} />
                      ))}
                      <label className={estilos.marcar}>
                        <input type="checkbox" name={CAMPO_CONFERIDO} required /> Conferi o texto e
                        as fotos
                      </label>
                      <Enviar className={estilos.botao} desabilitado={bloqueado}>
                        Aprovar
                      </Enviar>
                    </form>
                    <form action={recusar} className={estilos.emGrade}>
                      <input type="hidden" name="relatoId" value={relato.id} />
                      <Enviar className={estilos.botaoSecundario}>Recusar relato</Enviar>
                    </form>
                    {bloqueado && (
                      <p className={[estilos.erro, estilos.largura].join(' ')}>
                        Dado pessoal: só dá para recusar.
                      </p>
                    )}
                  </div>
                </article>
              );
            })}
          </section>
        ))
      )}
    </>
  );
}
