import type { CuradorListado } from '@lumens/dominio';
import estilos from '../painel.module.css';
import { Enviar } from '../enviar';
import { MostrarDesativados } from './mostrar-desativados';

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

const PAPEL = { curador: 'curador', administrador: 'administrador' } as const;

const dataBr = new Intl.DateTimeFormat('pt-BR', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  timeZone: 'America/Maceio',
});

/** Quem entra no painel (SCRUM-295): só administrador chega aqui; o e-mail é mostrado decifrado. */
export function Curadores({
  curadores,
  eu,
  mostrarDesativados = false,
  feito,
  erro,
  adicionar,
  desativar,
  reativar,
}: {
  curadores: CuradorListado[];
  /** Id de quem está vendo: o botão de desativar a si mesmo nem aparece. */
  eu: string;
  /** Por padrão quem foi desativado fica fora da lista (SCRUM-350); o histórico segue no banco. */
  mostrarDesativados?: boolean;
  feito?: string | undefined;
  erro?: string | undefined;
  adicionar: (formulario: FormData) => Promise<void>;
  desativar: (formulario: FormData) => Promise<void>;
  reativar: (formulario: FormData) => Promise<void>;
}) {
  const desativados = curadores.filter((c) => !c.ativo).length;
  const visiveis = mostrarDesativados ? curadores : curadores.filter((c) => c.ativo);
  const aviso = feito === undefined ? undefined : FEITO[feito];
  const falha = erro === undefined ? undefined : ERRO[erro];
  return (
    <>
      <h1>Curadores</h1>
      {aviso !== undefined && (
        <p className={estilos.aviso} role="status">
          {aviso}
        </p>
      )}
      <p className={estilos.apoio}>
        Só administradores veem esta tela. A pessoa entra por um link mandado ao e-mail: vale 15
        minutos e uma vez só, e a sessão dura 7 dias.
      </p>
      <ul className={estilos.lista}>
        {visiveis.map((c) => (
          <li key={c.id} className={estilos.curador}>
            <span className={estilos.curadorQuem}>
              {c.nome}
              {c.id === eu && <em>você</em>}
            </span>
            <span className={estilos.curadorMeta}>
              {c.email} · {PAPEL[c.papel]}
              {c.ativo ? '' : ' · desativado'} · desde {dataBr.format(c.criadoEm)}
            </span>
            {c.id !== eu && (
              <form action={c.ativo ? desativar : reativar} className={estilos.curadorAcao}>
                <input type="hidden" name="curadorId" value={c.id} />
                <Enviar className={estilos.botaoLeve}>{c.ativo ? 'Desativar' : 'Reativar'}</Enviar>
              </form>
            )}
          </li>
        ))}
      </ul>
      {(desativados > 0 || mostrarDesativados) && (
        <MostrarDesativados marcado={mostrarDesativados} total={desativados} />
      )}
      <h2 className={estilos.novoCurador}>Adicionar pessoa</h2>
      <form action={adicionar} className={[estilos.formulario, estilos.linhaDeForm].join(' ')}>
        <div>
          <label htmlFor="nome">Nome</label>
          <input id="nome" name="nome" required maxLength={120} />
        </div>
        <div>
          <label htmlFor="email">E-mail @ufal.br</label>
          <input
            id="email"
            name="email"
            type="email"
            required
            maxLength={120}
            placeholder="nome@ufal.br"
          />
        </div>
        <div>
          <label htmlFor="papel">Papel</label>
          <select id="papel" name="papel" defaultValue="curador">
            <option value="curador">Curador</option>
            <option value="administrador">Administrador</option>
          </select>
        </div>
        <Enviar className={estilos.botao}>Adicionar</Enviar>
      </form>
      {falha !== undefined && (
        <p className={estilos.erro} role="alert">
          {falha}
        </p>
      )}
    </>
  );
}
