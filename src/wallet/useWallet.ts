import { useEffect, useMemo, useRef, useState } from 'react';
import type { Unsubscribe } from 'firebase/firestore';
import { useAuth } from '../auth/AuthContext';
import type { EarnCategory } from '../data/types';
import { db } from '../firebase';
import { FirestoreWalletRepository, type WalletSnapshot } from './repository';

// Last live snapshot per user: pages that mount later (every tab visit)
// render instantly from the cache while the fresh subscription catches up,
// instead of flashing "Loading…" on each navigation.
const snapshotCache = new Map<string, WalletSnapshot>();

// If Firestore never answers (offline, throttled, denied), render what we
// have — cached or empty — instead of sticking on "Loading…" forever.
const LOAD_TIMEOUT_MS = 8000;

export function useWallet(): WalletSnapshot & {
  loading: boolean;
  addCard: (cardId: string) => Promise<void>;
  removeCard: (cardId: string) => Promise<void>;
  toggleLoyaltyUsed: (loyaltyId: string) => Promise<void>;
  setSpendProfile: (profile: Partial<Record<EarnCategory, number>> | undefined) => Promise<void>;
} {
  const { user } = useAuth();
  const repo = useMemo(() => new FirestoreWalletRepository(db), []);
  const [snapshot, setSnapshot] = useState<WalletSnapshot>(() => ({
    cardIds: [],
    loyaltyUsed: [],
  }));
  const [loading, setLoading] = useState(true);
  // Double-taps share one in-flight write instead of racing last-writer-wins.
  const loyaltyPending = useRef<Promise<void> | null>(null);

  useEffect(() => {
    if (!user) {
      setSnapshot({ cardIds: [], loyaltyUsed: [] });
      setLoading(false);
      return;
    }
    const cached = snapshotCache.get(user.uid);
    if (cached) {
      setSnapshot(cached);
      setLoading(false);
    } else {
      setLoading(true);
    }
    let unsub: Unsubscribe | undefined;
    let cancelled = false;
    const timer = setTimeout(() => {
      if (!cancelled) setLoading(false);
    }, LOAD_TIMEOUT_MS);
    void repo
      .subscribe(user.uid, (next) => {
        if (cancelled) return;
        clearTimeout(timer);
        snapshotCache.set(user.uid, next);
        setSnapshot(next);
        setLoading(false);
      })
      .then((u) => {
        if (cancelled) u();
        else unsub = u;
      })
      .catch(() => {
        if (cancelled) return;
        clearTimeout(timer);
        setSnapshot(cached ?? { cardIds: [], loyaltyUsed: [] });
        setLoading(false);
      });
    return () => {
      cancelled = true;
      clearTimeout(timer);
      unsub?.();
    };
  }, [repo, user]);

  return {
    ...snapshot,
    loading,
    addCard: (cardId) => {
      if (!user) return Promise.reject(new Error('Not signed in'));
      return repo.addCard(user.uid, cardId);
    },
    removeCard: (cardId) => {
      if (!user) return Promise.reject(new Error('Not signed in'));
      return repo.removeCard(user.uid, cardId);
    },
    toggleLoyaltyUsed: (loyaltyId) => {
      if (!user) return Promise.reject(new Error('Not signed in'));
      if (loyaltyPending.current) return loyaltyPending.current;
      const next = snapshot.loyaltyUsed.includes(loyaltyId)
        ? snapshot.loyaltyUsed.filter((id) => id !== loyaltyId)
        : [...snapshot.loyaltyUsed, loyaltyId];
      loyaltyPending.current = repo.setLoyaltyUsed(user.uid, next).finally(() => {
        loyaltyPending.current = null;
      });
      return loyaltyPending.current;
    },
    setSpendProfile: (profile) => {
      if (!user) return Promise.reject(new Error('Not signed in'));
      return repo.setSpendProfile(user.uid, profile);
    },
  };
}
