import { describe, expect, it } from 'vitest';
import { mergeWallets } from './repository';

describe('mergeWallets', () => {
  it('unions cards and loyalty without dropping anything', () => {
    const merged = mergeWallets(
      { cardIds: ['a', 'b'], loyaltyUsed: ['x'] },
      { cardIds: ['b', 'c'], loyaltyUsed: ['x', 'y'] },
    );
    expect(merged).toEqual({ cardIds: ['a', 'b', 'c'], loyaltyUsed: ['x', 'y'] });
  });

  it('is idempotent and handles empty sides', () => {
    const snap = { cardIds: ['a'], loyaltyUsed: [] as string[] };
    expect(mergeWallets(snap, snap)).toEqual(snap);
    expect(mergeWallets({ cardIds: [], loyaltyUsed: [] }, snap)).toEqual(snap);
    expect(mergeWallets(snap, { cardIds: [], loyaltyUsed: [] })).toEqual(snap);
  });
});
