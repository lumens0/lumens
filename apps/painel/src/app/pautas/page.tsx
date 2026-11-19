import { listarPautasDaCuradoria, resumoDaCuradoria, visaoGeralDaCuradoria } from '@lumens/dominio';
import { redirect } from 'next/navigation';
import { curadorDaSessao, servidor } from '../../auth';
import { sair } from '../acoes';
import { Moldura } from '../moldura';
import { pendenciasDaUrl, situacoesDaUrl } from './filtros';
import { ListaDePautas, type ContagensDaLista } from './lista';
import { STATUS } from './status';

export default async function PaginaDasPautas({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; q?: string; pendencia?: string }>;
}) {
  const curador = await curadorDaSessao();
  if (!curador) redirect('/login');

  const parametros = await searchParams;
  const situacoes = situacoesDaUrl(parametros.status);
  const pendencias = pendenciasDaUrl(parametros.pendencia);
  const q = parametros.q ?? '';
  const { db } = servidor();
  const agora = new Date();

  // O filtro inteiro (situações, pendências e busca) é do domínio, no banco: o limite da lista
  // vale depois dele.
  const [pautas, resumo, visao] = await Promise.all([
    listarPautasDaCuradoria(db, agora, { status: situacoes, pendencia: pendencias, q }),
    resumoDaCuradoria(db, agora),
    visaoGeralDaCuradoria(db, agora),
  ]);
  const porStatus = Object.fromEntries(visao.pautasPorStatus.map((s) => [s.status, s.total])) as {
    [S in keyof typeof STATUS]?: number;
  };
  const contagens: ContagensDaLista = {
    total: visao.pautasPorStatus.reduce((soma, s) => soma + s.total, 0),
    porStatus,
    porPendencia: {
      sem_resposta_oficial: resumo.pautasSemRespostaOficial,
      conferencia_aberta: resumo.conferenciasAbertas,
    },
  };
  return (
    <Moldura nome={curador.nome} administrador={curador.papel === 'administrador'} sair={sair}>
      <ListaDePautas
        pautas={pautas}
        situacoes={situacoes}
        pendencias={pendencias}
        q={q}
        contagens={contagens}
      />
    </Moldura>
  );
}
