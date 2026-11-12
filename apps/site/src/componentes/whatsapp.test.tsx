import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SEM_APOIO } from '../dados/pautas-publicas';
import type { Pauta } from '../dados/tipos';
import { STATUS_PAUTA } from '../dados/tipos';
import { BotaoRelatar, BotaoVouAjudar, BotaoWhatsApp } from './BotaoWhatsApp';
import { ListaVazia } from './ListaVazia';
import { CardPauta } from './CardPauta';

const pauta: Pauta = {
  slug: 'bebedouros-no-bloco-18',
  titulo: 'Bebedouros no Bloco 18',
  descricao: 'Os bebedouros estão quebrados.',
  categoria: 'Infraestrutura',
  status: 'juntando_apoios',
  bloco_slug: 'bloco-18',
  bloco_nome: 'Bloco 18',
  meta: 100,
  apoios: 10,
  criada_em: '2026-01-01T12:00:00Z',
  aprovada_em: '2026-01-02T12:00:00Z',
  meta_batida_em: null,
  cursos_responsaveis: [],
  proxima_etapa: null,
};

describe('botões do WhatsApp', () => {
  beforeEach(() => {
    vi.stubEnv('NEXT_PUBLIC_WHATSAPP_BOT', '5582999999999');
    vi.stubEnv('NEXT_PUBLIC_FLAG_APOIAR', '1');
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('abre o bot em nova aba com o comando e um aria-label explícito', () => {
    const html = renderToStaticMarkup(
      <BotaoWhatsApp comando="apoiar x" texto="Apoiar" rotulo="Apoiar a pauta X pelo WhatsApp" />,
    );
    expect(html).toContain('href="https://wa.me/5582999999999?text=apoiar%20x"');
    expect(html).toContain('aria-label="Apoiar a pauta X pelo WhatsApp"');
    expect(html).toContain('target="_blank"');
    expect(html).toContain('rel="noopener noreferrer"');
  });

  it('sem número configurado não renderiza nada', () => {
    vi.stubEnv('NEXT_PUBLIC_WHATSAPP_BOT', '');
    expect(renderToStaticMarkup(<BotaoWhatsApp comando="x" texto="Apoiar" rotulo="r" />)).toBe('');
  });

  it('"Vou ajudar" abre o bot com o slug da pauta', () => {
    const html = renderToStaticMarkup(<BotaoVouAjudar slug="faixa" titulo="Mutirão" />);
    expect(html).toContain('?text=ajudar%20faixa');
    expect(html).toContain('aria-label="Vou ajudar na proposta Mutirão pelo WhatsApp"');
  });

  it.each(STATUS_PAUTA.map((status) => [status, !SEM_APOIO.has(status)] as const))(
    'card com status %s mostra Apoiar: %s',
    (status, mostra) => {
      const html = renderToStaticMarkup(<CardPauta pauta={{ ...pauta, status }} />);
      expect(html.includes(`?text=apoiar%20${pauta.slug}"`)).toBe(mostra);
      if (mostra) {
        expect(html).toContain(`aria-label="Apoiar a pauta ${pauta.titulo} pelo WhatsApp"`);
      }
    },
  );

  it('flag de apoio desligada esconde "Apoiar" em todo status', () => {
    vi.stubEnv('NEXT_PUBLIC_FLAG_APOIAR', '');
    for (const status of STATUS_PAUTA) {
      expect(renderToStaticMarkup(<CardPauta pauta={{ ...pauta, status }} />)).not.toContain(
        'apoiar%20',
      );
    }
  });

  it('com canal telegram, os botões abrem o t.me e o aria-label diz Telegram', () => {
    vi.stubEnv('NEXT_PUBLIC_CANAL_BOT', 'telegram');
    vi.stubEnv('NEXT_PUBLIC_TELEGRAM_BOT', 'LumensBot');
    const relatar = renderToStaticMarkup(<BotaoRelatar />);
    expect(relatar).toContain('href="https://t.me/LumensBot?start=nova"');
    expect(relatar).toContain('aria-label="Relatar um problema do campus pelo Telegram"');
    const ajudar = renderToStaticMarkup(<BotaoVouAjudar slug="faixa" titulo="Mutirão" />);
    expect(ajudar).toContain('href="https://t.me/LumensBot?start=ajudar_faixa"');
    expect(ajudar).toContain('aria-label="Vou ajudar na proposta Mutirão pelo Telegram"');
    const card = renderToStaticMarkup(<CardPauta pauta={pauta} />);
    expect(card).toContain(`href="https://t.me/LumensBot?start=apoiar_${pauta.slug}"`);
    expect(card).not.toContain('WhatsApp');
    expect(renderToStaticMarkup(<ListaVazia bloco={undefined} />)).toContain(
      'Relate pelo Telegram',
    );
  });

  it('com canal telegram sem usuário, os botões somem mesmo com número do WhatsApp', () => {
    vi.stubEnv('NEXT_PUBLIC_CANAL_BOT', 'telegram');
    vi.stubEnv('NEXT_PUBLIC_TELEGRAM_BOT', '');
    expect(renderToStaticMarkup(<BotaoRelatar />)).toBe('');
    expect(renderToStaticMarkup(<CardPauta pauta={pauta} />)).not.toContain('apoiar');
  });

  it('o botão Apoiar fica fora do link do título', () => {
    const html = renderToStaticMarkup(<CardPauta pauta={{ ...pauta, status: 'cobrando' }} />);
    expect(html).toMatch(/<\/a><\/h2>/);
    expect(html.match(/<a /g)).toHaveLength(2);
  });
});
