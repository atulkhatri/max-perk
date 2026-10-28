import {
  createUserWithEmailAndPassword,
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithCredential,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  type User,
} from 'firebase/auth';
import { createContext, useContext, useEffect, useMemo, useState, type ReactElement, type ReactNode } from 'react';
import { config } from '../config';
import { auth } from '../firebase';

export interface AuthState {
  user: User | null;
  loading: boolean;
  signInEmail: (email: string, password: string) => Promise<void>;
  signUpEmail: (email: string, password: string) => Promise<void>;
  signInGoogle: () => Promise<void>;
  signOutUser: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }): ReactElement {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => onAuthStateChanged(auth, (u) => {
    setUser(u);
    setLoading(false);
  }), []);

  const value = useMemo<AuthState>(() => ({
    user,
    loading,
    signInEmail: async (email, password) => {
      await signInWithEmailAndPassword(auth, email.trim(), password);
    },
    signUpEmail: async (email, password) => {
      await createUserWithEmailAndPassword(auth, email.trim(), password);
    },
    signInGoogle: async () => {
      if (config.useEmulators) {
        // The Auth emulator has no real Google OAuth. It accepts a
        // JSON-encoded fake token whose claims become the test profile.
        const fakeToken = JSON.stringify({
          sub: 'google-test-user',
          email: 'google.tester@example.com',
          name: 'Google Tester',
        });
        await signInWithCredential(auth, GoogleAuthProvider.credential(fakeToken));
        return;
      }
      await signInWithPopup(auth, new GoogleAuthProvider());
    },
    signOutUser: async () => {
      await signOut(auth);
    },
  }), [user, loading]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const state = useContext(AuthContext);
  if (!state) throw new Error('useAuth must be used within AuthProvider');
  return state;
}
