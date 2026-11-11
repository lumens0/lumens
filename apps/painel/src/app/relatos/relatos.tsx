import type { PautaComRelatosPendentes } from '@lumens/dominio';
import Link from 'next/link';
import estilos from '../painel.module.css';

const FEITO: Record<string, string> = {
  aprovado:
    'Relato aprovado. Ele aparece no site junto com a pauta: na hora, se ela já é pública, ou quando a curadoria aprovar a pauta.',
  recusado: 'Relato recusado. Ele não vai ao site.',
};

const ERRO: Record<string, string> = {
  ja_moderado: 'Outra pessoa da curadoria já decidiu este relato.',
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
}: {
  pautas: PautaComRelatosPendentes[];
  feito?: string | undefined;
  erro?: string | undefined;
  aprovar: (formulario: FormData) => Promise<void>;
  recusar: (formulario: FormData) => Promise<void>;
}) {
  const aviso = feito === undefined ? undefined : FEITO[feito];
  const falha = erro === undefined ? undefined : ERRO[erro];
  return (
    <>
      <h1>Relatos novos</h1>
      <p className={estilos.apoio}>
        Antes de aprovar, barre o que identifica alguém: nome de pessoa, ofensa e dado pessoal.
        Confira também a foto, se houver. Aprovar e recusar valem para o texto e a foto juntos.
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
            <h2>
              <Link href={`/pautas/${pauta.id}`}>{pauta.titulo}</Link>
            </h2>
            <p className={estilos.detalhes}>{pauta.bloco ?? 'Campus inteiro'}</p>
            <ul className={estilos.lista}>
              {pauta.relatos.map((relato) => (
                <li key={relato.id} className={estilos.cartao}>
                  <p className={estilos.descricaoDaPauta}>{relato.texto}</p>
                  <p className={estilos.detalhes}>
                    {relato.fotoChave === null
                      ? 'Sem foto'
                      : 'Tem foto (o painel ainda não mostra a imagem)'}
                  </p>
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
                  <div className={estilos.decisoes}>
                    <form action={aprovar}>
                      <input type="hidden" name="relatoId" value={relato.id} />
                      <button className={estilos.botao} type="submit">
                        Aprovar relato
                      </button>
                    </form>
                    <form action={recusar}>
                      <input type="hidden" name="relatoId" value={relato.id} />
                      <button className={estilos.botaoPerigo} type="submit">
                        Recusar relato
                      </button>
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
