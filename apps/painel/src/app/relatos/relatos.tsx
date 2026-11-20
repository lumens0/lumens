import type { PautaComRelatosPendentes } from '@lumens/dominio';
import { CabecalhoDaPauta, seloDeQuantidade } from '../pautas/grupo';
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
      <p className={estilos.apoio}>
        O relato de quem criou uma pauta é conferido junto com a pauta; esta lista mostra relatos
        novos de pautas já públicas.
      </p>
      <p className={estilos.apoio}>
        Antes de aprovar, barre o que identifica alguém: nome de pessoa, ofensa e dado pessoal.
        Confira também as fotos (até três por relato): dá para recusar cada foto, com motivo, e
        manter o texto. Aprovar o relato aprova as fotos que estão na tela; recusar o relato recusa
        tudo.
      </p>
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
      {pautas.length === 0 ? (
        <p className={estilos.aviso}>Nenhum relato esperando moderação.</p>
      ) : (
        pautas.map((pauta) => (
          <section key={pauta.id}>
            <CabecalhoDaPauta
              pautaId={pauta.id}
              titulo={pauta.titulo}
              onde={pauta.bloco ?? 'Campus inteiro'}
              selo={seloDeQuantidade(pauta.relatos.length, 'relato', 'relatos')}
            />
            <ul className={estilos.lista}>
              {pauta.relatos.map((relato, i) => (
                <li key={relato.id} className={[estilos.cartao, estilos.relato].join(' ')}>
                  <p className={estilos.rotuloDoItem}>
                    Relato {i + 1} de {pauta.relatos.length}
                  </p>
                  <p className={estilos.textoDoRelato}>{relato.texto}</p>
                  <FotosDoRelato
                    fotos={relato.fotos.map((f) => ({
                      ...f,
                      moderacao: 'pendente' as const,
                      motivoRecusa: null,
                    }))}
                    recusarFoto={recusarFoto}
                    voltar="/relatos"
                  />
                  {relato.achados.length > 0 && (
                    <ul className={estilos.aviso}>
                      {relato.achados.map((achado) => (
                        <li key={`${String(achado.inicio)}-${achado.motivo}`}>
                          {achado.severidade === 'bloqueio' ? 'Barrar' : 'Conferir'}:{' '}
                          {MOTIVO[achado.motivo]} ({achado.trecho})
                        </li>
                      ))}
                    </ul>
                  )}
                  <div className={estilos.acoesDoRelato}>
                    <form action={aprovar}>
                      <input type="hidden" name="relatoId" value={relato.id} />
                      {relato.fotos.map((foto) => (
                        <input key={foto.id} type="hidden" name="fotoVista" value={foto.id} />
                      ))}
                      <label className={estilos.conferencia}>
                        <input type="checkbox" name={CAMPO_CONFERIDO} required /> Conferi o texto e
                        a foto: sem nome de pessoa, ofensa ou dado pessoal.
                      </label>
                      <Enviar className={estilos.botao}>Aprovar relato</Enviar>
                    </form>
                    <form action={recusar}>
                      <input type="hidden" name="relatoId" value={relato.id} />
                      <Enviar className={estilos.botaoPerigo}>Recusar relato</Enviar>
                    </form>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        ))
      )}
    </>
  );
}
