import { readFileSync } from 'node:fs';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import Manual from './page';
import { SECOES, linkDoManual } from './secoes';

const html = renderToStaticMarkup(<Manual />);

describe('manual: seções e âncoras', () => {
  it.each(Object.values(SECOES))(
    '"$titulo" tem a âncora $id e o título ligado à região',
    (secao) => {
      const titulo = secao.titulo.replace('&', '&amp;');
      expect(html).toMatch(
        new RegExp(
          `<section[^>]*id="${secao.id}"[^>]*aria-labelledby="titulo-${secao.id}"[^>]*>\\s*<h2 id="titulo-${secao.id}"[^>]*>${titulo}</h2>`,
        ),
      );
      // O sumário leva a ela.
      expect(html).toContain(`href="#${secao.id}"`);
    },
  );

  it('tem um só h1 e os links do manual para outras páginas', () => {
    expect(html.match(/<h1/g)).toHaveLength(1);
    expect(html).toContain('href="/privacidade"');
    expect(html).toContain('href="https://falabr.cgu.gov.br"');
  });

  it('o "Saiba mais" dos caminhos aponta para a seção do Fala.BR', () => {
    expect(linkDoManual('falabr')).toBe('/manual#fala-br');
    expect(html).toContain('id="fala-br"');
  });

  it('cita os quatro caminhos e as categorias', () => {
    for (const nome of [
      'Fala.BR',
      'Solução da comunidade',
      'Representante',
      'Proposta da comunidade',
      'Confirmar',
      'Escolher outra',
    ]) {
      expect(html).toContain(nome);
    }
  });
});

describe('manual: texto do Fala.BR igual ao do bot', () => {
  const bot = readFileSync(
    new URL('../../../../backend/src/bot/conversation/minhas-pautas.ts', import.meta.url),
    'utf8',
  );
  // O bot escreve "\n" e *negrito*; o manual, parágrafos e <strong>. O resto tem de ser idêntico.
  const frases = [
    'O Fala.BR é o canal oficial do governo federal para registrar manifestações.',
    'É para lá que a pauta vai porque a ouvidoria da UFAL tem prazo legal para responder.',
    'Copie o texto da manifestação, que mando logo depois (se eu não conseguir montá-lo, aviso).',
    'cole no campo "Descrição" de uma nova manifestação.',
    'Ao enviar, o Fala.BR dá um número de protocolo. Guarde e mande aqui em',
    ': é com ele que a pauta passa a ser cobrada.',
  ];

  it.each(frases)('o bot e o manual dizem: %s', (frase) => {
    expect(bot).toContain(frase);
    const noHtml = html
      .replaceAll('&quot;', '"')
      .replaceAll('<strong>', '')
      .replaceAll('</strong>', '')
      .replace(/<a [^>]*>([^<]*)<\/a>/g, '$1')
      .replace(/\s+/g, ' ');
    expect(noHtml).toContain(frase.replace(/\s+/g, ' ').replace(/^: /, ': '));
  });

  it('traz o endereço e o nome do botão que o bot cita', () => {
    expect(bot).toContain('https://falabr.cgu.gov.br');
    expect(bot).toContain('*Registrar protocolo*');
    expect(html).toContain('Registrar protocolo');
  });
});
