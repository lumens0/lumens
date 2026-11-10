import { randomUUID } from 'node:crypto';
import {
  and,
  apoios,
  codigosVerificacao,
  conversas,
  eq,
  estudantes,
  eventos,
  isNull,
  papeisPauta,
  promessas,
  propostas,
  relatos,
  respostasConferencia,
  voluntarios,
  type Db,
} from '@lumens/db';
import { criarBancoEmMemoria } from '@lumens/db/teste';
import { beforeAll, describe, expect, it } from 'vitest';
import { criarCurador, criarEstudanteVerificado, criarPauta, tornarOwner } from './fabricas';
import { sairDoLumens } from './sair';

let db: Db;

beforeAll(async () => {
  db = await criarBancoEmMemoria();
});

const AGORA = new Date('2026-11-10T12:00:00.000Z');

const executarSaida = (estudanteId: string, agora: Date = AGORA) =>
  db.transaction((tx) => sairDoLumens(tx, { estudanteId, agora }));

describe('sairDoLumens (SCRUM-91 / RNF03 / LGPD)', () => {
  it('estudante sai com sucesso: limpa identificadores, encerra papéis e gera eventos', async () => {
    const estudante = await criarEstudanteVerificado(db);

    // Preenche e-mail cifrado e HMAC para testar que viram null
    await db
      .update(estudantes)
      .set({
        emailHmac: `email-hmac-${randomUUID()}`,
        emailCifrado: `cifrado-${randomUUID()}`,
      })
      .where(eq(estudantes.id, estudante.id));

    // Conversa e código de verificação vinculados ao telefoneHmac do estudante
    await db.insert(conversas).values({
      telefoneHmac: estudante.telefoneHmac,
      passo: 'inicio',
      dados: { etapa: 1 },
    });
    await db.insert(codigosVerificacao).values({
      telefoneHmac: estudante.telefoneHmac,
      codigoHash: 'hash-segredo',
      expiraEm: new Date(AGORA.getTime() + 600_000),
    });

    // Pautas com papéis ativos
    const pauta1 = await criarPauta(db);
    const pauta2 = await criarPauta(db);
    await tornarOwner(db, pauta1.id, estudante.id);
    await db.insert(papeisPauta).values({
      pautaId: pauta2.id,
      estudanteId: estudante.id,
      papel: 'co_owner',
    });

    // Pauta 3 com papel já encerrado anteriormente (não deve sofrer alteração nem gerar evento)
    const pauta3 = await criarPauta(db);
    await db.insert(papeisPauta).values({
      pautaId: pauta3.id,
      estudanteId: estudante.id,
      papel: 'co_owner',
      ate: new Date(AGORA.getTime() - 86_400_000),
    });

    const resultado = await executarSaida(estudante.id, AGORA);

    expect(resultado).toEqual({
      saiu: true,
      pautasComVaga: [pauta1.id, pauta2.id],
    });

    // 1. Telefone vira lápide 'saiu:<uuid>', e-mail vira null, saiuEm é preenchido, curso e verificadoEm ficam
    const [estudanteApos] = await db
      .select()
      .from(estudantes)
      .where(eq(estudantes.id, estudante.id));

    if (!estudanteApos) throw new Error('Estudante não encontrado após saída');
    expect(estudanteApos.telefoneHmac).toMatch(
      /^saiu:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
    expect(estudanteApos.telefoneCifrado).toBe(estudanteApos.telefoneHmac);
    expect(estudanteApos.emailHmac).toBeNull();
    expect(estudanteApos.emailCifrado).toBeNull();
    expect(estudanteApos.saiuEm).toEqual(AGORA);
    expect(estudanteApos.curso).toBe(estudante.curso);
    expect(estudanteApos.verificadoEm).toEqual(estudante.verificadoEm);

    // 2. Conversa e código de verificação são removidos
    const conversasApos = await db
      .select()
      .from(conversas)
      .where(eq(conversas.telefoneHmac, estudante.telefoneHmac));
    expect(conversasApos).toHaveLength(0);

    const codigosApos = await db
      .select()
      .from(codigosVerificacao)
      .where(eq(codigosVerificacao.telefoneHmac, estudante.telefoneHmac));
    expect(codigosApos).toHaveLength(0);

    // 3. Papéis ativos recebem ate = agora
    const papeisAtivos = await db
      .select()
      .from(papeisPauta)
      .where(and(eq(papeisPauta.estudanteId, estudante.id), isNull(papeisPauta.ate)));
    expect(papeisAtivos).toHaveLength(0);

    const [papel1] = await db
      .select()
      .from(papeisPauta)
      .where(and(eq(papeisPauta.pautaId, pauta1.id), eq(papeisPauta.estudanteId, estudante.id)));
    if (!papel1) throw new Error('Papel da pauta 1 não encontrado');
    expect(papel1.ate).toEqual(AGORA);

    const [papel2] = await db
      .select()
      .from(papeisPauta)
      .where(and(eq(papeisPauta.pautaId, pauta2.id), eq(papeisPauta.estudanteId, estudante.id)));
    if (!papel2) throw new Error('Papel da pauta 2 não encontrado');
    expect(papel2.ate).toEqual(AGORA);

    // 4. Registra evento owner_removido com { papel } e origem 'bot' para cada pauta com papel ativo
    const eventosPauta1 = await db
      .select()
      .from(eventos)
      .where(and(eq(eventos.pautaId, pauta1.id), eq(eventos.tipo, 'owner_removido')));
    expect(eventosPauta1).toHaveLength(1);
    expect(eventosPauta1[0]).toMatchObject({
      tipo: 'owner_removido',
      dados: { papel: 'owner' },
      origem: 'bot',
    });

    const eventosPauta2 = await db
      .select()
      .from(eventos)
      .where(and(eq(eventos.pautaId, pauta2.id), eq(eventos.tipo, 'owner_removido')));
    expect(eventosPauta2).toHaveLength(1);
    expect(eventosPauta2[0]).toMatchObject({
      tipo: 'owner_removido',
      dados: { papel: 'co_owner' },
      origem: 'bot',
    });

    // Pauta 3 não deve ter recebido evento
    const eventosPauta3 = await db
      .select()
      .from(eventos)
      .where(and(eq(eventos.pautaId, pauta3.id), eq(eventos.tipo, 'owner_removido')));
    expect(eventosPauta3).toHaveLength(0);
  });

  it('o que a pessoa fez (apoios, voluntariados, relatos, conferências) continua existindo', async () => {
    const estudante = await criarEstudanteVerificado(db);
    const pauta = await criarPauta(db);
    const curador = await criarCurador(db);

    // 1. Apoio
    await db.insert(apoios).values({
      pautaId: pauta.id,
      estudanteId: estudante.id,
      origem: 'bot',
    });

    // 2. Proposta e voluntariado
    const [proposta] = await db
      .insert(propostas)
      .values({
        pautaId: pauta.id,
        descricao: 'Ação comunitária de limpeza',
        pessoasNecessarias: 4,
      })
      .returning();
    if (!proposta) throw new Error('Proposta não criada');

    await db.insert(voluntarios).values({
      propostaId: proposta.id,
      estudanteId: estudante.id,
    });

    // 3. Relato
    const [relato] = await db
      .insert(relatos)
      .values({
        pautaId: pauta.id,
        estudanteId: estudante.id,
        texto: 'Relato importante sobre a situação do bloco.',
        moderacao: 'aprovado',
      })
      .returning();
    if (!relato) throw new Error('Relato não criado');

    // 4. Promessa e resposta de conferência
    const [promessa] = await db
      .insert(promessas)
      .values({
        pautaId: pauta.id,
        resumo: 'Reforma do bebedouro',
        dataEntrega: '2026-11-20',
        fonte: 'Ofício 42/2026',
        registradaPor: curador.id,
        conferenciaAbreEm: AGORA,
        conferenciaFechaEm: new Date(AGORA.getTime() + 86_400_000 * 5),
      })
      .returning();
    if (!promessa) throw new Error('Promessa não criada');

    await db.insert(respostasConferencia).values({
      promessaId: promessa.id,
      estudanteId: estudante.id,
      resposta: 'sim',
    });

    // Executa a saída
    const resultado = await executarSaida(estudante.id, AGORA);
    expect(resultado).toEqual({ saiu: true, pautasComVaga: [] });

    // Verifica que tudo continua existindo associado à linha do estudante
    const apoiosDoEstudante = await db
      .select()
      .from(apoios)
      .where(eq(apoios.estudanteId, estudante.id));
    expect(apoiosDoEstudante).toHaveLength(1);
    expect(apoiosDoEstudante[0]?.pautaId).toBe(pauta.id);

    const voluntariosDoEstudante = await db
      .select()
      .from(voluntarios)
      .where(eq(voluntarios.estudanteId, estudante.id));
    expect(voluntariosDoEstudante).toHaveLength(1);
    expect(voluntariosDoEstudante[0]?.propostaId).toBe(proposta.id);

    const relatosDoEstudante = await db
      .select()
      .from(relatos)
      .where(eq(relatos.estudanteId, estudante.id));
    expect(relatosDoEstudante).toHaveLength(1);
    expect(relatosDoEstudante[0]?.id).toBe(relato.id);
    expect(relatosDoEstudante[0]?.texto).toBe('Relato importante sobre a situação do bloco.');

    const respostasDoEstudante = await db
      .select()
      .from(respostasConferencia)
      .where(eq(respostasConferencia.estudanteId, estudante.id));
    expect(respostasDoEstudante).toHaveLength(1);
    expect(respostasDoEstudante[0]?.promessaId).toBe(promessa.id);
    expect(respostasDoEstudante[0]?.resposta).toBe('sim');
  });

  it('idempotência: tentar chamar sairDoLumens para alguém que já saiu não altera dados nem repete eventos', async () => {
    const estudante = await criarEstudanteVerificado(db);
    const pauta = await criarPauta(db);
    await tornarOwner(db, pauta.id, estudante.id);

    const primeiraSaida = await executarSaida(estudante.id, AGORA);
    expect(primeiraSaida).toEqual({ saiu: true, pautasComVaga: [pauta.id] });

    const [estudanteAposPrimeira] = await db
      .select()
      .from(estudantes)
      .where(eq(estudantes.id, estudante.id));
    if (!estudanteAposPrimeira) throw new Error('Estudante não encontrado após primeira saída');

    const eventosAposPrimeira = await db
      .select()
      .from(eventos)
      .where(eq(eventos.pautaId, pauta.id));

    // Segunda chamada, com data diferente
    const dataPosterior = new Date(AGORA.getTime() + 86_400_000);
    const segundaSaida = await executarSaida(estudante.id, dataPosterior);

    expect(segundaSaida).toEqual({ saiu: false, motivo: 'ja_saiu' });

    // Dados não foram alterados
    const [estudanteAposSegunda] = await db
      .select()
      .from(estudantes)
      .where(eq(estudantes.id, estudante.id));
    if (!estudanteAposSegunda) throw new Error('Estudante não encontrado após segunda saída');

    expect(estudanteAposSegunda.saiuEm).toEqual(AGORA);
    expect(estudanteAposSegunda.telefoneHmac).toBe(estudanteAposPrimeira.telefoneHmac);

    // Eventos não foram duplicados
    const eventosAposSegunda = await db.select().from(eventos).where(eq(eventos.pautaId, pauta.id));
    expect(eventosAposSegunda).toHaveLength(eventosAposPrimeira.length);
  });

  it('estudante que não existe retorna erro estudante_inexistente', async () => {
    const idInexistente = randomUUID();
    const resultado = await executarSaida(idInexistente, AGORA);

    expect(resultado).toEqual({ saiu: false, motivo: 'estudante_inexistente' });
  });

  it('usa data atual quando agora não é informado', async () => {
    const estudante = await criarEstudanteVerificado(db);
    const antes = new Date();
    const resultado = await db.transaction((tx) => sairDoLumens(tx, { estudanteId: estudante.id }));
    const depois = new Date();

    expect(resultado).toEqual({ saiu: true, pautasComVaga: [] });

    const [atualizado] = await db.select().from(estudantes).where(eq(estudantes.id, estudante.id));
    if (!atualizado) throw new Error('Estudante não encontrado');

    if (!atualizado.saiuEm) throw new Error('saiuEm não definido');
    expect(atualizado.saiuEm.getTime()).toBeGreaterThanOrEqual(antes.getTime());
    expect(atualizado.saiuEm.getTime()).toBeLessThanOrEqual(depois.getTime());
  });
});
