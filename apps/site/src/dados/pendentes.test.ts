import { afterEach, describe, expect, it } from 'vitest';
import {
  absorver,
  aplicarBlocos,
  chaveDe,
  escolhaVigente,
  limparGrupo,
  limparPendente,
  proximaEscolha,
  registrarEscolha,
} from './pendentes';

const vazio = { status: [], bloco: [] };

afterEach(() => {
  limparPendente();
});

describe('escolha pendente compartilhada', () => {
  it('dois cliques seguidos não perdem o primeiro, nem entre etapa e bloco', () => {
    proximaEscolha(vazio, 'status', 'cobrando', 1000);
    const segunda = proximaEscolha(vazio, 'bloco', 'ic', 1100);
    expect(segunda).toEqual({ status: ['cobrando'], bloco: ['ic'] });
  });

  it('a folha de blocos registra a escolha, e o clique seguinte numa etapa a mantém', () => {
    registrarEscolha({ status: [], bloco: ['ic', 'ctec'] }, 1000);
    const proxima = proximaEscolha(vazio, 'status', 'cobrando', 1200);
    expect(proxima).toEqual({ status: ['cobrando'], bloco: ['ic', 'ctec'] });
  });

  it('a chave não depende da ordem dos itens', () => {
    expect(chaveDe({ status: ['prometido', 'cobrando'], bloco: ['b', 'a'] })).toBe(
      chaveDe({ status: ['cobrando', 'prometido'], bloco: ['a', 'b'] }),
    );
  });

  it('quando o servidor devolve as mesmas etapas em outra ordem, a pendente é absorvida', () => {
    // Prometido e depois Cobrando: a pendente fica ['prometido', 'cobrando'], a URL volta no
    // caminho canônico (['cobrando', 'prometido']).
    proximaEscolha(vazio, 'status', 'prometido', 1000);
    proximaEscolha(vazio, 'status', 'cobrando', 1050);
    absorver({ status: ['cobrando', 'prometido'], bloco: [] });
    // A pessoa tira Prometido pela etiqueta (a página agora mostra só Cobrando) e escolhe um bloco:
    // não pode ressuscitar Prometido.
    const proxima = proximaEscolha({ status: ['cobrando'], bloco: [] }, 'bloco', 'ic', 1500);
    expect(proxima).toEqual({ status: ['cobrando'], bloco: ['ic'] });
  });

  it('absorver uma escolha diferente da pendente não a apaga', () => {
    proximaEscolha(vazio, 'status', 'cobrando', 1000);
    absorver(vazio);
    const proxima = proximaEscolha(vazio, 'status', 'prometido', 1100);
    expect(proxima.status).toEqual(['cobrando', 'prometido']);
  });
});

describe('aplicarBlocos (a folha de blocos)', () => {
  it('mantém a etapa pendente: etapa e logo a folha, antes de a página refletir, preservam as duas', () => {
    proximaEscolha(vazio, 'status', 'cobrando', 1000);
    // `atual` ainda é "vazio": a página não refletiu a etapa.
    const r = aplicarBlocos(vazio, ['ic', 'ctec'], 1200);
    expect(r).toEqual({ status: ['cobrando'], bloco: ['ic', 'ctec'] });
  });

  it('sem pendente, parte do que a página mostra', () => {
    const r = aplicarBlocos({ status: ['prometido'], bloco: [] }, ['ic'], 5000);
    expect(r).toEqual({ status: ['prometido'], bloco: ['ic'] });
  });

  it('depois da folha, um clique numa etapa preserva os blocos', () => {
    aplicarBlocos(vazio, ['ic'], 1000);
    const r = proximaEscolha(vazio, 'status', 'cobrando', 1100);
    expect(r).toEqual({ status: ['cobrando'], bloco: ['ic'] });
  });

  it('escolhaVigente devolve a pendente enquanto vale e a da página depois', () => {
    proximaEscolha(vazio, 'status', 'cobrando', 1000);
    expect(escolhaVigente(vazio, 1500).status).toEqual(['cobrando']);
    expect(escolhaVigente(vazio, 1000 + 3000).status).toEqual([]);
  });
});

describe('limparGrupo ("Todas" nas etapas)', () => {
  it('zera só o grupo pedido e parte da escolha pendente (inclusive os blocos da folha)', () => {
    registrarEscolha({ status: ['cobrando'], bloco: ['ic'] }, 1000);
    const r = limparGrupo({ status: [], bloco: [] }, 'status', 1200);
    expect(r).toEqual({ status: [], bloco: ['ic'] });
  });

  it('sem pendente, parte do que a página mostra', () => {
    const r = limparGrupo({ status: ['cobrando'], bloco: ['ic'] }, 'status', 5000);
    expect(r).toEqual({ status: [], bloco: ['ic'] });
  });
});
