import type { BlocoParaRelato } from '@lumens/dominio';
import estilos from '../../painel.module.css';
import { Enviar } from '../../enviar';

type Acao = (formulario: FormData) => Promise<void>;

const ERRO: Record<string, string> = {
  motivo_ajuste: 'Escreva um motivo de até 200 caracteres.',
  status_invalido:
    'O bloco ou a meta só podem ser ajustados durante a curadoria ou a coleta de apoios.',
  bloco_inexistente: 'O bloco escolhido não foi encontrado. Atualize a página e tente novamente.',
  meta_invalida: 'A meta deve ser um número inteiro entre 30 e 300.',
  meta_abaixo_dos_apoios: 'A nova meta precisa ser maior que o total de apoios atuais.',
};

export function AjustesDeMeta({
  pautaId,
  meta,
  blocoId,
  blocos,
  corrigirBloco,
  ajustarMeta,
  erro,
  feito,
}: {
  pautaId: string;
  meta: number;
  blocoId: string | null;
  blocos: BlocoParaRelato[];
  corrigirBloco: Acao;
  ajustarMeta: Acao;
  erro?: string | undefined;
  feito?: string | undefined;
}) {
  return (
    <section aria-labelledby="ajustes-meta">
      <h2 id="ajustes-meta">Corrigir bloco ou meta</h2>
      {erro !== undefined && ERRO[erro] !== undefined && (
        <p className={estilos.erro} role="alert">
          {ERRO[erro]}
        </p>
      )}
      {feito === 'bloco' && (
        <p className={estilos.aviso} role="status">
          Bloco corrigido e meta recalculada.
        </p>
      )}
      {feito === 'meta' && (
        <p className={estilos.aviso} role="status">
          Meta ajustada.
        </p>
      )}
      <div className={estilos.grade}>
        <form action={corrigirBloco} className={estilos.cartao}>
          <h3>Corrigir bloco</h3>
          <input type="hidden" name="pautaId" value={pautaId} />
          <label htmlFor="bloco-corrigido">Bloco</label>
          <select id="bloco-corrigido" name="blocoId" defaultValue={blocoId ?? ''}>
            <option value="">Todo o campus</option>
            {blocos.map((bloco) => (
              <option key={bloco.id} value={bloco.id}>
                {bloco.nome}
              </option>
            ))}
          </select>
          <label htmlFor="motivo-bloco">Motivo</label>
          <textarea id="motivo-bloco" name="motivo" required maxLength={200} />
          <Enviar className={estilos.botao}>Salvar bloco e recalcular meta</Enviar>
        </form>
        <form action={ajustarMeta} className={estilos.cartao}>
          <h3>Ajustar meta</h3>
          <input type="hidden" name="pautaId" value={pautaId} />
          <label htmlFor="meta-ajustada">Nova meta de apoios (atual: {meta})</label>
          <input id="meta-ajustada" name="meta" type="number" min={30} max={300} required />
          <label htmlFor="motivo-meta">Motivo</label>
          <textarea id="motivo-meta" name="motivo" required maxLength={200} />
          <Enviar className={estilos.botao}>Salvar meta</Enviar>
        </form>
      </div>
    </section>
  );
}
