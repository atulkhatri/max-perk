import { useEffect, useMemo, useState } from 'react';
import type { Unsubscribe } from 'firebase/firestore';
import { useAuth } from '../auth/AuthContext';
import type { EarnCategory } from '../data/types';
import { db } from '../firebase';
import { FirestoreWalletRepository, type WalletSnapshot } from './repository';

export function useWallet(): WalletSnapshot & {
  loading: boolean;
  addCard: (cardId: string) => Promise<void>;
  removeCard: (cardId: string) => Promise<void>;
  toggleLoyaltyUsed: (loyaltyId: string) => Promise<void>;
  setSpendProfile: (profile: Partial<Record<EarnCategory, number>> | undefined) => Promise<void>;
} {
  const { user } = useAuth();
  const repo = useMemo(() => new FirestoreWalletRepository(db), []);
  const [snapshot, setSnapshot] = useState<WalletSnapshot>({ cardIds: [], loyaltyUsed: [] });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) {
      setSnapshot({ cardIds: [], loyaltyUsed: [] });
      setLoading(false);
      return;
    }
    setLoading(true);
    let unsub: Unsubscribe | undefined;
    let cancelled = false;
    void repo
      .subscribe(user.uid, (next) => {
        if (cancelled) return;
        setSnapshot(next);
        setLoading(false);
      })
      .then((u) => {
        if (cancelled) u();
        else unsub = u;
      })
      .catch(() => {
        if (cancelled) return;
        setSnapshot({ cardIds: [], loyaltyUsed: [] });
        setLoading(false);
      });
    return () => {
      cancelled = true;
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
      const next = snapshot.loyaltyUsed.includes(loyaltyId)
        ? snapshot.loyaltyUsed.filter((id) => id !== loyaltyId)
        : [...snapshot.loyaltyUsed, loyaltyId];
      return repo.setLoyaltyUsed(user.uid, next);
    },
    setSpendProfile: (profile) => {
      if (!user) return Promise.reject(new Error('Not signed in'));
      return repo.setSpendProfile(user.uid, profile);
    },
  };
}
