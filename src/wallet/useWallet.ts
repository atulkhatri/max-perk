import { useEffect, useMemo, useRef, useState } from 'react';
import type { Unsubscribe } from 'firebase/firestore';
import { useAuth } from '../auth/AuthContext';
import type { EarnCategory } from '../data/types';
import { db } from '../firebase';
import { strings } from '../strings';
import { FirestoreWalletRepository, type WalletSnapshot } from './repository';
import { clearLocalWalletIfMatches, isEmptySnapshot, loadLocalWallet, saveLocalWallet } from './localWallet';

// Last live snapshot per user: pages that mount later (every tab visit)
// render instantly from the cache while the fresh subscription catches up,
// instead of flashing "Loading…" on each navigation.
const snapshotCache = new Map<string, WalletSnapshot>();

// If Firestore never answers (offline, throttled, denied), render what we
// have — cached or empty — instead of sticking on "Loading…" forever.
const LOAD_TIMEOUT_MS = 8000;

export function useWallet(): WalletSnapshot & {
  loading: boolean;
  /** Set when the live wallet read fails; snapshot then holds the last good data. */
  error: string | null;
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
  const [error, setError] = useState<string | null>(null);
  // Double-taps share one in-flight write instead of racing last-writer-wins.
  const loyaltyPending = useRef<Promise<void> | null>(null);
  // Signed-out wallet lives in localStorage so the app works with no account.
  const [localSnap, setLocalSnap] = useState<WalletSnapshot>(() => loadLocalWallet());
  // Uids that already absorbed the signed-out wallet (one merge per account).
  const mergedUids = useRef<Set<string>>(new Set());

  const mutateLocal = (next: WalletSnapshot): void => {
    setLocalSnap(next);
    saveLocalWallet(next);
  };

  useEffect(() => {
    if (!user) {
      setSnapshot({ cardIds: [], loyaltyUsed: [] });
      setLoading(false);
      return;
    }
    // First sight of this account: fold any signed-out wallet into it so
    // cards added while logged out survive the sign-in instead of vanishing.
    // Mark merged only after the merge commits, so a transient failure is
    // retried on the next mount/account sighting instead of being lost.
    if (!mergedUids.current.has(user.uid)) {
      const pending = loadLocalWallet();
      if (isEmptySnapshot(pending)) {
        mergedUids.current.add(user.uid);
      } else {
        void repo
          .mergeSnapshot(user.uid, pending)
          .then(() => {
            mergedUids.current.add(user.uid);
            // Clear by value: only the snapshot that was merged, never
            // edits made while the merge was in flight.
            clearLocalWalletIfMatches(pending);
          })
          .catch(() => {
            // Offline or denied: keep the local copy; a later mount retries.
          });
      }
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
      .subscribe(
        user.uid,
        (next) => {
          if (cancelled) return;
          clearTimeout(timer);
          setError(null);
          snapshotCache.set(user.uid, next);
          setSnapshot(next);
          setLoading(false);
        },
        () => {
          if (cancelled) return;
          clearTimeout(timer);
          // Keep the last good (cached) snapshot; never cache emptiness.
          setSnapshot(snapshotCache.get(user.uid) ?? cached ?? { cardIds: [], loyaltyUsed: [] });
          setError(strings.wallet.loadError);
          setLoading(false);
        },
      )
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

  // Signed-out mode: fully local, no account needed.
  if (!user) {
    return {
      ...localSnap,
      loading: false,
      error: null,
      addCard: (cardId) => {
        if (!localSnap.cardIds.includes(cardId)) {
          mutateLocal({ ...localSnap, cardIds: [...localSnap.cardIds, cardId] });
        }
        return Promise.resolve();
      },
      removeCard: (cardId) => {
        mutateLocal({ ...localSnap, cardIds: localSnap.cardIds.filter((id) => id !== cardId) });
        return Promise.resolve();
      },
      toggleLoyaltyUsed: (loyaltyId) => {
        if (loyaltyPending.current) return loyaltyPending.current;
        const next = localSnap.loyaltyUsed.includes(loyaltyId)
          ? localSnap.loyaltyUsed.filter((id) => id !== loyaltyId)
          : [...localSnap.loyaltyUsed, loyaltyId];
        mutateLocal({ ...localSnap, loyaltyUsed: next });
        loyaltyPending.current = Promise.resolve().finally(() => {
          loyaltyPending.current = null;
        });
        return loyaltyPending.current;
      },
      setSpendProfile: (profile) => {
        const next: WalletSnapshot =
          profile === undefined
            ? { cardIds: [...localSnap.cardIds], loyaltyUsed: [...localSnap.loyaltyUsed] }
            : { ...localSnap, spendProfile: profile };
        mutateLocal(next);
        return Promise.resolve();
      },
    };
  }

  return {
    ...snapshot,
    loading,
    error,
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
