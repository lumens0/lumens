import { describe, expect, it } from 'vitest';
import {
  diaEMes,
  diasAte,
  formatarDia,
  hojeEmMaceio,
  prazoVencido,
  textoDiasAte,
  textoDoPrazo,
  textoQuando,
} from './prazos';

// 18/11/2026, meio-dia em Maceió (UTC-3).
const HOJE = new Date('2026-11-18T15:00:00.000Z');

describe('hojeEmMaceio', () => {
  it('usa o dia de Maceió, não o de UTC', () => {
    // 01:00 UTC ainda é o dia anterior em Maceió.
    expect(hojeEmMaceio(new Date('2026-11-19T01:00:00.000Z'))).toBe('2026-11-18');
    expect(hojeEmMaceio(new Date('2026-11-19T03:00:00.000Z'))).toBe('2026-11-19');
  });
});

describe('formatarDia', () => {
  it('passa AAAA-MM-DD para DD/MM/AAAA sem mudar o dia', () => {
    expect(formatarDia('2026-03-01')).toBe('01/03/2026');
  });
});

describe('prazoVencido', () => {
  it('o próprio dia do prazo ainda conta como em dia', () => {
    expect(prazoVencido('2026-11-18', HOJE)).toBe(false);
    expect(prazoVencido('2026-11-17', HOJE)).toBe(true);
  });

  it('o que não é data civil nunca vence', () => {
    expect(prazoVencido('em breve', HOJE)).toBe(false);
    expect(prazoVencido('2026-11-17T10:00:00Z', HOJE)).toBe(false);
  });
});

describe('textoDoPrazo', () => {
  it('em dia, só a data; vencido, "venceu em" com o ano', () => {
    expect(textoDoPrazo('2026-12-01', HOJE)).toBe('01/12/2026');
    expect(textoDoPrazo('2026-03-01', HOJE)).toBe('venceu em 01/03/2026');
  });

  it('o terceiro argumento força o texto de vencido', () => {
    expect(textoDoPrazo('2026-12-01', HOJE, true)).toBe('venceu em 01/12/2026');
  });
});

describe('diasAte', () => {
  it('conta dias de calendário: futuro positivo, hoje zero, passado negativo', () => {
    expect(diasAte('2026-11-23', HOJE)).toBe(5);
    expect(diasAte('2026-11-18', HOJE)).toBe(0);
    expect(diasAte('2026-11-09', HOJE)).toBe(-9);
  });

  it('data inexistente ou fora do formato dá null', () => {
    expect(diasAte('2026-13-45', HOJE)).toBeNull();
    expect(diasAte('18/11/2026', HOJE)).toBeNull();
    expect(diasAte('', HOJE)).toBeNull();
  });

  it('atravessa a virada do ano', () => {
    expect(diasAte('2027-01-01', HOJE)).toBe(44);
  });
});

describe('textoDiasAte', () => {
  it('hoje, no singular e no plural, no futuro e no passado', () => {
    expect(textoDiasAte(0)).toBe('hoje');
    expect(textoDiasAte(1)).toBe('em 1 dia');
    expect(textoDiasAte(11)).toBe('em 11 dias');
    expect(textoDiasAte(-1)).toBe('venceu há 1 dia');
    expect(textoDiasAte(-9)).toBe('venceu há 9 dias');
  });
});

describe('diaEMes', () => {
  it('data civil vira "dia mês" curto, sem zero à esquerda', () => {
    expect(diaEMes('2026-11-25')).toBe('25 nov');
    expect(diaEMes('2026-03-01')).toBe('1 mar');
    expect(diaEMes('2026-12-15')).toBe('15 dez');
  });

  it('instante vira o dia de Maceió', () => {
    // 02:00 UTC de 26/11 ainda é 25/11 em Maceió.
    expect(diaEMes('2026-11-26T02:00:00.000Z')).toBe('25 nov');
  });

  it('valor que não é data volta como veio, sem quebrar', () => {
    expect(diaEMes('em breve')).toBe('em breve');
    expect(diaEMes('')).toBe('');
  });

  it('mês inexistente volta como veio', () => {
    expect(diaEMes('2026-13-05')).toBe('2026-13-05');
  });
});

describe('textoQuando', () => {
  it('hoje, ontem e há N dias, nos dias de Maceió', () => {
    expect(textoQuando('2026-11-18T12:00:00.000Z', HOJE)).toBe('hoje');
    expect(textoQuando('2026-11-17T12:00:00.000Z', HOJE)).toBe('ontem');
    expect(textoQuando('2026-11-08T12:00:00.000Z', HOJE)).toBe('há 10 dias');
  });

  it('o instante de madrugada em UTC conta no dia anterior de Maceió', () => {
    expect(textoQuando('2026-11-18T01:00:00.000Z', HOJE)).toBe('ontem');
  });

  it('instante no futuro vira "em N dias"', () => {
    expect(textoQuando('2026-11-20T12:00:00.000Z', HOJE)).toBe('em 2 dias');
  });
});
