import type { DetalhePautaDaCuradoria, PautaComRelatosPendentes } from '@lumens/dominio';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { Pauta } from './pautas/[id]/pauta';
import { FormularioDaPromessa } from './pautas/[id]/promessa/formulario';
import { ListaDePautas } from './pautas/lista';
import { textoDoPrazo } from './prazo';
import { Relatos } from './relatos/relatos';

const HORA = 3_600_000;
const acao = () => Promise.resolve();

const pauta = (campos: Partial<DetalhePautaDaCuradoria> = {}): DetalhePautaDaCuradoria => ({
  id: '5f1c2d3e-4a5b-4c6d-8e7f-0123456789ab',
  titulo: 'Bebedouro quebrado no bloco 12',
  descricao: 'O bebedouro do térreo não funciona desde agosto.',
  bloco: 'Bloco 12',
  blocoId: '22222222-2222-4222-8222-222222222222',
  fotoChave: null,
  criadaEm: new Date('2026-11-09T12:00:00.000Z'),
  prazo: new Date('2026-11-10T12:00:00.000Z'),
  restanteMs: 5 * HORA,
  status: 'em_curadoria',
  motivoRecusa: null,
  categoria: 'infraestrutura',
  apoios: 80,
  meta: 300,
  urgente: false,
  urgenteMotivo: null,
  metaBatidaEm: null,
  responsaveis: [],
  relatos: [],
  caminhos: [],
  promessa: null,
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

describe('tela da pauta', () => {
  it('oferece os dois ajustes só durante a curadoria ou a coleta de apoios', () => {
    const emCuradoria = renderToStaticMarkup(
      <Pauta pauta={pauta()} aprovar={acao} recusar={acao} />,
    );
    expect(emCuradoria).toContain('Corrigir bloco');
    expect(emCuradoria).toContain('Todo o campus');
    expect(emCuradoria).toContain('Ajustar meta');
    const juntando = renderToStaticMarkup(
      <Pauta pauta={pauta({ status: 'juntando_apoios' })} aprovar={acao} recusar={acao} />,
    );
    expect(juntando).toContain('Corrigir bloco');
    const cobrando = renderToStaticMarkup(
      <Pauta pauta={pauta({ status: 'cobrando' })} aprovar={acao} recusar={acao} />,
    );
    expect(cobrando).not.toContain('Corrigir bloco');
    expect(cobrando).not.toContain('Ajustar meta');
  });

  it('com foto: mostra a imagem pela rota que exige sessão e abre inteira em outra aba', () => {
    const FOTO = 'fotos/2026/11/5f1c2d3e-4a5b-4c6d-8e7f-0123456789ab.png';
    const html = renderToStaticMarkup(
      <Pauta pauta={pauta({ fotoChave: FOTO })} aprovar={acao} recusar={acao} />,
    );

    expect(html).toContain(
      `<img src="/curadoria/arquivos/${FOTO}" alt="Foto enviada com o relato"`,
    );
    expect(html).toContain(`href="/curadoria/arquivos/${FOTO}" target="_blank"`);
  });

  it('em curadoria: mostra título, bloco, descrição e as duas decisões com o id da pauta', () => {
    const html = renderToStaticMarkup(<Pauta pauta={pauta()} aprovar={acao} recusar={acao} />);

    expect(html).toContain('Bebedouro quebrado no bloco 12');
    expect(html).toContain('Bloco 12');
    expect(html).toContain('O bebedouro do térreo não funciona desde agosto.');
    expect(html).toContain('Sem foto');
    expect(html).toContain('Marcar como urgente');
    expect(html).toContain('<details id="linha-do-tempo"');
    expect(html).toContain('Linha do tempo');
    expect(html).toContain('Aprovar pauta');
    expect(html).toContain('também publica o relato de quem a criou');
    expect(html).toContain('Recusar pauta');
    // Aprovar, recusar, corrigir o bloco e ajustar a meta (SCRUM-326).
    expect(html.match(/name="pautaId" value="5f1c2d3e-4a5b-4c6d-8e7f-0123456789ab"/g)).toHaveLength(
      4,
    );
    // Recusa sem motivo nem sai do navegador; o servidor confere de novo.
    expect(html).toMatch(/<textarea[^>]*name="motivo"[^>]*required/);
    expect(html).toMatch(/<select[^>]*name="categoria"[^>]*required/);
    expect(html).toContain('Infraestrutura');
    expect(html).toContain('Segurança');
    expect(html).toContain('Permanência');
  });

  it('pauta pública oferece formulário para marcar ou desmarcar urgência', () => {
    const html = renderToStaticMarkup(
      <Pauta
        pauta={pauta({ status: 'juntando_apoios', urgente: true })}
        aprovar={acao}
        recusar={acao}
      />,
    );
    expect(html).toContain('name="urgente"');
    expect(html).toContain('checked=""');
    expect(html).toContain('Motivo curto (opcional)');
  });

  it('lista de pautas mostra selo textual nas urgentes', () => {
    const html = renderToStaticMarkup(
      <ListaDePautas pautas={[pauta({ urgente: true })]} status="todas" q="" />,
    );
    expect(html).toContain('>Urgente</span>');
  });

  it('mostra informações operacionais da pauta sem expor identidade de estudante', () => {
    const html = renderToStaticMarkup(
      <Pauta
        pauta={pauta({
          status: 'juntando_apoios',
          apoios: 300,
          meta: 300,
          metaBatidaEm: new Date('2026-11-10T12:00:00.000Z'),
          relatos: [
            {
              texto: 'O elevador está parado.',
              achados: [],
              curso: 'Engenharia Civil',
              fotoChave: 'fotos/relato.jpg',
              moderacao: 'aprovado',
              data: new Date('2026-11-09T12:00:00.000Z'),
            },
            {
              texto: 'A lâmpada continua apagada.',
              achados: [],
              curso: 'Pedagogia',
              fotoChave: null,
              moderacao: 'pendente',
              data: null,
            },
            {
              texto: 'Relato recusado.',
              achados: [],
              curso: null,
              fotoChave: null,
              moderacao: 'recusado',
              data: null,
            },
          ],
          responsaveis: [{ curso: 'Engenharia Civil' }, { curso: 'Pedagogia' }],
          caminhos: [
            {
              id: 'caminho-1',
              tipo: 'falabr',
              protocolo: '12345.678901/2026-11',
              prazo: '2026-12-09',
            },
            { id: 'caminho-2', tipo: 'comunidade', protocolo: null, prazo: null },
            { id: 'caminho-3', tipo: 'representante', protocolo: 'REP-42', prazo: null },
          ],
          promessa: {
            id: 'promessa-1',
            resumo: 'Reparo até dezembro.',
            fonte: 'Ouvidoria da UFAL',
            dataEntrega: '2026-12-01',
            conferenciaAbreEm: new Date('2026-12-01T03:00:00Z'),
            conferenciaFechaEm: new Date('2026-12-08T03:00:00Z'),
            votos: { sim: 4, em_parte: 2, nao: 1 },
          },
        })}
        aprovar={acao}
        recusar={acao}
      />,
    );

    expect(html).toContain('300 de 300 apoios');
    expect(html).toContain('Meta batida em');
    expect(html).toContain('O elevador está parado.');
    expect(html).toContain('Situação da moderação: Aprovado');
    expect(html).toContain('Situação da moderação: Pendente');
    expect(html).toContain('Situação da moderação: Recusado');
    expect(html).toContain('Engenharia Civil');
    expect(html).toContain('Pedagogia');
    expect(html).toContain('Fala.BR');
    expect(html).toContain('Comunidade');
    expect(html).toContain('Representante');
    expect(html).toContain('12345.678901/2026-11');
    expect(html).toContain('Promessa registrada');
    expect(html).toContain('4 sim, 2 em parte, 1 não');
    expect(html).not.toMatch(/nome(?: completo)?|telefone|e-?mail|@ufal\.br/i);
  });

  it('oferece ajustes de prazo somente nos caminhos e promessas aplicáveis', () => {
    const html = renderToStaticMarkup(
      <Pauta
        pauta={pauta({
          status: 'cobrando',
          caminhos: [{ id: 'caminho-1', tipo: 'falabr', protocolo: 'NUP-1', prazo: '2026-12-01' }],
        })}
        aprovar={acao}
        recusar={acao}
        prorrogarPrazo={acao}
        corrigirProtocolo={acao}
        remarcarPromessa={acao}
      />,
    );
    expect(html).toContain('Registrar prorrogação');
    expect(html).toContain('Corrigir data do protocolo');
    expect(html).not.toContain('Remarcar data prometida');
    expect(html).toContain('name="motivo"');
    expect(html).toContain('name="fonte"');
  });

  it('pauta aprovada permite trocar categoria; recusada não oferece esse formulário', () => {
    const aprovada = renderToStaticMarkup(
      <Pauta pauta={pauta({ status: 'juntando_apoios' })} aprovar={acao} recusar={acao} />,
    );
    const recusada = renderToStaticMarkup(
      <Pauta pauta={pauta({ status: 'recusada' })} aprovar={acao} recusar={acao} />,
    );
    expect(aprovada).toContain('Trocar categoria');
    expect(aprovada).toContain('id="nova-categoria"');
    expect(recusada).not.toContain('Trocar categoria');
  });

  it('mostra achados de dado pessoal no relato de origem ao lado do texto e da foto', () => {
    const html = renderToStaticMarkup(
      <Pauta
        pauta={pauta({
          relatos: [
            {
              texto: 'Contato: pessoa@ufal.br',
              curso: 'Engenharia Civil',
              fotoChave: null,
              moderacao: 'pendente',
              data: null,
              achados: [
                {
                  severidade: 'bloqueio',
                  motivo: 'email',
                  trecho: 'pessoa@ufal.br',
                  inicio: 9,
                  fim: 25,
                },
              ],
            },
          ],
        })}
        aprovar={acao}
        recusar={acao}
      />,
    );

    expect(html).toContain('Barrar: e-mail (pessoa@ufal.br)');
    // Com e-mail no relato pendente, a tela avisa e oferece recusar só o relato.
    expect(html).toContain('role="alert"');
    expect(html).toContain('Recusar só o relato');
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

  it('o PDF da resposta fica ao lado: o mais novo aberto e todos em links (SCRUM-262)', () => {
    const PDF = 'respostas/2026/11/5f1c2d3e-4a5b-4c6d-8e7f-0123456789ab.pdf';
    const ANTIGO = 'respostas/2026/10/0a1b2c3d-4e5f-4a6b-8c7d-0123456789ab.pdf';
    const html = renderToStaticMarkup(
      <FormularioDaPromessa
        pauta={pauta({ status: 'cobrando' })}
        documentos={[
          { id: 'd2', arquivoChave: PDF, recebidoEm: new Date('2026-11-12T15:00:00.000Z') },
          { id: 'd1', arquivoChave: ANTIGO, recebidoEm: new Date('2026-10-30T15:00:00.000Z') },
        ]}
        hoje="2026-11-10"
        registrar={acao}
      />,
    );
    const sem = renderToStaticMarkup(
      <FormularioDaPromessa
        pauta={pauta({ status: 'cobrando' })}
        hoje="2026-11-10"
        registrar={acao}
      />,
    );

    expect(html).toMatch(new RegExp(`<iframe[^>]*src="/curadoria/arquivos/${PDF}"`));
    expect(html).toContain(`href="/curadoria/arquivos/${ANTIGO}"`);
    expect(html).toContain('PDF recebido em 12/11/2026, 12:00');
    expect(sem).not.toContain('<iframe');
    expect(sem).toContain('Nenhum PDF de resposta chegou pelo bot');
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
        pautas={[
          pauta({ status: 'em_curadoria', restanteMs: -HORA }),
          pauta({ id: 'b', status: 'cobrando' }),
          pauta({ id: 'c', status: 'conquistada' }),
        ]}
        status="em_curadoria"
        q="bebedouro"
      />,
    );

    expect(html).toContain('Em cobrança');
    expect(html).toContain('Conquistada');
    expect(html).toContain('href="/pautas/5f1c2d3e-4a5b-4c6d-8e7f-0123456789ab"');
    expect(html).toContain('name="status"');
    expect(html).toContain('name="q"');
    expect(html).toContain('value="bebedouro"');
    expect(html).toContain('de 300 apoios');
    expect(html).toContain('atrasada há 1 h');
    expect(html).toContain('selected');
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
              fotoChave: 'fotos/2026/11/5f1c2d3e-4a5b-4c6d-8e7f-0123456789ab.jpg',
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
    expect(html).toContain('Relatos em pautas publicadas');
    expect(html).toContain('O relato de quem criou uma pauta é conferido junto com a pauta');
    expect(html).toContain('href="/pautas/5f1c2d3e-4a5b-4c6d-8e7f-0123456789ab"');
    expect(html).toContain('Campus inteiro');
    // A foto aparece para a curadoria conferir, pela rota que exige sessão (SCRUM-262).
    expect(html).toContain(
      'src="/curadoria/arquivos/fotos/2026/11/5f1c2d3e-4a5b-4c6d-8e7f-0123456789ab.jpg"',
    );
    expect(html).not.toContain('ainda não mostra a imagem');
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
