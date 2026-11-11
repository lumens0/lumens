import type { PautaComRelatosPendentes, PautaDaCuradoria } from '@lumens/dominio';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { Fila } from './fila/fila';
import { Pauta } from './pautas/[id]/pauta';
import { FormularioDaPromessa } from './pautas/[id]/promessa/formulario';
import { ListaDePautas } from './pautas/lista';
import { textoDoPrazo } from './prazo';
import { Relatos } from './relatos/relatos';

const HORA = 3_600_000;
const acao = () => Promise.resolve();

const pauta = (campos: Partial<PautaDaCuradoria> = {}): PautaDaCuradoria => ({
  id: '5f1c2d3e-4a5b-4c6d-8e7f-0123456789ab',
  titulo: 'Bebedouro quebrado no bloco 12',
  descricao: 'O bebedouro do térreo não funciona desde agosto.',
  bloco: 'Bloco 12',
  fotoChave: null,
  criadaEm: new Date('2026-11-09T12:00:00.000Z'),
  prazo: new Date('2026-11-10T12:00:00.000Z'),
  restanteMs: 5 * HORA,
  status: 'em_curadoria',
  motivoRecusa: null,
  ...campos,
});

describe('textoDoPrazo', () => {
  it.each([
    [5 * HORA + 20 * 60_000, 'faltam 5 h 20 min'],
    [2 * HORA, 'faltam 2 h'],
    [40 * 60_000, 'faltam 40 min'],
    [0, 'faltam 0 min'],
    [-3 * HORA, 'atrasada há 3 h'],
    [-90 * 60_000, 'atrasada há 1 h 30 min'],
    [-47 * HORA, 'atrasada há 47 h'],
    [-280 * 24 * HORA, 'atrasada há 280 dias'],
  ])('%i ms → %s', (ms, texto) => {
    expect(textoDoPrazo(ms)).toBe(texto);
  });
});

describe('fila das pautas novas', () => {
  it('lista as pautas com bloco, prazo e link para a tela de cada uma', () => {
    const html = renderToStaticMarkup(
      <Fila
        pautas={[
          pauta(),
          pauta({
            id: 'outra',
            titulo: 'Sem luz no estacionamento',
            bloco: null,
            restanteMs: -HORA,
          }),
        ]}
      />,
    );

    expect(html).toContain('href="/pautas/5f1c2d3e-4a5b-4c6d-8e7f-0123456789ab"');
    expect(html).toContain('Bloco 12');
    expect(html).toContain('faltam 5 h');
    expect(html).toContain('Campus inteiro');
    expect(html).toContain('atrasada há 1 h');
  });

  it('fila vazia e aviso depois de uma decisão', () => {
    const html = renderToStaticMarkup(<Fila pautas={[]} feito="recusada" />);

    expect(html).toContain('Nenhuma pauta esperando decisão.');
    expect(html).toContain('Quem criou recebe o motivo pelo WhatsApp.');
  });

  it('valor desconhecido em ?feito não vira texto na tela', () => {
    expect(renderToStaticMarkup(<Fila pautas={[]} feito="<script>" />)).not.toContain('script');
  });
});

describe('tela da pauta', () => {
  it('em curadoria: mostra título, bloco, descrição e as duas decisões com o id da pauta', () => {
    const html = renderToStaticMarkup(<Pauta pauta={pauta()} aprovar={acao} recusar={acao} />);

    expect(html).toContain('Bebedouro quebrado no bloco 12');
    expect(html).toContain('Bloco 12');
    expect(html).toContain('O bebedouro do térreo não funciona desde agosto.');
    expect(html).toContain('Sem foto');
    expect(html).toContain('href="/pautas/5f1c2d3e-4a5b-4c6d-8e7f-0123456789ab/linha-do-tempo"');
    expect(html).toContain('Aprovar pauta');
    expect(html).toContain('Recusar pauta');
    expect(html.match(/name="pautaId" value="5f1c2d3e-4a5b-4c6d-8e7f-0123456789ab"/g)).toHaveLength(
      2,
    );
    // Recusa sem motivo nem sai do navegador; o servidor confere de novo.
    expect(html).toMatch(/<textarea[^>]*name="motivo"[^>]*required/);
  });

  it('avisa quando a recusa veio sem motivo ou outra pessoa já decidiu', () => {
    const sem = renderToStaticMarkup(
      <Pauta pauta={pauta()} erro="motivo_obrigatorio" aprovar={acao} recusar={acao} />,
    );
    const ja = renderToStaticMarkup(
      <Pauta pauta={pauta()} erro="ja_decidida" aprovar={acao} recusar={acao} />,
    );

    expect(sem).toContain('role="alert"');
    expect(sem).toContain('escreva o motivo');
    expect(ja).toContain('já decidiu esta pauta');
  });

  it('pauta já decidida não oferece decisão e mostra o motivo da recusa', () => {
    const html = renderToStaticMarkup(
      <Pauta
        pauta={pauta({ status: 'recusada', motivoRecusa: 'Já existe pauta igual.' })}
        aprovar={acao}
        recusar={acao}
      />,
    );

    expect(html).toContain('Recusada');
    expect(html).toContain('Já existe pauta igual.');
    expect(html).not.toContain('<form');
  });
});

describe('promessa pela tela', () => {
  it('pauta em cobrança oferece o registro da promessa; em curadoria, não', () => {
    const link = 'href="/pautas/5f1c2d3e-4a5b-4c6d-8e7f-0123456789ab/promessa"';

    expect(
      renderToStaticMarkup(
        <Pauta pauta={pauta({ status: 'cobrando' })} aprovar={acao} recusar={acao} />,
      ),
    ).toContain(link);
    expect(
      renderToStaticMarkup(<Pauta pauta={pauta()} aprovar={acao} recusar={acao} />),
    ).not.toContain(link);
  });

  it('depois de registrar, a pauta mostra quantos apoiadores serão avisados', () => {
    const html = renderToStaticMarkup(
      <Pauta pauta={pauta({ status: 'prometido' })} avisados={42} aprovar={acao} recusar={acao} />,
    );

    expect(html).toContain('Promessa registrada.');
    expect(html).toContain('42 apoiadores vão');
  });

  it('formulário tem resumo, fonte e data prometida a partir de hoje', () => {
    const html = renderToStaticMarkup(
      <FormularioDaPromessa
        pauta={pauta({ status: 'cobrando' })}
        hoje="2026-11-10"
        registrar={acao}
      />,
    );

    expect(html).toMatch(/<textarea[^>]*name="resumo"[^>]*required/);
    expect(html).toMatch(/<input[^>]*required[^>]*name="fonte"/);
    expect(html).toMatch(/<input[^>]*min="2026-11-10"[^>]*name="dataEntrega"/);
    expect(html).toContain('name="pautaId" value="5f1c2d3e-4a5b-4c6d-8e7f-0123456789ab"');
  });

  it('pauta fora de cobrança não mostra o formulário; erro do registro aparece', () => {
    const fora = renderToStaticMarkup(
      <FormularioDaPromessa pauta={pauta()} hoje="2026-11-10" registrar={acao} />,
    );
    const comErro = renderToStaticMarkup(
      <FormularioDaPromessa
        pauta={pauta({ status: 'cobrando' })}
        hoje="2026-11-10"
        erro="data_no_passado"
        registrar={acao}
      />,
    );

    expect(fora).not.toContain('<form');
    expect(fora).toContain('não pode receber promessa agora');
    expect(comErro).toContain('role="alert"');
    expect(comErro).toContain('não pode estar no passado');
  });
});

describe('lista de todas as pautas', () => {
  it('mostra a situação de cada pauta e o link para a tela dela', () => {
    const html = renderToStaticMarkup(
      <ListaDePautas
        pautas={[pauta({ status: 'cobrando' }), pauta({ id: 'b', status: 'conquistada' })]}
      />,
    );

    expect(html).toContain('Em cobrança');
    expect(html).toContain('Conquistada');
    expect(html).toContain('href="/pautas/5f1c2d3e-4a5b-4c6d-8e7f-0123456789ab"');
  });
});

describe('relatos novos', () => {
  const grupo = (relatos: PautaComRelatosPendentes['relatos']): PautaComRelatosPendentes => ({
    id: '5f1c2d3e-4a5b-4c6d-8e7f-0123456789ab',
    titulo: 'Bebedouro quebrado no bloco 12',
    bloco: null,
    relatos,
  });

  it('agrupa por pauta, lembra o que barrar e mostra os achados, a foto e as duas decisões', () => {
    const html = renderToStaticMarkup(
      <Relatos
        pautas={[
          grupo([
            {
              id: 'r1',
              texto: 'Falem com a professora Marta: fulano@ufal.br',
              fotoChave: 'fotos/a.jpg',
              achados: [
                {
                  severidade: 'aviso',
                  motivo: 'possivel_nome',
                  trecho: 'professora Marta',
                  inicio: 10,
                  fim: 26,
                },
                {
                  severidade: 'bloqueio',
                  motivo: 'email',
                  trecho: 'fulano@ufal.br',
                  inicio: 28,
                  fim: 42,
                },
              ],
            },
            { id: 'r2', texto: 'Sem água.', fotoChave: null, achados: [] },
          ]),
        ]}
        aprovar={acao}
        recusar={acao}
      />,
    );

    expect(html).toContain('nome de pessoa, ofensa e dado pessoal');
    expect(html).toContain('href="/pautas/5f1c2d3e-4a5b-4c6d-8e7f-0123456789ab"');
    expect(html).toContain('Campus inteiro');
    expect(html).toContain('Tem foto (o painel ainda não mostra a imagem)');
    expect(html).toContain('Sem foto');
    expect(html).toContain('Conferir: possível nome de pessoa (professora Marta)');
    expect(html).toContain('Barrar: e-mail (fulano@ufal.br)');
    expect(html.match(/Aprovar relato/g)).toHaveLength(2);
    expect(html.match(/Recusar relato/g)).toHaveLength(2);
    expect(html).toContain('name="relatoId" value="r1"');
  });

  it('fila vazia, aviso depois da decisão e erro de relato já moderado', () => {
    const html = renderToStaticMarkup(
      <Relatos pautas={[]} feito="aprovado" erro="ja_moderado" aprovar={acao} recusar={acao} />,
    );

    expect(html).toContain('Nenhum relato esperando moderação.');
    expect(html).toContain('Relato aprovado.');
    expect(html).toContain('já decidiu este relato');
  });

  it('valor desconhecido em ?feito e ?erro não vira texto na tela', () => {
    const html = renderToStaticMarkup(
      <Relatos pautas={[]} feito="<script>" erro="<b>x</b>" aprovar={acao} recusar={acao} />,
    );

    expect(html).not.toContain('script');
    expect(html).not.toContain('<b>');
    expect(html).not.toContain('role="alert"');
  });
});
