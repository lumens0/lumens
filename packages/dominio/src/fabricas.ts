/**
 * Fábricas para os testes do domínio. Só para testes: nada aqui passa pelas regras.
 *
 * Cada chamada gera slug e telefone únicos, então os testes podem dividir o mesmo banco.
 */
import {
  blocos,
  curadores,
  estudantes,
  papeisPauta,
  pautas,
  type Bloco,
  type Curador,
  type Db,
  type Estudante,
  type NovaPauta,
  type Pauta,
} from '@lumens/db';

let seq = 0;
const unico = () => `${String(Date.now())}-${String(++seq)}`;

export async function criarBloco(db: Db, baseEstudantes = 1200): Promise<Bloco> {
  const n = unico();
  const [bloco] = await db
    .insert(blocos)
    .values({ slug: `bloco-${n}`, nome: `Bloco ${n}`, baseEstudantes })
    .returning();
  if (bloco === undefined) throw new Error('bloco não criado');
  return bloco;
}

/** Estudante que pode apoiar (RN01): verificado e sem ter saído. */
export async function criarEstudanteVerificado(db: Db): Promise<Estudante> {
  const n = unico();
  const [estudante] = await db
    .insert(estudantes)
    .values({
      telefoneHmac: `tel-${n}`,
      telefoneCifrado: `cifrado-${n}`,
      curso: 'Ciência da Computação',
      verificadoEm: new Date(),
    })
    .returning();
  if (estudante === undefined) throw new Error('estudante não criado');
  return estudante;
}

/** Pauta de teste; por padrão já aprovada (`juntando_apoios`) e sem bloco (campus, meta 300). */
export async function criarPauta(db: Db, campos: Partial<NovaPauta> = {}): Promise<Pauta> {
  const n = unico();
  const [pauta] = await db
    .insert(pautas)
    .values({
      slug: `pauta-${n}`,
      titulo: 'Pauta de teste',
      descricao: 'Descrição de teste.',
      categoria: 'infraestrutura',
      status: 'juntando_apoios',
      meta: 300,
      ...campos,
    })
    .returning();
  if (pauta === undefined) throw new Error('pauta não criada');
  return pauta;
}

/** Estudante como owner ativo da pauta (papel `owner`, sem `ate`). */
export async function tornarOwner(db: Db, pautaId: string, estudanteId: string): Promise<void> {
  await db.insert(papeisPauta).values({ pautaId, estudanteId, papel: 'owner' });
}

export async function criarCurador(db: Db): Promise<Curador> {
  const n = unico();
  const [curador] = await db
    .insert(curadores)
    .values({ emailHmac: `email-${n}`, emailCifrado: `cifrado-${n}`, nome: `Curador ${n}` })
    .returning();
  if (curador === undefined) throw new Error('curador não criado');
  return curador;
}
