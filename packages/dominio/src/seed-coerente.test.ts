/**
 * O seed segue as regras do domínio (SCRUM-257).
 *
 * O seed (`packages/db/seed`) insere direto nas tabelas, de propósito: ele precisa de ids, slugs e
 * datas fixos (o e2e e os testes da API dependem deles) e de reaplicar sem duplicar, e as funções
 * do domínio geram id e slug novos a cada chamada. Além disso, o pacote `db` não pode importar o
 * `dominio`, que depende dele. A decisão é a SCRUM-257.
 *
 * O preço é o risco que a task apontou: o seed pode montar um estado que o domínio nunca
 * produziria, e o site e o e2e passariam em cima dele. Este teste fecha esse risco: carrega o seed
 * e confere, com as regras do próprio domínio, o que cada caso de uso garantiria.
 */
import {
  apoios,
  estudantes,
  eventos,
  papeisPauta,
  pautas,
  promessas,
  respostasConferencia,
  type Db,
  type StatusPauta,
} from '@lumens/db';
import { executarSeed } from '@lumens/db/seed';
import { criarBancoEmMemoria } from '@lumens/db/teste';
import { beforeAll, describe, expect, it } from 'vitest';
import { apurarConferencia, type RespostaConferencia } from './conferencia/conferencia';
import { SEM_APOIO } from './pauta/apoio';
import { LIMITE_DE_OWNERS } from './pauta/owners';
import { podeTransicionar } from './pauta/status';

let db: Db;
let pautasDoSeed: (typeof pautas.$inferSelect)[];
let apoiosDoSeed: (typeof apoios.$inferSelect)[];

beforeAll(async () => {
  db = await criarBancoEmMemoria();
  await executarSeed(db);
  pautasDoSeed = await db.select().from(pautas);
  apoiosDoSeed = await db.select().from(apoios);
}, 60_000);

const apoiosDa = (pautaId: string) => apoiosDoSeed.filter((a) => a.pautaId === pautaId);

/** Os resultados que só a apuração da conferência alcança (RN10). */
const RESULTADOS: ReadonlySet<StatusPauta> = new Set([
  'conquistada',
  'entregue_em_parte',
  'descumprida',
]);

describe('seed coerente com o domínio (SCRUM-257)', () => {
  it('apoio só em pauta aprovada que aceita apoio, depois da aprovação (registrarApoio, RN12)', () => {
    const fora = apoiosDoSeed.flatMap((apoio) => {
      const pauta = pautasDoSeed.find((p) => p.id === apoio.pautaId);
      if (!pauta) return [`apoio sem pauta: ${apoio.pautaId}`];
      // `conquistada` não recebe apoio novo, mas guarda os de antes: o que vale é a pauta ter sido
      // aprovada antes do apoio.
      const aceitava = !SEM_APOIO.has(pauta.status) || pauta.status === 'conquistada';
      if (!aceitava || pauta.aprovadaEm === null)
        return [`${pauta.slug}: apoio em ${pauta.status}`];
      if (apoio.criadoEm < pauta.aprovadaEm) return [`${pauta.slug}: apoio antes da aprovação`];
      return [];
    });

    expect([...new Set(fora)]).toEqual([]);
  });

  it('só estudante verificado, que não saiu, apoia, cuida ou responde à conferência (RN01)', async () => {
    const validos = new Set(
      (await db.select().from(estudantes))
        .filter((e) => e.verificadoEm !== null && e.saiuEm === null)
        .map((e) => e.id),
    );
    const papeis = await db.select().from(papeisPauta);
    const respostas = await db.select().from(respostasConferencia);

    const invalidos = [
      ...apoiosDoSeed.map((a) => a.estudanteId),
      ...papeis.map((p) => p.estudanteId),
      ...respostas.map((r) => r.estudanteId),
    ].filter((id) => !validos.has(id));

    expect(invalidos).toEqual([]);
  });

  it(`co-owner apoiou a pauta, e cada pauta tem no máximo ${String(LIMITE_DE_OWNERS)} responsáveis (RN06)`, async () => {
    const papeis = (await db.select().from(papeisPauta)).filter((p) => p.ate === null);

    const coOwnerSemApoio = papeis
      .filter((p) => p.papel === 'co_owner')
      .filter((p) => !apoiosDa(p.pautaId).some((a) => a.estudanteId === p.estudanteId));
    const acimaDoLimite = pautasDoSeed.filter(
      (pauta) => papeis.filter((p) => p.pautaId === pauta.id).length > LIMITE_DE_OWNERS,
    );

    expect(coOwnerSemApoio).toEqual([]);
    expect(acimaDoLimite.map((p) => p.slug)).toEqual([]);
  });

  it('a meta batida bate com os apoios (registrarApoio, RN05)', () => {
    const fora = pautasDoSeed.flatMap((pauta) => {
      const total = apoiosDa(pauta.id).length;
      if (pauta.metaBatidaEm !== null) {
        const ateAMeta = apoiosDa(pauta.id).filter(
          (a) => a.criadoEm <= (pauta.metaBatidaEm as Date),
        );
        return ateAMeta.length >= pauta.meta ? [] : [`${pauta.slug}: meta batida sem apoios`];
      }
      if (pauta.status === 'meta_batida') return [`${pauta.slug}: meta_batida sem meta_batida_em`];
      return total >= pauta.meta && pauta.status !== 'em_curadoria' && pauta.status !== 'recusada'
        ? [`${pauta.slug}: ${String(total)} apoios e meta ${String(pauta.meta)} sem meta_batida_em`]
        : [];
    });

    expect(fora).toEqual([]);
  });

  it('a linha do tempo segue as transições do domínio até o status atual (transicionarStatus)', async () => {
    const todos = await db.select().from(eventos);

    const fora = pautasDoSeed.flatMap((pauta) => {
      const passos = todos
        .filter((e) => e.pautaId === pauta.id && e.tipo === 'status_alterado')
        .sort((a, b) => a.criadoEm.getTime() - b.criadoEm.getTime());
      const problemas: string[] = [];
      let atual: StatusPauta = 'em_curadoria';
      for (const passo of passos) {
        const { de, para } = passo.dados as { de: StatusPauta; para: StatusPauta };
        if (de !== atual || !podeTransicionar(de, para)) {
          problemas.push(`${pauta.slug}: ${de} → ${para} depois de ${atual}`);
        }
        // Só a apuração, pelo agendador, chega a um resultado.
        if (RESULTADOS.has(para) && passo.origem !== 'agendador') {
          problemas.push(`${pauta.slug}: ${para} com origem ${passo.origem}`);
        }
        atual = para;
      }
      if (atual !== pauta.status)
        problemas.push(`${pauta.slug}: termina em ${atual}, não ${pauta.status}`);
      return problemas;
    });

    expect(fora).toEqual([]);
  });

  it('cada resultado é o que a apuração daria com as respostas do seed (encerrarConferencia, RN10)', async () => {
    const todas = await db.select().from(promessas);
    const respostas = await db.select().from(respostasConferencia);

    const fora = pautasDoSeed
      .filter((pauta) => RESULTADOS.has(pauta.status))
      .flatMap((pauta) => {
        const promessa = todas.find((p) => p.pautaId === pauta.id && p.resultado !== null);
        if (!promessa) return [`${pauta.slug}: resultado sem promessa apurada`];
        const apoiadores = apoiosDa(pauta.id).filter(
          (a) => a.criadoEm <= promessa.conferenciaAbreEm,
        );
        const contagem: Record<RespostaConferencia, number> = { sim: 0, em_parte: 0, nao: 0 };
        for (const r of respostas.filter((r) => r.promessaId === promessa.id)) {
          contagem[r.resposta] += 1;
        }
        const { resultado } = apurarConferencia({
          apoiadores: apoiadores.length,
          respostas: contagem,
        });
        return resultado === promessa.resultado && resultado === pauta.status
          ? []
          : [
              `${pauta.slug}: status ${pauta.status}, promessa ${String(promessa.resultado)}, apuração ${resultado}`,
            ];
      });

    expect(fora).toEqual([]);
  });

  it('a resposta à conferência é de quem apoiou, dentro da janela (registrarRespostaConferencia)', async () => {
    const todas = await db.select().from(promessas);
    const respostas = await db.select().from(respostasConferencia);

    const fora = respostas.flatMap((r) => {
      const promessa = todas.find((p) => p.id === r.promessaId);
      if (!promessa) return ['resposta sem promessa'];
      const apoiou = apoiosDa(promessa.pautaId).some((a) => a.estudanteId === r.estudanteId);
      const naJanela =
        r.criadoEm >= promessa.conferenciaAbreEm && r.criadoEm <= promessa.conferenciaFechaEm;
      return apoiou && naJanela ? [] : [`resposta de ${r.estudanteId} à promessa ${r.promessaId}`];
    });

    expect(fora).toEqual([]);
  });
});
