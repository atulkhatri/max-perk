import { describe, expect, it } from 'vitest';
import { mergeWallets, parseSpendProfile, resolveSpendProfile } from './repository';

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

describe('parseSpendProfile', () => {
  it('keeps finite non-negative amounts for known categories', () => {
    expect(parseSpendProfile({ grocery: 600, dining: 'x', gas: -5, travel: NaN, bogus: 10 })).toEqual({
      grocery: 600,
    });
  });

  it('returns undefined for missing or empty input', () => {
    expect(parseSpendProfile(undefined)).toBeUndefined();
    expect(parseSpendProfile(null)).toBeUndefined();
    expect(parseSpendProfile({})).toBeUndefined();
  });
});

describe('resolveSpendProfile', () => {
  const guest = { grocery: 100 };
  it('keeps the permanent profile when set, else adopts the guest one', () => {
    expect(resolveSpendProfile({ grocery: 900 }, guest)).toEqual({ grocery: 900 });
    expect(resolveSpendProfile(undefined, guest)).toEqual(guest);
    expect(resolveSpendProfile(undefined, undefined)).toBeUndefined();
  });
});
