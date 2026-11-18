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
