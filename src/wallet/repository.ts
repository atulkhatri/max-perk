// Wallet persistence behind a small interface so the Firestore mapping is
// isolated in one module. Layout:
//   users/{uid}            { loyaltyUsed: string[] }
//   users/{uid}/wallet/{cardId}  { addedAt }
//
// Firestore itself is imported dynamically (see fx()) so the SDK loads only
// when the wallet is actually used, never as part of first paint.

import type { Firestore, Unsubscribe } from 'firebase/firestore';
import type { EarnCategory } from '../data/types';

export interface WalletSnapshot {
  cardIds: string[];
  loyaltyUsed: string[];
  /** Custom monthly spend per category; absent means catalog defaults. */
  spendProfile?: Partial<Record<EarnCategory, number>>;
}

export interface WalletRepository {
  subscribe(uid: string, onChange: (snapshot: WalletSnapshot) => void): Promise<Unsubscribe>;
  addCard(uid: string, cardId: string): Promise<void>;
  removeCard(uid: string, cardId: string): Promise<void>;
  setLoyaltyUsed(uid: string, loyaltyIds: string[]): Promise<void>;
  setSpendProfile(uid: string, profile: Partial<Record<EarnCategory, number>> | undefined): Promise<void>;
  readSnapshot(uid: string): Promise<WalletSnapshot>;
  mergeSnapshot(uid: string, guest: WalletSnapshot): Promise<{ addedCards: number; addedLoyalty: number }>;
  clearUser(uid: string): Promise<void>;
}

/** Union merge: every id kept, first-seen order, no data loss by construction. */
export function mergeWallets(into: WalletSnapshot, guest: WalletSnapshot): WalletSnapshot {
  const cardIds = [...into.cardIds];
  for (const id of guest.cardIds) {
    if (!cardIds.includes(id)) cardIds.push(id);
  }
  const loyaltyUsed = [...into.loyaltyUsed];
  for (const id of guest.loyaltyUsed) {
    if (!loyaltyUsed.includes(id)) loyaltyUsed.push(id);
  }
  return { cardIds, loyaltyUsed };
}

let fxCache: Promise<typeof import('firebase/firestore')> | null = null;

function fx(): Promise<typeof import('firebase/firestore')> {
  if (!fxCache) fxCache = import('firebase/firestore');
  return fxCache;
}

/** Categories the spend editor covers (the suggester's profile set). */
export const SPEND_PROFILE_CATEGORIES: EarnCategory[] = [
  'grocery',
  'dining',
  'gas',
  'travel',
  'recurring',
  'other',
];

/** Keep only finite, non-negative monthly amounts for known categories. */
export function parseSpendProfile(raw: unknown): Partial<Record<EarnCategory, number>> | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const record = raw as Record<string, unknown>;
  const out: Partial<Record<EarnCategory, number>> = {};
  for (const key of SPEND_PROFILE_CATEGORIES) {
    const value = record[key];
    if (typeof value === 'number' && Number.isFinite(value) && value >= 0) out[key] = value;
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

/**
 * Which spend profile survives an upgrade merge: the permanent account's own
 * when set, otherwise the guest's. Never synthesized, never blanked.
 */
export function resolveSpendProfile(
  current: Partial<Record<EarnCategory, number>> | undefined,
  guest: Partial<Record<EarnCategory, number>> | undefined,
): Partial<Record<EarnCategory, number>> | undefined {
  return current ?? guest;
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
    let spendProfile: Partial<Record<EarnCategory, number>> | undefined;
    let gotUser = false;
    let gotWallet = false;
    // Emit only once both reads have answered so the UI never flashes (or
    // sticks on) an empty wallet from a single partial snapshot.
    const emit = (): void => {
      if (gotUser && gotWallet) onChange({ cardIds: [...cardIds], loyaltyUsed: [...loyaltyUsed], spendProfile });
    };

    const userRef = doc(firestore, 'users', uid);
    const unsubUser = onSnapshot(
      userRef,
      (snap) => {
        const data = snap.data() as { loyaltyUsed?: string[]; spendProfile?: unknown } | undefined;
        loyaltyUsed = Array.isArray(data?.loyaltyUsed) ? data.loyaltyUsed : [];
        spendProfile = parseSpendProfile(data?.spendProfile);
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

  async setSpendProfile(uid: string, profile: Partial<Record<EarnCategory, number>> | undefined): Promise<void> {
    const [{ deleteField, doc, setDoc }, firestore] = await Promise.all([fx(), this.db]);
    if (profile === undefined) {
      await setDoc(doc(firestore, 'users', uid), { spendProfile: deleteField() }, { merge: true });
    } else {
      await setDoc(doc(firestore, 'users', uid), { spendProfile: profile }, { merge: true });
    }
  }

  async readSnapshot(uid: string): Promise<WalletSnapshot> {
    const [{ collection, doc, getDoc, getDocs }, firestore] = await Promise.all([fx(), this.db]);
    const userSnap = await getDoc(doc(firestore, 'users', uid));
    const userData = userSnap.data() as { loyaltyUsed?: string[]; spendProfile?: unknown } | undefined;
    const walletSnap = await getDocs(collection(firestore, 'users', uid, 'wallet'));
    return {
      cardIds: walletSnap.docs.map((d) => d.id),
      loyaltyUsed: Array.isArray(userData?.loyaltyUsed) ? userData.loyaltyUsed : [],
      spendProfile: parseSpendProfile(userData?.spendProfile),
    };
  }

  async mergeSnapshot(uid: string, guest: WalletSnapshot): Promise<{ addedCards: number; addedLoyalty: number }> {
    const [{ doc, serverTimestamp, setDoc }, firestore] = await Promise.all([fx(), this.db]);
    const current = await this.readSnapshot(uid);
    const merged = mergeWallets(current, guest);
    const addedCards = merged.cardIds.length - current.cardIds.length;
    const addedLoyalty = merged.loyaltyUsed.length - current.loyaltyUsed.length;
    const known = new Set(current.cardIds);
    await Promise.all(
      merged.cardIds
        .filter((id) => !known.has(id))
        .map((id) => setDoc(doc(firestore, 'users', uid, 'wallet', id), { addedAt: serverTimestamp() })),
    );
    if (addedLoyalty > 0) {
      await setDoc(doc(firestore, 'users', uid), { loyaltyUsed: merged.loyaltyUsed }, { merge: true });
    }
    const profile = resolveSpendProfile(current.spendProfile, guest.spendProfile);
    if (profile && !current.spendProfile) {
      await setDoc(doc(firestore, 'users', uid), { spendProfile: profile }, { merge: true });
    }
    return { addedCards, addedLoyalty };
  }

  async clearUser(uid: string): Promise<void> {
    const [{ collection, deleteDoc, doc, getDocs }, firestore] = await Promise.all([fx(), this.db]);
    const walletSnap = await getDocs(collection(firestore, 'users', uid, 'wallet'));
    await Promise.all(walletSnap.docs.map((d) => deleteDoc(d.ref)));
    await deleteDoc(doc(firestore, 'users', uid));
  }
}
