// Sync-script checks (no network): integrity mirror + real-JSON gate.
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { checkCatalogJson } from './sync-catalog-to-firestore.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const real = JSON.parse(readFileSync(join(ROOT, 'src', 'data', 'seeds', 'sample-catalog.json'), 'utf8'));

describe('checkCatalogJson', () => {
  it('accepts the real curated catalog', () => {
    expect(checkCatalogJson(real)).toEqual([]);
  });

  it('rejects a missing top-level key', () => {
    const { cards, ...rest } = real;
    expect(checkCatalogJson(rest).some((e) => e.includes('cards'))).toBe(true);
  });

  it('rejects an unknown program reference', () => {
    const broken = { ...real, cards: [{ ...real.cards[0], programId: 'nope' }] };
    expect(checkCatalogJson(broken).some((e) => e.includes('unknown program'))).toBe(true);
  });

  it('rejects an unknown merchant reference', () => {
    const broken = { ...real, cards: [{ ...real.cards[0], merchantRates: { nope: 5 } }] };
    expect(checkCatalogJson(broken).some((e) => e.includes('unknown merchantRate'))).toBe(true);
  });
});
