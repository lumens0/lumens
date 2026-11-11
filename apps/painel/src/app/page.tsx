import { listarFilaDeCuradoria, listarRelatosPendentes } from '@lumens/dominio';
import { redirect } from 'next/navigation';
import { curadorDaSessao, servidor } from '../auth';
import { sair } from './acoes';
import { Inicio } from './inicio';
import { Moldura } from './moldura';

export default async function Home() {
  const curador = await curadorDaSessao();
  if (!curador) redirect('/login');

  const fila = await listarFilaDeCuradoria(servidor().db);
  const relatos = await listarRelatosPendentes(servidor().db);
  return (
    <Moldura nome={curador.nome} sair={sair}>
      <Inicio
        nome={curador.nome}
        pautasNaFila={fila.length}
        relatosPendentes={relatos.reduce((soma, pauta) => soma + pauta.relatos.length, 0)}
      />
    </Moldura>
  );
}
