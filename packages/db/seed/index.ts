import type { Db } from '../src/client';
import {
  apoios,
  blocos,
  caminhos,
  curadores,
  estudantes,
  eventos,
  papeisPauta,
  pautas,
  promessas,
  propostas,
  relatos,
  respostasConferencia,
  voluntarios,
} from '../src/schema';
import { dadosSeed } from './data';

/**
 * Inserções diretas, de propósito (SCRUM-257): o
 * seed precisa de ids, slugs e datas fixos e de reaplicar sem duplicar, e este pacote não pode
 * importar o `dominio`. Quem garante que o resultado é um estado que o domínio produziria é o
 * `packages/dominio/src/seed-coerente.test.ts`: dado novo aqui tem de passar nele.
 */
export async function executarSeed(db: Db): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.insert(blocos).values(dadosSeed.blocos).onConflictDoNothing();
    await tx.insert(estudantes).values(dadosSeed.estudantes).onConflictDoNothing();
    await tx.insert(curadores).values(dadosSeed.curadores).onConflictDoNothing();
    await tx.insert(pautas).values(dadosSeed.pautas).onConflictDoNothing();
    await tx.insert(papeisPauta).values(dadosSeed.papeisPauta).onConflictDoNothing();
    await tx.insert(apoios).values(dadosSeed.apoios).onConflictDoNothing();
    await tx.insert(relatos).values(dadosSeed.relatos).onConflictDoNothing();
    await tx.insert(caminhos).values(dadosSeed.caminhos).onConflictDoNothing();
    await tx.insert(propostas).values(dadosSeed.propostas).onConflictDoNothing();
    await tx.insert(voluntarios).values(dadosSeed.voluntarios).onConflictDoNothing();
    await tx.insert(promessas).values(dadosSeed.promessas).onConflictDoNothing();
    await tx
      .insert(respostasConferencia)
      .values(dadosSeed.respostasConferencia)
      .onConflictDoNothing();
    await tx.insert(eventos).values(dadosSeed.eventos).onConflictDoNothing();
  });
}
