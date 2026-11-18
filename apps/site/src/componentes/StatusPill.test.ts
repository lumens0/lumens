import { describe, expect, it } from 'vitest';
import { STATUS } from './StatusPill';

describe('cores de status', () => {
  it('usa uma cor distinta por etapa e não usa os âmbares da marca', () => {
    const cores = Object.values(STATUS).map(({ ponto }) => ponto.toLowerCase());
    expect(new Set(cores).size).toBe(cores.length);
    expect(cores).not.toContain('#ffc23d');
    expect(cores).not.toContain('#ffa41b');
  });
});
