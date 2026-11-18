import type { CuradorListado } from '@lumens/dominio';
import estilos from '../painel.module.css';
import { Enviar } from '../enviar';

const FEITO: Record<string, string> = {
  adicionado: 'Pessoa adicionada. Ela já pode pedir o link de acesso na tela de login.',
  desativado: 'Acesso desativado. Vale a partir do próximo clique dela no painel.',
  reativado: 'Acesso reativado.',
};

const ERRO: Record<string, string> = {
  email_invalido: 'Só e-mail @ufal.br.',
  nome_obrigatorio: 'Informe o nome.',
  ja_ativo: 'Essa pessoa já tem acesso.',
  inexistente: 'Essa pessoa não está na lista.',
  ja_inativo: 'Essa pessoa já estava desativada.',
  proprio_curador: 'Você não pode desativar o próprio acesso.',
  ultimo_administrador: 'Este é o último administrador ativo; adicione outro antes de desativar.',
};

const PAPEL = { curador: 'Curador', administrador: 'Administrador' } as const;

const dataBr = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeZone: 'America/Maceio' });

/** Quem entra no painel (SCRUM-295): só administrador chega aqui; o e-mail é mostrado decifrado. */
export function Curadores({
  curadores,
  eu,
  feito,
  erro,
  adicionar,
  desativar,
  reativar,
}: {
  curadores: CuradorListado[];
  /** Id de quem está vendo: o botão de desativar a si mesmo nem aparece. */
  eu: string;
  feito?: string | undefined;
  erro?: string | undefined;
  adicionar: (formulario: FormData) => Promise<void>;
  desativar: (formulario: FormData) => Promise<void>;
  reativar: (formulario: FormData) => Promise<void>;
}) {
  const aviso = feito === undefined ? undefined : FEITO[feito];
  const falha = erro === undefined ? undefined : ERRO[erro];
  return (
    <>
      <h1>Curadores</h1>
      <p className={estilos.apoio}>
        Quem pode entrar no painel. Desativar tira o acesso na hora, mas guarda o histórico do que a
        pessoa decidiu.
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
      <form action={adicionar} className={estilos.formulario}>
        <label htmlFor="email">E-mail @ufal.br</label>
        <input id="email" name="email" type="email" required maxLength={120} />
        <label htmlFor="nome">Nome</label>
        <input id="nome" name="nome" required maxLength={120} />
        <Enviar className={estilos.botao}>Adicionar curador</Enviar>
      </form>
      <ul className={estilos.lista}>
        {curadores.map((c) => (
          <li key={c.id} className={estilos.cartao}>
            <h2>{c.nome}</h2>
            <p className={estilos.detalhes}>
              {c.email} · {PAPEL[c.papel]} · {c.ativo ? 'Ativo' : 'Desativado'} · desde{' '}
              {dataBr.format(c.criadoEm)}
            </p>
            {c.id !== eu && (
              <form action={c.ativo ? desativar : reativar}>
                <input type="hidden" name="curadorId" value={c.id} />
                <Enviar className={c.ativo ? estilos.botaoPerigo : estilos.botao}>
                  {c.ativo ? 'Desativar' : 'Reativar'}
                </Enviar>
              </form>
            )}
          </li>
        ))}
      </ul>
    </>
  );
}
