import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import {
  EmailAuthProvider,
  GoogleAuthProvider,
  createUserWithEmailAndPassword,
  getIdToken,
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

/**
 * Credentials the server no longer honors: the emulator was reset, the
 * account was deleted elsewhere, or the session was revoked. The stored
 * token is useless — callers should drop it (sign out) and let the user
 * start over instead of surfacing a raw Firebase message.
 */
export function isStaleCredentialError(error: unknown): boolean {
  const code = (error as { code?: string } | null)?.code;
  return (
    code === 'auth/invalid-refresh-token' ||
    code === 'auth/user-token-expired' ||
    code === 'auth/user-disabled' ||
    code === 'auth/user-not-found'
  );
}

/**
 * The guest session died server-side after the tab loaded (emulator reset,
 * revoked session): linking with its token fails with a token error, and the
 * guest wallet is unreachable. Drop the dead session and finish as a plain
 * sign-up-or-sign-in instead of stranding the user.
 */
async function recoverDeadGuestLink(
  signUp: () => Promise<unknown>,
  signIn: () => Promise<unknown>,
): Promise<UpgradeOutcome> {
  await signOut(auth);
  try {
    await signUp();
  } catch (signUpErr) {
    if ((signUpErr as { code?: string } | null)?.code !== 'auth/email-already-in-use') throw signUpErr;
    await signIn();
  }
  return { mode: 'kept' };
}

/**
 * Form-facing subset: only a dead token means "session expired". A wrong
 * email is just a failed sign-in (also safer: no account-existence signal).
 */
export function isExpiredSessionError(error: unknown): boolean {
  const code = (error as { code?: string } | null)?.code;
  return code === 'auth/invalid-refresh-token' || code === 'auth/user-token-expired';
}

/**
 * Firebase reports a disabled anonymous provider as auth/operation-not-allowed
 * through some SDK paths and auth/admin-restricted-operation through others
 * (ADMIN_ONLY_OPERATION from the REST backend).
 */
export function isGuestDisabledError(error: unknown): boolean {
  const code = (error as { code?: string } | null)?.code;
  return code === 'auth/operation-not-allowed' || code === 'auth/admin-restricted-operation';
}

function errorMessage(error: unknown): string {
  const code = (error as { code?: string } | null)?.code;
  if (code === 'auth/popup-blocked') return strings.auth.errors.popupBlocked;
  if (isExpiredSessionError(error)) return strings.auth.errors.sessionExpired;
  if (isGuestDisabledError(error)) return strings.auth.errors.anonDisabled;
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

  const signInAnonymouslyOnce = useCallback(async (): Promise<void> => {
    if (auth.currentUser) {
      // A previous guest failure must not haunt later sessions: a signed-in
      // user means entry worked, so any stale error is obsolete.
      setGuestError(null);
      return;
    }
    if (!anonAttempt.current) {
      // Clear the previous failure up front so a retry never shows a stale
      // "Something went wrong" while the new attempt is still in flight.
      setGuestError(null);
      anonAttempt.current = signInAnonymously(auth).then(
        () => {
          setGuestError(null);
        },
        (err: unknown) => {
          setGuestError(
            isGuestDisabledError(err) ? strings.auth.errors.anonDisabled : errorMessage(err),
          );
          anonAttempt.current = null;
        },
      );
    }
    return anonAttempt.current;
  }, []);

  // Drop a dead session and start a fresh guest one. The cached attempt must
  // reset first: AuthGate only fires one guest sign-in per mount and would
  // otherwise never retry, stranding the app on "Loading…".
  const recoverToGuest = useCallback(async (): Promise<void> => {
    anonAttempt.current = null;
    setGuestError(null);
    await signOut(auth).catch(() => {});
    setUser(null);
    setLoading(false);
    await signInAnonymouslyOnce().catch(() => {
      // Guest entry reports its own failure via guestError; nothing to add.
    });
  }, [signInAnonymouslyOnce]);

  // Session validation: the SDK restores persisted users lazily and never
  // reports a dead server-side session on its own, so validate every user
  // object the observer delivers (initial restore included) with one forced
  // refresh. A stale token fails over to a fresh guest instead of haunting
  // every later sign-in/upgrade with token errors.
  const checkedUid = useRef<string | null>(null);
  useEffect(
    () =>
      onAuthStateChanged(
        auth,
        (u) => {
          setUser(u);
          setLoading(false);
          if (u && checkedUid.current !== u.uid) {
            checkedUid.current = u.uid;
            void getIdToken(u, true).catch((err: unknown) => {
              if (isStaleCredentialError(err)) void recoverToGuest();
            });
          }
        },
        (err) => {
          if (isStaleCredentialError(err)) void recoverToGuest();
          else setLoading(false);
        },
      ),
    [recoverToGuest],
  );

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
        if (isExpiredSessionError(err)) {
          return recoverDeadGuestLink(
            () => signUpEmail(email, password),
            () => signInWithEmailAndPassword(auth, email, password),
          );
        }
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
      if (isExpiredSessionError(err)) {
        await signOut(auth);
        await signInWithPopup(auth, provider);
        return { mode: 'kept' };
      }
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
    // The spent attempt must not be reused: the next guest entry has to mint
    // a fresh anonymous session instead of stranding the app on "Loading…".
    // The old error must not be reused either: it would block that guest
    // re-entry and pin a stale "Something went wrong" on the login form.
    anonAttempt.current = null;
    setGuestError(null);
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
