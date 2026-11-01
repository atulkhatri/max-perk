import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import {
  EmailAuthProvider,
  GoogleAuthProvider,
  createUserWithEmailAndPassword,
  linkWithCredential,
  linkWithPopup,
  onAuthStateChanged,
  sendPasswordResetEmail,
  signInAnonymously,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  type User,
} from 'firebase/auth';
import { auth, db } from '../firebase';
import { strings } from '../strings';
import { FirestoreWalletRepository } from '../wallet/repository';
import type { WalletRepository, WalletSnapshot } from '../wallet/repository';

export type UpgradeOutcome = { mode: 'kept' } | { mode: 'merged'; addedCards: number; addedLoyalty: number };

interface AuthContextValue {
  user: User | null;
  loading: boolean;
  /** True while signed in anonymously (guest session, browser-local). */
  isGuest: boolean;
  /** Set when automatic guest sign-in fails (e.g. provider disabled). */
  guestError: string | null;
  signInEmail: (email: string, password: string) => Promise<void>;
  signUpEmail: (email: string, password: string) => Promise<void>;
  signInGoogle: () => Promise<void>;
  signInAnonymouslyOnce: () => Promise<void>;
  /** Email a password-reset link. Never rejects for unknown emails. */
  sendPasswordReset: (email: string) => Promise<{ sent: true } | { sent: false; message: string }>;
  /** Upgrade a guest to a permanent account, merging wallets when needed. */
  linkEmail: (email: string, password: string) => Promise<UpgradeOutcome>;
  linkGoogle: () => Promise<UpgradeOutcome>;
  signOutUser: () => Promise<void>;
}

const Ctx = createContext<AuthContextValue | null>(null);

function errorMessage(error: unknown): string {
  const code = (error as { code?: string } | null)?.code;
  if (code === 'auth/popup-blocked') return strings.auth.errors.popupBlocked;
  return strings.auth.errors.generic;
}

/**
 * Map a password-reset failure to UI. Unknown emails report success so the
 * form never reveals whether an address has an account.
 */
export function resetPasswordOutcome(error: unknown): { sent: true } | { sent: false; message: string } {
  // Null means the send succeeded. Any real error object without a Firebase
  // code (network failure, etc.) is a genuine failure, not a success.
  if (error === null || error === undefined) return { sent: true };
  const code = (error as { code?: string } | null)?.code;
  if (code === 'auth/user-not-found') return { sent: true };
  if (code === 'auth/invalid-email' || code === 'auth/missing-email') {
    return { sent: false, message: strings.auth.errors.invalidEmail };
  }
  return { sent: false, message: strings.auth.errors.generic };
}

/**
 * Read the guest wallet. Callers must call this BEFORE signing into the
 * permanent account: Firestore rules only let an account read its own docs,
 * so reading the guest wallet after the identity switch is denied.
 */
export async function readGuestSnapshot(repo: WalletRepository, guestUid: string): Promise<WalletSnapshot> {
  return repo.readSnapshot(guestUid);
}

/**
 * Move an already-read guest snapshot into a permanent account. Union merge
 * keeps every card; guest cleanup afterwards is best effort, since after the
 * sign-in the new identity can no longer delete the old guest docs.
 */
export async function adoptGuestSnapshot(
  repo: WalletRepository,
  uid: string,
  guestUid: string,
  guestSnap: WalletSnapshot,
): Promise<UpgradeOutcome> {
  // Same account (e.g. a double submit): merging into itself then clearing
  // would wipe the wallet, so treat it as a no-op keep instead.
  if (uid === guestUid) return { mode: 'kept' };
  const merged = await repo.mergeSnapshot(uid, guestSnap);
  await repo.clearUser(guestUid).catch(() => {});
  if (merged.addedCards + merged.addedLoyalty === 0) return { mode: 'kept' };
  return { mode: 'merged', addedCards: merged.addedCards, addedLoyalty: merged.addedLoyalty };
}

export function AuthProvider({ children }: { children: ReactNode }): React.JSX.Element {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [guestError, setGuestError] = useState<string | null>(null);
  const anonAttempt = useRef<Promise<void> | null>(null);

  useEffect(() => onAuthStateChanged(auth, (u) => {
    setUser(u);
    setLoading(false);
  }), []);

  const signInEmail = useCallback(async (email: string, password: string): Promise<void> => {
    await signInWithEmailAndPassword(auth, email, password);
  }, []);

  const signUpEmail = useCallback(async (email: string, password: string): Promise<void> => {
    await createUserWithEmailAndPassword(auth, email, password);
  }, []);

  const provider = useMemo(() => new GoogleAuthProvider(), []);

  const signInGoogle = useCallback(async (): Promise<void> => {
    await signInWithPopup(auth, provider);
  }, [provider]);

  const signInAnonymouslyOnce = useCallback(async (): Promise<void> => {
    if (auth.currentUser) return;
    if (!anonAttempt.current) {
      anonAttempt.current = signInAnonymously(auth).then(
        () => undefined,
        (err: unknown) => {
          const code = (err as { code?: string } | null)?.code;
          setGuestError(
            code === 'auth/operation-not-allowed' ? strings.auth.errors.anonDisabled : errorMessage(err),
          );
          anonAttempt.current = null;
        },
      );
    }
    return anonAttempt.current;
  }, []);

  const linkEmail = useCallback(
    async (email: string, password: string): Promise<UpgradeOutcome> => {
      const current = auth.currentUser;
      if (!current || !current.isAnonymous) {
        await signUpEmail(email, password);
        return { mode: 'kept' };
      }
      try {
        // Fresh credential: the anonymous account upgrades in place, so the
        // wallet (keyed by the same uid) carries over with no migration.
        await linkWithCredential(current, EmailAuthProvider.credential(email, password));
        return { mode: 'kept' };
      } catch (err) {
        if ((err as { code?: string } | null)?.code !== 'auth/email-already-in-use') throw err;
        // Returning user: snapshot the guest wallet first (still authed as
        // guest), then sign into the existing account and union-merge the
        // snapshot into it so nothing is lost.
        const guestUid = current.uid;
        const repo = new FirestoreWalletRepository(db);
        const guestSnap = await readGuestSnapshot(repo, guestUid);
        const cred = await signInWithEmailAndPassword(auth, email, password);
        return adoptGuestSnapshot(repo, cred.user.uid, guestUid, guestSnap);
      }
    },
    [signUpEmail],
  );

  const linkGoogle = useCallback(async (): Promise<UpgradeOutcome> => {
    const current = auth.currentUser;
    if (!current || !current.isAnonymous) {
      await signInWithPopup(auth, provider);
      return { mode: 'kept' };
    }
    try {
      await linkWithPopup(current, provider);
      return { mode: 'kept' };
    } catch (err) {
      if ((err as { code?: string } | null)?.code !== 'auth/credential-already-in-use') throw err;
      const guestUid = current.uid;
      const repo = new FirestoreWalletRepository(db);
      const guestSnap = await readGuestSnapshot(repo, guestUid);
      const cred = await signInWithPopup(auth, provider);
      return adoptGuestSnapshot(repo, cred.user.uid, guestUid, guestSnap);
    }
  }, [provider]);

  const signOutUser = useCallback(async (): Promise<void> => {
    await signOut(auth);
  }, []);

  const sendPasswordReset = useCallback(async (email: string) => {
    try {
      await sendPasswordResetEmail(auth, email);
      return resetPasswordOutcome(null);
    } catch (err) {
      return resetPasswordOutcome(err);
    }
  }, []);

  const value = useMemo(
    () => ({
      user,
      loading,
      isGuest: user?.isAnonymous ?? false,
      guestError,
      signInEmail,
      signUpEmail,
      signInGoogle,
      signInAnonymouslyOnce,
      linkEmail,
      linkGoogle,
      signOutUser,
      sendPasswordReset,
    }),
    [user, loading, guestError, signInEmail, signUpEmail, signInGoogle, signInAnonymouslyOnce, linkEmail, linkGoogle, signOutUser, sendPasswordReset],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
