import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { PautasPorGrupo } from './PautasPorGrupo';

const grupos = [
  { chave: 'servicos', rotulo: 'Serviços', total: 8, largura: 100 },
  { chave: 'seguranca', rotulo: 'Segurança', total: 4, largura: 50 },
];

describe('PautasPorGrupo', () => {
  it('mostra rótulo acentuado e número em texto, com as barras escondidas do leitor de tela', () => {
    const html = renderToStaticMarkup(
      <PautasPorGrupo id="x" titulo="Apoios por categoria" vazio="Nada." grupos={grupos} />,
    );
    expect(html).toContain('Serviços');
    expect(html).toContain('Segurança');
    expect(html).toContain('aria-hidden="true"');
    expect(html).toContain('12 apoios; o maior é Serviços (8).');
  });

  it('mostra o texto de vazio sem grupos', () => {
    const html = renderToStaticMarkup(
      <PautasPorGrupo
        id="x"
        titulo="Blocos mais ativos"
        vazio="Nenhum apoio por bloco ainda."
        grupos={[]}
      />,
    );
    expect(html).toContain('Nenhum apoio por bloco ainda.');
  });
});
