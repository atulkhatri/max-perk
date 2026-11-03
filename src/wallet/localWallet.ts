// Signed-out wallet: the app stays fully usable with no Firebase user.
// Cards, loyalty flags and the spend profile persist in localStorage under
// one versioned key. When a user later signs in (guest or permanent),
// useWallet merges this snapshot into Firestore once, then clears it.

import { parseSpendProfile, type WalletSnapshot } from './repository';

export const LOCAL_WALLET_KEY = 'card-offers.local-wallet.v1';

export interface LocalWalletStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

function defaultStore(): LocalWalletStore | null {
  try {
    if (typeof localStorage !== 'undefined') return localStorage;
  } catch {
    // Private mode / non-DOM runtimes: no persistence available.
  }
  return null;
}

const EMPTY: WalletSnapshot = { cardIds: [], loyaltyUsed: [] };

function sanitize(raw: unknown): WalletSnapshot {
  if (!raw || typeof raw !== 'object') return { ...EMPTY };
  const record = raw as Record<string, unknown>;
  const cardIds = Array.isArray(record['cardIds'])
    ? record['cardIds'].filter((id): id is string => typeof id === 'string')
    : [];
  const loyaltyUsed = Array.isArray(record['loyaltyUsed'])
    ? record['loyaltyUsed'].filter((id): id is string => typeof id === 'string')
    : [];
  const spendProfile = parseSpendProfile(record['spendProfile']);
  return spendProfile ? { cardIds, loyaltyUsed, spendProfile } : { cardIds, loyaltyUsed };
}

export function loadLocalWallet(store: LocalWalletStore | null = defaultStore()): WalletSnapshot {
  if (!store) return { ...EMPTY };
  try {
    const raw = store.getItem(LOCAL_WALLET_KEY);
    if (!raw) return { ...EMPTY };
    return sanitize(JSON.parse(raw));
  } catch {
    return { ...EMPTY };
  }
}

export function saveLocalWallet(
  snapshot: WalletSnapshot,
  store: LocalWalletStore | null = defaultStore(),
): void {
  if (!store) return;
  try {
    store.setItem(LOCAL_WALLET_KEY, JSON.stringify(snapshot));
  } catch {
    // Storage full or unavailable: the in-memory snapshot still works.
  }
}

export function clearLocalWallet(store: LocalWalletStore | null = defaultStore()): void {
  if (!store) return;
  try {
    store.removeItem(LOCAL_WALLET_KEY);
  } catch {
    // Best effort.
  }
}

export function isEmptySnapshot(snapshot: WalletSnapshot): boolean {
  return snapshot.cardIds.length === 0 && snapshot.loyaltyUsed.length === 0 && !snapshot.spendProfile;
}
