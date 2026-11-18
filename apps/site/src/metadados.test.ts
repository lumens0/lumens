import { describe, expect, it } from 'vitest';
import { metadadosDaMarca } from './metadados';

describe('metadadosDaMarca', () => {
  it('define o canonical a partir do caminho (SCRUM-380)', () => {
    expect(metadadosDaMarca({ caminho: '/mapa' }).alternates?.canonical).toBe('/mapa');
  });

  it('sem caminho (layout) não herda um canonical', () => {
    expect(metadadosDaMarca().alternates).toBeUndefined();
  });
});
