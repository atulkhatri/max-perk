// Hooks-discipline guard: every hook call must precede the first early
// return, or React unmounts the page once loading flips (blank screen).
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const src = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'CheckPage.tsx'), 'utf8');

describe('CheckPage hooks discipline', () => {
  it('calls all hooks before any early return', () => {
    const body = src.slice(src.indexOf('export function CheckPage'));
    const hookIdx = [...body.matchAll(/use(State|Effect|Memo|Ref|Callback)\s*\(/g)].map((m) => m.index ?? -1);
    const earlyReturn = body.indexOf('if (loading || catalogLoading) return');
    expect(hookIdx.length).toBeGreaterThan(0);
    expect(earlyReturn).toBeGreaterThan(0);
    for (const i of hookIdx) expect(i).toBeLessThan(earlyReturn);
  });
});
