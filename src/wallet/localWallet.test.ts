import { describe, expect, it } from 'vitest';
import {
  clearLocalWallet,
  clearLocalWalletIfMatches,
  isEmptySnapshot,
  loadLocalWallet,
  saveLocalWallet,
  type LocalWalletStore,
} from './localWallet';

function memoryStore(initial?: Record<string, string>): LocalWalletStore & { data: Map<string, string> } {
  const data = new Map<string, string>(Object.entries(initial ?? {}));
  return {
    data,
    getItem: (k: string) => (data.has(k) ? data.get(k)! : null),
    setItem: (k: string, v: string) => void data.set(k, v),
    removeItem: (k: string) => void data.delete(k),
  };
}

describe('local wallet (signed-out mode)', () => {
  it('loads an empty snapshot when nothing is stored', () => {
    expect(loadLocalWallet(memoryStore())).toEqual({ cardIds: [], loyaltyUsed: [] });
  });

  it('round-trips cards, loyalty and spend profile', () => {
    const store = memoryStore();
    saveLocalWallet(
      { cardIds: ['tangerine'], loyaltyUsed: ['scene-plus'], spendProfile: { grocery: 400 } },
      store,
    );
    expect(loadLocalWallet(store)).toEqual({
      cardIds: ['tangerine'],
      loyaltyUsed: ['scene-plus'],
      spendProfile: { grocery: 400 },
    });
  });

  it('drops corrupt or invalid payloads instead of throwing', () => {
    expect(loadLocalWallet(memoryStore({ 'card-offers.local-wallet.v1': 'not-json{' }))).toEqual({
      cardIds: [],
      loyaltyUsed: [],
    });
    expect(
      loadLocalWallet(memoryStore({ 'card-offers.local-wallet.v1': JSON.stringify({ cardIds: [42] }) })),
    ).toEqual({ cardIds: [], loyaltyUsed: [] });
  });

  it('clears the stored snapshot', () => {
    const store = memoryStore();
    saveLocalWallet({ cardIds: ['tangerine'], loyaltyUsed: [] }, store);
    clearLocalWallet(store);
    expect(loadLocalWallet(store)).toEqual({ cardIds: [], loyaltyUsed: [] });
  });

  it('detects empty snapshots', () => {
    expect(isEmptySnapshot({ cardIds: [], loyaltyUsed: [] })).toBe(true);
    expect(isEmptySnapshot({ cardIds: ['tangerine'], loyaltyUsed: [] })).toBe(false);
    expect(isEmptySnapshot({ cardIds: [], loyaltyUsed: ['moi'] })).toBe(false);
  });
});

describe('clearLocalWalletIfMatches', () => {
  it('clears only the exact merged snapshot, preserving later edits', () => {
    const store = memoryStore();
    const merged = { cardIds: ['tangerine'], loyaltyUsed: [] as string[] };
    saveLocalWallet(merged, store);
    saveLocalWallet({ cardIds: ['tangerine', 'amex-cobalt'], loyaltyUsed: [] }, store);
    clearLocalWalletIfMatches(merged, store);
    expect(loadLocalWallet(store).cardIds).toEqual(['tangerine', 'amex-cobalt']);
    clearLocalWalletIfMatches({ cardIds: ['tangerine', 'amex-cobalt'], loyaltyUsed: [] }, store);
    expect(loadLocalWallet(store)).toEqual({ cardIds: [], loyaltyUsed: [] });
  });
});