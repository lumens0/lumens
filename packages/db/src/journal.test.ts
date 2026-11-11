import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const PASTA = fileURLToPath(new URL('../migrations', import.meta.url));

interface Entrada {
  idx: number;
  when: number;
  tag: string;
}

const { entries } = JSON.parse(readFileSync(`${PASTA}/meta/_journal.json`, 'utf8')) as {
  entries: Entrada[];
};

// Não precisa de banco: confere o que faz o `migrate` do Drizzle pular uma migração num banco que
// já foi migrado antes. Ele escolhe as pendentes pelo `when`, não pelo `idx`: uma migração nova com
// `when` menor que o da última aplicada é ignorada em silêncio no upgrade, e só aparece na
// instalação do zero — que é o que os outros testes fazem.
describe('journal das migrações', () => {
  it('idx em sequência, sem buraco nem repetição', () => {
    expect(entries.map((e) => e.idx)).toEqual(entries.map((_, i) => i));
  });

  it('cada "when" é maior que o da migração anterior', () => {
    const fora = entries.filter((e, i) => i > 0 && e.when <= (entries[i - 1]?.when ?? 0));
    expect(fora.map((e) => e.tag)).toEqual([]);
  });

  it('cada entrada tem o seu arquivo SQL', () => {
    expect(entries.filter((e) => !existsSync(`${PASTA}/${e.tag}.sql`)).map((e) => e.tag)).toEqual(
      [],
    );
  });
});
