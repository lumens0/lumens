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
