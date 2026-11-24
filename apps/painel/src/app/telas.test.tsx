import type {
  DetalhePautaDaCuradoria,
  PautaComRelatosPendentes,
  PedidoDeEdicao,
} from '@lumens/dominio';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { Pauta } from './pautas/[id]/pauta';
import { FormularioDaPromessa } from './pautas/[id]/promessa/formulario';
import { pendenciasDaUrl, situacoesDaUrl, urlDaLista } from './pautas/filtros';
import { ListaDePautas } from './pautas/lista';
import { situacaoDoPrazo, textoDoSelo } from './pautas/selos';
import { textoDoPrazo } from './prazo';
import { Relatos } from './relatos/relatos';

// A busca da lista e a navegação usam o roteador do Next, que não existe fora do navegador.
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: () => undefined, push: () => undefined }),
  usePathname: () => '/',
}));

const HORA = 3_600_000;
const acao = () => Promise.resolve();

const pauta = (campos: Partial<DetalhePautaDaCuradoria> = {}): DetalhePautaDaCuradoria => ({
  id: '5f1c2d3e-4a5b-4c6d-8e7f-0123456789ab',
  slug: 'bebedouro-quebrado-no-bloco-12',
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

describe('situacaoDoPrazo', () => {
  it.each([
    [-1, 'atrasada'],
    [0, 'atrasada'],
    [HORA, 'vence_em_breve'],
    [6 * HORA, 'vence_em_breve'],
    [6 * HORA + 1, 'no_prazo'],
    [20 * HORA, 'no_prazo'],
  ])('com %d ms restantes, %s', (restanteMs, situacao) => {
    expect(situacaoDoPrazo(restanteMs)).toBe(situacao);
  });
});

describe('textoDoSelo', () => {
  it.each([
    [20 * HORA, 'vence em 20 h'],
    [5 * HORA + 20 * 60_000, 'vence em 6 h'],
    [40 * 60_000, 'vence em 1 h'],
    [-3 * HORA, 'atrasada há 3 h'],
    [-20 * 60_000, 'atrasada há menos de 1 h'],
    [-280 * 24 * HORA, 'atrasada há 6720 h'],
  ])('%i ms → %s', (ms, texto) => {
    expect(textoDoSelo(ms)).toBe(texto);
  });
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

describe('card de conquista na tela da pauta (SCRUM-394)', () => {
  const salva = {
    slug: 'bebedouro-do-bloco-12',
    texto: 'Trocaram o bebedouro do térreo.',
    fotoChave: 'fotos/2026/11/a1b2c3d4-0000-4000-8000-000000000001.jpg',
    atualizadoEm: new Date('2026-11-19T12:00:00.000Z'),
  };
  const renderizar = (campos: Partial<DetalhePautaDaCuradoria>, erro?: string) =>
    renderToStaticMarkup(
      <Pauta
        pauta={pauta(campos)}
        aprovar={acao}
        recusar={acao}
        conquista={salva}
        origemDoSite="https://lumens.example/"
        erro={erro}
      />,
    );

  it('aparece só em pauta conquistada, com texto, contador, foto salva, aviso e os dois botões', () => {
    const html = renderizar({ status: 'conquistada' });
    expect(html).toContain('Card de conquista');
    expect(html).toContain('O que foi feito');
    expect(html).toContain('Trocaram o bebedouro do térreo.');
    expect(html).toContain('31/160');
    expect(html).toContain(`/curadoria/arquivos/${salva.fotoChave}`);
    expect(html).toContain('type="file"');
    expect(html).toContain(
      'A foto perde a localização antes de ser guardada. Confira se não aparece rosto de pessoa ou placa de carro.',
    );
    expect(html).toContain('Salvar</button>');
    expect(html).toContain('href="https://lumens.example/p/bebedouro-do-bloco-12/card.png"');
    expect(html).toContain('Ver o card de conquista');
  });

  it('não aparece nas outras situações', () => {
    for (const status of ['em_curadoria', 'juntando_apoios', 'cobrando'] as const) {
      expect(renderizar({ status })).not.toContain('Card de conquista');
    }
  });

  it('sem origem do site configurada, o botão de ver o card some, mas o resto fica', () => {
    const html = renderToStaticMarkup(
      <Pauta
        pauta={pauta({ status: 'conquistada' })}
        aprovar={acao}
        recusar={acao}
        conquista={{ ...salva, texto: null, fotoChave: null }}
      />,
    );
    expect(html).toContain('Card de conquista');
    expect(html).not.toContain('Ver o card de conquista');
    expect(html).toContain('0/160');
  });

  it('mostra a mensagem do erro devolvido pela ação', () => {
    const html = renderizar({ status: 'conquistada' }, 'texto_com_dado_pessoal');
    expect(html).toContain('O texto do card tem e-mail ou telefone.');
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
    expect(html).toContain('Marcar como urgente');
    expect(html).toContain('<section id="linha-do-tempo"');
    expect(html).toContain('Linha do tempo');
    expect(html).toContain('Aprovar e publicar');
    // Confirmação extra: a caixa é obrigatória e vai no formulário de aprovar.
    expect(html).toContain('required="" name="conferido"');
    expect(html).toContain('Conferi o texto, o');
    expect(html).toContain('relato e as fotos');
    expect(html).toContain('Recusar<');
    // Situação e prazo como selos; recusar é secundária e só abre o motivo quando pedido.
    expect(html).toContain('Esperando decisão');
    expect(html).toContain('vence em 5 h');
    expect(html).toContain('<details class=');
    expect(html).not.toContain('open=""><summary');
    // Aprovar, recusar, corrigir o bloco e ajustar a meta (SCRUM-326).
    expect(html.match(/name="pautaId" value="5f1c2d3e-4a5b-4c6d-8e7f-0123456789ab"/g)).toHaveLength(
      4,
    );
    // Recusa sem motivo nem sai do navegador; o servidor confere de novo.
    expect(html).toMatch(/<textarea[^>]*name="motivo"[^>]*required/);
    // A categoria vem marcada com a de quem relatou, e por isso não é obrigatória na decisão.
    expect(html).toMatch(/<select[^>]*name="categoria"/);
    expect(html).not.toMatch(/<select[^>]*name="categoria"[^>]*required/);
    expect(html).toContain('Infraestrutura');
    expect(html).toContain('Segurança');
    expect(html).toContain('Permanência');
  });

  it('aprovar manda as fotos pendentes de cada relato pendente da tela, e só dos pendentes', () => {
    const relato = { achados: [], curso: null, data: null };
    const foto = (id: string, moderacao: 'pendente' | 'aprovado' | 'recusado') => ({
      id,
      chave: `fotos/${id}.jpg`,
      moderacao,
      motivoRecusa: moderacao === 'recusado' ? 'Mostra uma pessoa.' : null,
    });
    const html = renderToStaticMarkup(
      <Pauta
        pauta={pauta({
          relatos: [
            {
              ...relato,
              id: 'r1',
              texto: 'Com fotos.',
              fotos: [foto('f1', 'pendente'), foto('f2', 'pendente'), foto('f3', 'recusado')],
              moderacao: 'pendente',
            },
            { ...relato, id: 'r2', texto: 'Sem foto.', fotos: [], moderacao: 'pendente' },
            {
              ...relato,
              id: 'r3',
              texto: 'Recusado.',
              fotos: [foto('f4', 'recusado')],
              moderacao: 'recusado',
            },
          ],
        })}
        aprovar={acao}
        recusar={acao}
      />,
    );

    expect(html).toContain('name="relatoVisto" value="r1"');
    expect(html).toContain('name="fotoVista:r1" value="f1"');
    expect(html).toContain('name="fotoVista:r1" value="f2"');
    // A foto já recusada não conta como vista: a aprovação confere só o que está pendente.
    expect(html).not.toContain('name="fotoVista:r1" value="f3"');
    expect(html).toContain('name="relatoVisto" value="r2"');
    expect(html).not.toContain('fotoVista:r2');
    expect(html).not.toContain('relatoVisto" value="r3"');
    expect(html).not.toContain('fotoVista:r3');
  });

  it('cada foto tem a sua recusa com motivo obrigatório; a recusada mostra o motivo', () => {
    const html = renderToStaticMarkup(
      <Pauta
        pauta={pauta({
          status: 'juntando_apoios',
          relatos: [
            {
              id: 'r1',
              texto: 'Relato.',
              achados: [],
              curso: null,
              data: null,
              moderacao: 'aprovado',
              fotos: [
                { id: 'f1', chave: 'fotos/a.jpg', moderacao: 'aprovado', motivoRecusa: null },
                {
                  id: 'f2',
                  chave: 'fotos/b.jpg',
                  moderacao: 'recusado',
                  motivoRecusa: 'Mostra uma pessoa.',
                },
              ],
            },
          ],
        })}
        aprovar={acao}
        recusar={acao}
        recusarFoto={acao}
      />,
    );

    expect(html).toContain('Foto 1 de 2');
    expect(html).toContain('Foto 2 de 2');
    expect(html.match(/Recusar só esta foto/g)).toHaveLength(1);
    expect(html).toContain('name="fotoId" value="f1"');
    expect(html).not.toContain('name="fotoId" value="f2"');
    expect(html).toContain('name="voltar" value="/pautas/5f1c2d3e-4a5b-4c6d-8e7f-0123456789ab"');
    expect(html).toMatch(/<textarea[^>]*name="motivo"[^>]*required/);
    expect(html).toContain('Recusada. Motivo: Mostra uma pessoa.');
  });

  it('mostra o pedido de edição com o antes e o depois, e recusa exige motivo', () => {
    const html = renderToStaticMarkup(
      <Pauta
        pauta={pauta({ status: 'juntando_apoios' })}
        aprovar={acao}
        recusar={acao}
        pedidosDeEdicao={[
          {
            id: 'p1',
            pautaId: '5f1c2d3e-4a5b-4c6d-8e7f-0123456789ab',
            campo: 'titulo',
            antes: 'Bebedouro quebrado',
            depois: 'Bebedouro do bloco 12 quebrado',
            criadoEm: new Date('2026-11-09T12:00:00.000Z'),
            achados: [
              {
                severidade: 'aviso',
                motivo: 'possivel_nome',
                trecho: 'professora Marta',
                inicio: 0,
                fim: 16,
              },
            ],
          },
        ]}
        aprovarPedido={acao}
        recusarPedido={acao}
      />,
    );

    expect(html).toContain('Pedidos de edição');
    expect(html).toContain('Publicado');
    expect(html).toContain('Bebedouro quebrado');
    expect(html).toContain('Pedido');
    expect(html).toContain('Bebedouro do bloco 12 quebrado');
    // Aprovar vale para o texto que a tela mostra.
    expect(html).toContain('name="depoisVisto" value="Bebedouro do bloco 12 quebrado"');
    expect(html).toMatch(/<input[^>]*required[^>]*name="motivo"/);
    expect(html).toContain('Aprovar</button>');
    expect(html).toContain('<b>Conferir</b> possível nome de pessoa (professora Marta)');
  });

  it('pedido com e-mail, telefone ou matrícula no texto novo trava o botão de aprovar', () => {
    const pedido = (id: string, achados: PedidoDeEdicao['achados']): PedidoDeEdicao => ({
      id,
      pautaId: '5f1c2d3e-4a5b-4c6d-8e7f-0123456789ab',
      campo: 'descricao',
      antes: 'Antes.',
      depois: 'Depois.',
      criadoEm: new Date('2026-11-09T12:00:00.000Z'),
      achados,
    });
    const html = renderToStaticMarkup(
      <Pauta
        pauta={pauta({ status: 'juntando_apoios' })}
        aprovar={acao}
        recusar={acao}
        pedidosDeEdicao={[
          pedido('limpo', []),
          pedido('barrado', [
            {
              severidade: 'bloqueio',
              motivo: 'email',
              trecho: 'fulano@ufal.br',
              inicio: 0,
              fim: 14,
            },
          ]),
        ]}
        aprovarPedido={acao}
        recusarPedido={acao}
      />,
    );

    const botoes = html.match(/<button[^>]*>Aprovar<\/button>/g) ?? [];
    expect(botoes).toHaveLength(2);
    expect(botoes.filter((b) => b.includes(' disabled=""'))).toHaveLength(1);
    expect(html).toContain('<b>Barrar</b> e-mail (fulano@ufal.br)');
    // Recusar continua disponível nos dois.
    expect(html.match(/Confirmar recusa/g)).toHaveLength(2);
  });

  it('sem pedido pendente, a seção de pedidos não aparece', () => {
    const html = renderToStaticMarkup(
      <Pauta pauta={pauta({ status: 'juntando_apoios' })} aprovar={acao} recusar={acao} />,
    );
    expect(html).not.toContain('Pedidos de edição');
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
      <ListaDePautas pautas={[pauta({ urgente: true })]} situacoes={[]} pendencias={[]} q="" />,
    );
    expect(html).toContain('>Urgente</em>');
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
              id: 'r1',
              texto: 'O elevador está parado.',
              achados: [],
              curso: 'Engenharia Civil',
              fotos: [
                { id: 'f1', chave: 'fotos/relato.jpg', moderacao: 'aprovado', motivoRecusa: null },
              ],
              moderacao: 'aprovado',
              data: new Date('2026-11-09T12:00:00.000Z'),
            },
            {
              id: 'r2',
              texto: 'A lâmpada continua apagada.',
              achados: [],
              curso: 'Pedagogia',
              fotos: [],
              moderacao: 'pendente',
              data: null,
            },
            {
              id: 'r3',
              texto: 'Relato recusado.',
              achados: [],
              curso: null,
              fotos: [],
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

    expect(html).toContain('<b>300</b> de 300 apoios');
    expect(html).toContain('Meta batida em');
    expect(html).toContain('O elevador está parado.');
    expect(html).toContain('Aprovado, 09/11/2026');
    expect(html).toContain('Pendente.');
    expect(html).toContain('Recusado.');
    expect(html).toContain('Engenharia Civil');
    expect(html).toContain('Pedagogia');
    expect(html).toContain('Fala.BR');
    expect(html).toContain('Comunidade');
    expect(html).toContain('Representante');
    expect(html).toContain('12345.678901/2026-11');
    expect(html).toContain('Promessa registrada');
    expect(html).toContain('4 sim, 2 em parte, 1 não');
    // Os avisos fixos da tela dizem que nomes não aparecem; fora deles, nenhum dado de identidade.
    const semAvisos = html.replace(
      /O nome nunca aparece no site\.|Os nomes não aparecem no site\./g,
      '',
    );
    expect(semAvisos).not.toMatch(/nome(?: completo)?|telefone|e-?mail|@ufal\.br/i);
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
    expect(html).toContain('Prorrogar prazo (+30 dias)');
    expect(html).toContain('Corrigir data do protocolo');
    expect(html).not.toContain('Remarcar data prometida');
    expect(html).toContain('name="motivo"');
    expect(html).toContain('name="fonte"');
  });

  it('entre 21h e meia-noite em Maceió, calcula o dia mínimo da remarcação no fuso local', () => {
    // 22h de 17/11 em Maceió (UTC−3) já é 18/11 em UTC, mas amanhã em Maceió ainda é 18/11.
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-18T01:00:00Z'));
    try {
      const html = renderToStaticMarkup(
        <Pauta
          pauta={pauta({
            status: 'prometido',
            caminhos: [{ id: 'c-1', tipo: 'falabr', protocolo: 'NUP-1', prazo: '2026-12-01' }],
            promessa: {
              id: 'p-1',
              resumo: 'Trocar o equipamento.',
              fonte: 'Ofício 1',
              dataEntrega: '2026-12-01',
              conferenciaAbreEm: new Date('2026-12-01T03:00:00Z'),
              conferenciaFechaEm: new Date('2026-12-08T03:00:00Z'),
              votos: { sim: 0, em_parte: 0, nao: 0 },
            },
          })}
          aprovar={acao}
          recusar={acao}
          prorrogarPrazo={acao}
          corrigirProtocolo={acao}
          remarcarPromessa={acao}
        />,
      );
      expect(html).toContain('max="2026-11-17"');
      expect(html).toContain('min="2026-11-18"');
    } finally {
      vi.useRealTimers();
    }
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
              id: 'r4',
              texto: 'Contato: pessoa@ufal.br',
              curso: 'Engenharia Civil',
              fotos: [],
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

    expect(html).toContain('<b>Barrar</b> e-mail (pessoa@ufal.br)');
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
    // O formulário de recusa volta aberto, com o campo do motivo à vista.
    expect(sem).toMatch(/<details class="[^"]*" open="">/);
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

  it('formulário tem resumo, fonte e data prometida entre hoje e o teto', () => {
    const html = renderToStaticMarkup(
      <FormularioDaPromessa
        pauta={pauta({ status: 'cobrando' })}
        hoje="2026-11-10"
        ate="2028-11-10"
        registrar={acao}
      />,
    );

    expect(html).toMatch(/<textarea[^>]*name="resumo"[^>]*required/);
    expect(html).toMatch(/<input[^>]*required[^>]*name="fonte"/);
    expect(html).toMatch(/<input id="dataEntrega"[^>]*min="2026-11-10" max="2028-11-10"/);
    expect(html).toMatch(/<textarea[^>]*name="resumo"[^>]*maxLength="500"/);
    expect(html).toMatch(/<input id="fonte"[^>]*maxLength="120"/);
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
        ate="2028-11-10"
        registrar={acao}
      />,
    );
    const sem = renderToStaticMarkup(
      <FormularioDaPromessa
        pauta={pauta({ status: 'cobrando' })}
        hoje="2026-11-10"
        ate="2028-11-10"
        registrar={acao}
      />,
    );

    expect(html).toMatch(new RegExp(`<iframe[^>]*src="/curadoria/arquivos/${PDF}"`));
    expect(html).toContain(`href="/curadoria/arquivos/${ANTIGO}"`);
    expect(html).toContain('PDF recebido em 12/11/2026, 12:00');
    expect(sem).not.toContain('<iframe');
    expect(sem).toContain('Nenhum PDF chegou pelo bot');
  });

  it('pauta fora de cobrança não mostra o formulário; erro do registro aparece', () => {
    const fora = renderToStaticMarkup(
      <FormularioDaPromessa pauta={pauta()} hoje="2026-11-10" ate="2028-11-10" registrar={acao} />,
    );
    const comErro = renderToStaticMarkup(
      <FormularioDaPromessa
        pauta={pauta({ status: 'cobrando' })}
        hoje="2026-11-10"
        ate="2028-11-10"
        erro="data_no_passado"
        registrar={acao}
      />,
    );

    expect(fora).not.toContain('<form');
    expect(fora).toContain('não pode receber promessa agora');
    expect(comErro).toContain('role="alert"');
    expect(comErro).toContain('não pode estar no passado');
  });

  it.each([
    ['data_distante', 'passa de 2 anos a partir de hoje'],
    ['resumo_longo', 'O resumo passou de 500 caracteres'],
    ['fonte_longa', 'Quem respondeu passou de 120 caracteres'],
  ])('recusa %s do domínio tem mensagem própria (SCRUM-313)', (erro, mensagem) => {
    const html = renderToStaticMarkup(
      <FormularioDaPromessa
        pauta={pauta({ status: 'cobrando' })}
        hoje="2026-11-10"
        ate="2028-11-10"
        erro={erro}
        registrar={acao}
      />,
    );

    expect(html).toContain('role="alert"');
    expect(html).toContain(mensagem);
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
        situacoes={['em_curadoria']}
        pendencias={[]}
        q="bebedouro"
      />,
    );

    expect(html).toContain('Em cobrança');
    expect(html).toContain('Conquistada');
    expect(html).toContain('href="/pautas/5f1c2d3e-4a5b-4c6d-8e7f-0123456789ab"');
    expect(html).toContain('name="q"');
    expect(html).toContain('value="bebedouro"');
    expect(html).toContain('<b>80</b> apoios');
    expect(html).toContain('atrasada há 1 h');
  });

  it('tem um campo de busca só, com rótulo, e a situação escolhida vai escondida na busca', () => {
    const html = renderToStaticMarkup(
      <ListaDePautas
        pautas={[pauta()]}
        situacoes={['cobrando', 'prometido']}
        pendencias={['conferencia_aberta']}
        q=""
      />,
    );
    expect(html.match(/type="search"/g)).toHaveLength(1);
    expect(html).toContain('Buscar por título, bloco ou etapa');
    expect(html).toContain('name="status" value="cobrando,prometido"');
    expect(html).toContain('name="pendencia" value="conferencia_aberta"');
    expect(html).not.toContain('<select');
  });

  it('chips: as situações, um traço e as pendências, com os números; os escolhidos ficam marcados', () => {
    const html = renderToStaticMarkup(
      <ListaDePautas
        pautas={[pauta()]}
        situacoes={['em_curadoria']}
        pendencias={['sem_resposta_oficial']}
        q=""
        contagens={{
          total: 12,
          porStatus: { em_curadoria: 3, cobrando: 2 },
          porPendencia: { sem_resposta_oficial: 4, conferencia_aberta: 1 },
        }}
      />,
    );
    expect(html).toMatch(/>Todas<b>12<\/b>/);
    expect(html).toMatch(/>Esperando decisão<b>3<\/b>/);
    expect(html).toMatch(/>Sem resposta oficial<b>4<\/b>/);
    expect(html).toMatch(/>Conferência aberta<b>1<\/b>/);
    expect(html).toContain('chipSeparador');
    // Marcados: a situação e a pendência escolhidas (aria-current), e só elas.
    expect(html.match(/aria-current="true"/g)).toHaveLength(2);
  });

  it('cada chip leva à URL com aquele filtro ligado ou desligado, mantendo os outros', () => {
    const html = renderToStaticMarkup(
      <ListaDePautas pautas={[pauta()]} situacoes={['em_curadoria']} pendencias={[]} q="goteira" />,
    );
    // Ligar "Em cobrança" junto de "esperando decisão": duas situações, e a busca fica.
    expect(html).toContain('href="/pautas?status=em_curadoria,cobrando&amp;q=goteira"');
    // Desligar a única situação: sem situação, é "todas".
    expect(html).toContain('href="/pautas?status=todas&amp;q=goteira"');
  });
});

describe('filtros da lista de pautas', () => {
  it('sem parâmetro a lista abre em "esperando decisão"; "todas" e valores inválidos limpam', () => {
    expect(situacoesDaUrl(undefined)).toEqual(['em_curadoria']);
    expect(situacoesDaUrl('todas')).toEqual([]);
    expect(situacoesDaUrl('cobrando,prometido')).toEqual(['cobrando', 'prometido']);
    expect(situacoesDaUrl('cobrando,xyz')).toEqual(['cobrando']);
    expect(situacoesDaUrl('')).toEqual([]);
  });

  it('lê as pendências pedidas, na ordem dos chips, ignorando as desconhecidas', () => {
    expect(pendenciasDaUrl('conferencia_aberta,sem_resposta_oficial,x')).toEqual([
      'sem_resposta_oficial',
      'conferencia_aberta',
    ]);
    expect(pendenciasDaUrl(undefined)).toEqual([]);
  });

  it('a URL tira o que é padrão e escreve "todas" quando não há situação', () => {
    expect(urlDaLista({ situacoes: ['em_curadoria'], pendencias: [], q: '' })).toBe('/pautas');
    expect(urlDaLista({ situacoes: [], pendencias: [], q: '' })).toBe('/pautas?status=todas');
    expect(
      urlDaLista({ situacoes: ['cobrando'], pendencias: ['sem_resposta_oficial'], q: 'a b' }),
    ).toBe('/pautas?status=cobrando&pendencia=sem_resposta_oficial&q=a%20b');
  });
});

describe('relatos novos', () => {
  const grupo = (relatos: PautaComRelatosPendentes['relatos']): PautaComRelatosPendentes => ({
    id: '5f1c2d3e-4a5b-4c6d-8e7f-0123456789ab',
    titulo: 'Bebedouro quebrado no bloco 12',
    bloco: null,
    status: 'juntando_apoios',
    relatos,
  });

  it('agrupa por pauta, lembra o que barrar e mostra os achados, a foto e as duas decisões', () => {
    const html = renderToStaticMarkup(
      <Relatos
        pautas={[
          grupo([
            {
              id: 'r1',
              curso: null,
              texto: 'Falem com a professora Marta: fulano@ufal.br',
              fotos: [
                { id: 'f1', chave: 'fotos/2026/11/5f1c2d3e-4a5b-4c6d-8e7f-0123456789ab.jpg' },
                { id: 'f2', chave: 'fotos/2026/11/outra.jpg' },
              ],
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
            { id: 'r2', curso: null, texto: 'Sem água.', fotos: [], achados: [] },
          ]),
        ]}
        aprovar={acao}
        recusar={acao}
        recusarFoto={acao}
      />,
    );

    expect(html).toContain('nome de pessoa, ofensa e dado pessoal');
    expect(html).toContain('Relatos em pautas publicadas');
    expect(html).toContain('O relato de quem criou a pauta é conferido junto com a pauta');
    expect(html).toContain('href="/pautas/5f1c2d3e-4a5b-4c6d-8e7f-0123456789ab"');
    expect(html).toContain('Campus inteiro');
    // A foto aparece para a curadoria conferir, pela rota que exige sessão (SCRUM-262).
    expect(html).toContain(
      'src="/curadoria/arquivos/fotos/2026/11/5f1c2d3e-4a5b-4c6d-8e7f-0123456789ab.jpg"',
    );
    expect(html).not.toContain('ainda não mostra a imagem');
    // Duas fotos, cada uma com a sua recusa; aprovar leva os ids das duas.
    expect(html).toContain('src="/curadoria/arquivos/fotos/2026/11/outra.jpg"');
    expect(html.match(/Recusar só esta foto/g)).toHaveLength(2);
    expect(html).toContain('name="fotoVista" value="f1"');
    expect(html).toContain('name="fotoVista" value="f2"');
    expect(html).toContain('name="voltar" value="/relatos"');
    expect(html).toContain('<b>Conferir</b> possível nome de pessoa (professora Marta)');
    expect(html).toContain('<b>Barrar</b> e-mail (fulano@ufal.br)');
    expect(html.match(/Aprovar<\/button>/g)).toHaveLength(2);
    expect(html.match(/name="conferido"/g)).toHaveLength(2);
    expect(html.match(/Recusar relato/g)).toHaveLength(2);
    expect(html).toContain('name="relatoId" value="r1"');
  });

  it('fila vazia, aviso depois da decisão e erro de relato já moderado', () => {
    const html = renderToStaticMarkup(
      <Relatos
        pautas={[]}
        feito="aprovado"
        erro="ja_moderado"
        aprovar={acao}
        recusar={acao}
        recusarFoto={acao}
      />,
    );

    expect(html).toContain('Nenhum relato esperando moderação.');
    expect(html).toContain('Relato aprovado.');
    expect(html).toContain('já decidiu este relato');
  });

  it('valor desconhecido em ?feito e ?erro não vira texto na tela', () => {
    const html = renderToStaticMarkup(
      <Relatos
        pautas={[]}
        feito="<script>"
        erro="<b>x</b>"
        aprovar={acao}
        recusar={acao}
        recusarFoto={acao}
      />,
    );

    expect(html).not.toContain('script');
    expect(html).not.toContain('<b>');
    expect(html).not.toContain('role="alert"');
  });
});

describe('decisão: categoria de quem relatou e aviso de texto editado (E7)', () => {
  const eventoEditado = {
    id: 'e1',
    tipo: 'pauta_editada',
    dados: { campo: 'descricao', antes: 'a', depois: 'b' },
    origem: 'estudante' as const,
    publico: false,
    criadoEm: new Date('2026-11-09T13:00:00.000Z'),
  };
  const render = (campos = {}, eventos: unknown[] = []) =>
    renderToStaticMarkup(
      <Pauta pauta={pauta(campos)} eventos={eventos as never} aprovar={acao} recusar={acao} />,
    );

  it('a categoria já vem marcada com a de quem relatou, rotulada, com a dica, e sem required', () => {
    const html = render({ categoria: 'seguranca' });
    expect(html).toMatch(/<option value="seguranca" selected="">/);
    expect(html).toContain('escolhida por quem relatou');
    expect(html).toContain('Troque só se estiver errada.');
    expect(html).toContain('aria-describedby="dica-categoria"');
    expect(html).not.toMatch(/<select[^>]*name="categoria"[^>]*required/);
  });

  it('aprovar sem tocar na categoria publica com a de quem relatou (o valor já está no formulário)', () => {
    const html = render({ categoria: 'permanencia' });
    const selecionadas = html.match(/<option value="[a-z_]+" selected="">/g);
    expect(selecionadas).toEqual(['<option value="permanencia" selected="">']);
  });

  it('sem categoria de quem relatou (a_classificar), continua obrigatória e sem dica', () => {
    const html = render({ categoria: 'a_classificar' });
    expect(html).toMatch(/<select[^>]*name="categoria"[^>]*required/);
    expect(html).not.toContain('escolhida por quem relatou');
    expect(html).not.toContain('Troque só se estiver errada.');
    // Só o item "Escolha uma categoria" vem marcado, e ele é desabilitado: nenhuma categoria real.
    expect(html).toContain(
      '<option value="" disabled="" selected="">Escolha uma categoria</option>',
    );
    expect(html).not.toMatch(/<option value="[a-z_]+" selected="">/);
  });

  it('categoria fora da lista também não vem marcada', () => {
    const html = render({ categoria: 'inventada' });
    expect(html).toMatch(/<select[^>]*name="categoria"[^>]*required/);
  });

  it('com pauta_editada na linha do tempo, avisa para reler o texto antes de aprovar', () => {
    const html = render({}, [eventoEditado]);
    expect(html).toContain('O responsável editou o texto antes da decisão.');
    expect(html).toContain('leia de novo antes de aprovar');
  });

  it('sem edição, não há aviso; e depois de decidida, também não', () => {
    expect(render()).not.toContain('O responsável editou o texto antes da decisão.');
    expect(render({ status: 'juntando_apoios' }, [eventoEditado])).not.toContain(
      'O responsável editou o texto antes da decisão.',
    );
  });
});

describe('lista de pautas: aviso de truncamento (E7)', () => {
  it('sem truncamento, não há aviso; e com 200 pautas há', () => {
    const sem = renderToStaticMarkup(
      <ListaDePautas pautas={[pauta()]} situacoes={[]} pendencias={[]} q="" />,
    );
    expect(sem).not.toContain('mais antigas');
    const cheia = Array.from({ length: 200 }, (_, i) => pauta({ id: `p${String(i)}` }));
    const padrao = renderToStaticMarkup(
      <ListaDePautas pautas={cheia} situacoes={[]} pendencias={[]} q="" />,
    );
    expect(padrao).toContain('mais antigas');
  });
});
