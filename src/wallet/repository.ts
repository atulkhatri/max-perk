// Wallet persistence behind a small interface so the Firestore mapping is
// isolated in one module. Layout:
//   users/{uid}            { loyaltyUsed: string[] }
//   users/{uid}/wallet/{cardId}  { addedAt }
//
// Firestore itself is imported dynamically (see fx()) so the SDK loads only
// when the wallet is actually used, never as part of first paint.

import type { Firestore, Unsubscribe } from 'firebase/firestore';

export interface WalletSnapshot {
  cardIds: string[];
  loyaltyUsed: string[];
}

export interface WalletRepository {
  subscribe(uid: string, onChange: (snapshot: WalletSnapshot) => void): Promise<Unsubscribe>;
  addCard(uid: string, cardId: string): Promise<void>;
  removeCard(uid: string, cardId: string): Promise<void>;
  setLoyaltyUsed(uid: string, loyaltyIds: string[]): Promise<void>;
}

let fxCache: Promise<typeof import('firebase/firestore')> | null = null;

function fx(): Promise<typeof import('firebase/firestore')> {
  if (!fxCache) fxCache = import('firebase/firestore');
  return fxCache;
}

export class FirestoreWalletRepository implements WalletRepository {
  private readonly db: Promise<Firestore>;

  constructor(db: Promise<Firestore>) {
    this.db = db;
  }

  async subscribe(uid: string, onChange: (snapshot: WalletSnapshot) => void): Promise<Unsubscribe> {
    const [{ collection, doc, onSnapshot }, firestore] = await Promise.all([fx(), this.db]);
    let cardIds: string[] = [];
    let loyaltyUsed: string[] = [];
    let gotUser = false;
    let gotWallet = false;
    // Emit only once both reads have answered so the UI never flashes (or
    // sticks on) an empty wallet from a single partial snapshot.
    const emit = (): void => {
      if (gotUser && gotWallet) onChange({ cardIds: [...cardIds], loyaltyUsed: [...loyaltyUsed] });
    };

    const userRef = doc(firestore, 'users', uid);
    const unsubUser = onSnapshot(
      userRef,
      (snap) => {
        const data = snap.data() as { loyaltyUsed?: string[] } | undefined;
        loyaltyUsed = Array.isArray(data?.loyaltyUsed) ? data.loyaltyUsed : [];
        gotUser = true;
        emit();
      },
      () => {
        gotUser = true;
        emit();
      },
    );
    const unsubWallet = onSnapshot(
      collection(firestore, 'users', uid, 'wallet'),
      (snap) => {
        cardIds = snap.docs.map((d) => d.id);
        gotWallet = true;
        emit();
      },
      () => {
        gotWallet = true;
        emit();
      },
    );
    return () => {
      unsubUser();
      unsubWallet();
    };
  }

  async addCard(uid: string, cardId: string): Promise<void> {
    const [{ doc, serverTimestamp, setDoc }, firestore] = await Promise.all([fx(), this.db]);
    await setDoc(doc(firestore, 'users', uid, 'wallet', cardId), { addedAt: serverTimestamp() });
  }

  async removeCard(uid: string, cardId: string): Promise<void> {
    const [{ deleteDoc, doc }, firestore] = await Promise.all([fx(), this.db]);
    await deleteDoc(doc(firestore, 'users', uid, 'wallet', cardId));
  }

  async setLoyaltyUsed(uid: string, loyaltyIds: string[]): Promise<void> {
    const [{ doc, setDoc }, firestore] = await Promise.all([fx(), this.db]);
    await setDoc(doc(firestore, 'users', uid), { loyaltyUsed: loyaltyIds }, { merge: true });
  }
}
