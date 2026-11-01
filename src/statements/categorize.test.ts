import { describe, expect, it } from 'vitest';
import type { Catalog, MerchantSeed } from '../data/types';
import { categorizeTransactions } from './categorize';

const merchant: MerchantSeed = {
  id: 'test-store',
  name: 'Test Store',
  earn: 'grocery',
  context: 'general',
};

const catalog: Catalog = {
  dataAsOf: '2026-10-27',
  cards: [],
  programs: [],
  merchants: [merchant],
  loyalty: [],
  bankOffers: [],
};

describe('categorizeTransactions', () => {
  it('prefers merchant names, then keywords, then other', () => {
    const out = categorizeTransactions(catalog, [
      { date: '2026-09-05', description: 'TEST STORE #123 TORONTO', amountCAD: 10 },
      { date: '2026-09-06', description: 'STARBUCKS COFFEE', amountCAD: 5 },
      { date: '2026-09-07', description: 'RANDOM XYZ 123', amountCAD: 7 },
    ]);
    expect(out[0]).toMatchObject({ category: 'grocery', merchantId: 'test-store', matched: true });
    expect(out[1]).toMatchObject({ category: 'dining', matched: true });
    expect(out[1].merchantId).toBeUndefined();
    expect(out[2]).toMatchObject({ category: 'other', matched: false });
  });

  it('recognizes general-merchandise names as other', () => {
    const out = categorizeTransactions(catalog, [
      { date: '2026-09-05', description: 'AMAZON.CA', amountCAD: 77.91 },
    ]);
    expect(out[0]).toMatchObject({ category: 'other', matched: true });
  });
});
