import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import Privacidade from './page';

afterEach(() => {
  vi.unstubAllEnvs();
});

/** SCRUM-283: o que a política diz que é guardado segue o canal do bot. */
describe('política de privacidade por canal', () => {
  it('no Telegram, não diz que guarda telefone e cita o id do chat', () => {
    vi.stubEnv('NEXT_PUBLIC_CANAL_BOT', 'telegram');
    const html = renderToStaticMarkup(<Privacidade />);
    expect(html).toContain('id do seu chat');
    expect(html).not.toMatch(/Seu telefone e seu e-mail são cifrados/);
    expect(html).not.toContain('Seu número de telefone');
    expect(html).not.toMatch(/apagamos seu telefone/);
  });

  it('no WhatsApp, continua falando do telefone', () => {
    vi.stubEnv('NEXT_PUBLIC_CANAL_BOT', 'whatsapp');
    const html = renderToStaticMarkup(<Privacidade />);
    expect(html).toContain('Seu número de telefone');
    expect(html).toContain('Seu telefone e seu e-mail são cifrados');
    expect(html).not.toContain('id do seu chat');
  });
});

describe('política de privacidade: seção do Fala.BR', () => {
  it('tem a âncora que os caminhos da pauta usam e já diz que o bot entrega o texto', () => {
    const html = renderToStaticMarkup(<Privacidade />);
    expect(html).toMatch(
      /<section[^>]*id="fala-br"[^>]*>\s*<h2[^>]*>Quando a pauta vai para o Fala\.BR/,
    );
    expect(html).not.toContain('ainda não está em funcionamento');
  });
});

describe('política de privacidade: fotos por unidade e pedidos de edição', () => {
  const html = renderToStaticMarkup(<Privacidade />);

  it('diz que são até três fotos, que cada uma é analisada sozinha e que o motivo da recusa vai a quem enviou', () => {
    expect(html).toContain('até três por relato');
    expect(html).toContain('Cada foto é analisada sozinha');
    expect(html).toContain('enviamos a quem mandou a foto');
    expect(html).toContain('LGPD, art. 7º, I');
  });

  it('explica o que fica guardado de um pedido de edição e quando é apagado', () => {
    expect(html).toContain('pediu para mudar o título ou a descrição');
    expect(html).toContain('Os pedidos não aprovados são apagados');
  });
});
