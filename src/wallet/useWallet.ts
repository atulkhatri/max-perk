import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../auth/AuthContext';
import { db } from '../firebase';
import { FirestoreWalletRepository, type WalletSnapshot } from './repository';

export function useWallet(): WalletSnapshot & {
  loading: boolean;
  addCard: (cardId: string) => Promise<void>;
  removeCard: (cardId: string) => Promise<void>;
  toggleLoyaltyUsed: (loyaltyId: string) => Promise<void>;
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
    const unsub = repo.subscribe(user.uid, (next) => {
      setSnapshot(next);
      setLoading(false);
    });
    return unsub;
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
  };
}
