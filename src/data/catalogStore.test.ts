import { describe, expect, it } from 'vitest';
import { assembleCatalog, buildCatalogMaps, parseMeta } from './catalogStore';
import { catalog as bundled } from './seeds/catalog';

describe('assembleCatalog', () => {
  it('accepts the bundled payload shape', () => {
    expect(assembleCatalog({ ...bundled })).toEqual(bundled);
  });

  it('rejects an empty card list', () => {
    expect(() => assembleCatalog({ ...bundled, cards: [] })).toThrow(/no cards/);
  });

  it('rejects a broken cross-reference', () => {
    const cards = [{ ...bundled.cards[0], programId: 'nope' }];
    expect(() => assembleCatalog({ ...bundled, cards })).toThrow(/unknown program/);
  });

  it('rejects a missing dataAsOf', () => {
    expect(() => assembleCatalog({ ...bundled, dataAsOf: undefined })).toThrow(/dataAsOf/);
  });
});

describe('parseMeta', () => {
  it('parses a sync-script meta doc', () => {
    const meta = parseMeta({
      dataAsOf: '2026-10-31',
      updatedAt: '2026-10-31T00:00:00.000Z',
      source: 'issuer-direct',
      snapshotRef: 'data/snapshots/2026-10-31',
      version: 1,
      cardCount: 12,
    });
    expect(meta).toEqual({
      dataAsOf: '2026-10-31',
      updatedAt: '2026-10-31T00:00:00.000Z',
      source: 'issuer-direct',
      snapshotRef: 'data/snapshots/2026-10-31',
    });
  });

  it('rejects a missing meta doc', () => {
    expect(() => parseMeta(undefined)).toThrow(/missing meta/);
  });
});

describe('buildCatalogMaps', () => {
  it('indexes every collection by id', () => {
    const maps = buildCatalogMaps(bundled);
    expect(maps.cardsById.get('amex-cobalt')?.name).toBe('American Express Cobalt');
    expect(maps.programsById.get('amex-mr')?.typicalCpp).toBe(2.0);
    expect(maps.merchantsById.get('loblaws')?.earn).toBe('grocery');
    expect(maps.loyaltyById.get('pc-optimum')?.operator).toBe('Loblaw Companies');
  });
});
