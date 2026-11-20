import {
  LIMITE_DA_LISTA,
  listarPautasDaCuradoria,
  resumoDaCuradoria,
  visaoGeralDaCuradoria,
} from '@lumens/dominio';
import { redirect } from 'next/navigation';
import { curadorDaSessao, servidor } from '../../auth';
import { sair } from '../acoes';
import { Moldura } from '../moldura';
import {
  buscarNaLista,
  filtrarPorSituacoes,
  pendenciasDaUrl,
  situacoesDaUrl,
  uniaoDePautas,
} from './filtros';
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

  // Com uma situação só, o banco já filtra (e o limite de 200 vale para ela). Com várias ou
  // nenhuma, a lista vem inteira e a escolha é feita aqui. Cada pendência é uma consulta, e a
  // união delas é o "ou" entre pendências. A busca por título, bloco e etapa é em memória: o filtro
  // do domínio só acha por título (estender o domínio fica para depois).
  const unica = situacoes.length === 1 ? situacoes[0] : undefined;
  const doBanco = unica === undefined ? {} : { status: unica };
  const [lotes, resumo, visao] = await Promise.all([
    pendencias.length === 0
      ? Promise.all([listarPautasDaCuradoria(db, agora, doBanco)])
      : Promise.all(
          pendencias.map((pendencia) =>
            listarPautasDaCuradoria(db, agora, { ...doBanco, pendencia }),
          ),
        ),
    resumoDaCuradoria(db, agora),
    visaoGeralDaCuradoria(db, agora),
  ]);
  const pautas = buscarNaLista(filtrarPorSituacoes(uniaoDePautas(lotes), situacoes), q);
  // O corte de 200 acontece antes da busca em memória: se algum lote bateu no limite, a busca e os
  // filtros só enxergaram essas pautas, e o aviso continua valendo mesmo com a lista menor.
  const truncada = lotes.some((lote) => lote.length >= LIMITE_DA_LISTA);
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
        truncada={truncada}
      />
    </Moldura>
  );
}
