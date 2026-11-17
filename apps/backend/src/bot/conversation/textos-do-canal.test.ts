/**
 * SCRUM-323: o bot fala pelo WhatsApp e pelo Telegram. No Telegram a identidade é o chat, e a pessoa
 * nunca informou telefone: nenhum texto pode tratar "este número" como quem ela é, nem prometer
 * resposta "pelo WhatsApp". Os textos de privacidade ficam de fora: são da SCRUM-283.
 */
import { describe, expect, it } from 'vitest';
import * as apoio from './apoio';
import * as blocos from './blocos';
import * as coOwner from './co-owner';
import * as comandosDoSite from './comandos-do-site';
import * as handlers from './handlers';
import * as minhasPautas from './minhas-pautas';
import * as novaPauta from './nova-pauta';
import * as proposta from './proposta';
import * as protocoloFalabr from './protocolo-falabr';
import * as relato from './relato';
import * as respostaOficial from './resposta-oficial';
import * as router from './router';
import * as texto from './texto';
import * as verificacao from './verificacao';

const MODULOS = {
  apoio,
  blocos,
  coOwner,
  comandosDoSite,
  handlers,
  minhasPautas,
  novaPauta,
  proposta,
  protocoloFalabr,
  relato,
  respostaOficial,
  router,
  texto,
  verificacao,
};

/** Número de telefone como identidade, ou o canal amarrado ao WhatsApp. */
const SO_DO_WHATSAPP =
  /\b(?:d?este|d?esse|seu|outro) número\b|número (?:de WhatsApp|antigo)|pelo WhatsApp/i;

const textos = Object.entries(MODULOS).flatMap(([modulo, exportados]) =>
  Object.entries(exportados as Record<string, unknown>)
    .filter((par): par is [string, string] => typeof par[1] === 'string')
    .map(([nome, valor]) => [`${modulo}.${nome}`, valor] as const),
);

describe('textos do bot valem para qualquer canal (SCRUM-323)', () => {
  it('há textos para conferir', () => {
    expect(textos.length).toBeGreaterThan(50);
  });

  it.each(textos)('%s não trata o telefone como identidade', (_nome, valor) => {
    expect(valor).not.toMatch(SO_DO_WHATSAPP);
  });
});

describe('mensagem de bloqueio da verificação (SCRUM-323)', () => {
  const liberaEm = new Date('2026-11-18T15:00:00Z');
  it.each(['envios', 'erros'] as const)('motivo %s não fala em número', (motivo) => {
    expect(verificacao.blockedText({ motivo, liberaEm })).not.toMatch(SO_DO_WHATSAPP);
  });
});
