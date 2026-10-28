// Wallet persistence behind a small interface so the Firestore mapping is
// isolated in one module. Layout:
//   users/{uid}            { loyaltyUsed: string[] }
//   users/{uid}/wallet/{cardId}  { addedAt }

import {
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  serverTimestamp,
  setDoc,
  type Firestore,
  type Unsubscribe,
} from 'firebase/firestore';

export interface WalletSnapshot {
  cardIds: string[];
  loyaltyUsed: string[];
}

export interface WalletRepository {
  subscribe(uid: string, onChange: (snapshot: WalletSnapshot) => void): Unsubscribe;
  addCard(uid: string, cardId: string): Promise<void>;
  removeCard(uid: string, cardId: string): Promise<void>;
  setLoyaltyUsed(uid: string, loyaltyIds: string[]): Promise<void>;
}

export class FirestoreWalletRepository implements WalletRepository {
  private readonly db: Firestore;

  constructor(db: Firestore) {
    this.db = db;
  }

  subscribe(uid: string, onChange: (snapshot: WalletSnapshot) => void): Unsubscribe {
    let cardIds: string[] = [];
    let loyaltyUsed: string[] = [];
    const emit = (): void => onChange({ cardIds: [...cardIds], loyaltyUsed: [...loyaltyUsed] });

    const userRef = doc(this.db, 'users', uid);
    const unsubUser = onSnapshot(userRef, (snap) => {
      const data = snap.data() as { loyaltyUsed?: string[] } | undefined;
      loyaltyUsed = Array.isArray(data?.loyaltyUsed) ? data.loyaltyUsed : [];
      emit();
    });
    const unsubWallet = onSnapshot(collection(this.db, 'users', uid, 'wallet'), (snap) => {
      cardIds = snap.docs.map((d) => d.id);
      emit();
    });
    return () => {
      unsubUser();
      unsubWallet();
    };
  }

  async addCard(uid: string, cardId: string): Promise<void> {
    await setDoc(doc(this.db, 'users', uid, 'wallet', cardId), { addedAt: serverTimestamp() });
  }

  async removeCard(uid: string, cardId: string): Promise<void> {
    await deleteDoc(doc(this.db, 'users', uid, 'wallet', cardId));
  }

  async setLoyaltyUsed(uid: string, loyaltyIds: string[]): Promise<void> {
    await setDoc(doc(this.db, 'users', uid), { loyaltyUsed: loyaltyIds }, { merge: true });
  }
}
