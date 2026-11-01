import { initializeApp } from 'firebase/app';
import { connectAuthEmulator, getAuth } from 'firebase/auth';
import type { Firestore } from 'firebase/firestore';
import { config } from './config';

export const app = initializeApp(config.firebase);
export const auth = getAuth(app);
export const usingEmulators = config.useEmulators;

// connect*Emulator throws if called twice (React StrictMode / HMR), so guard.
const FLAG = '__card_offers_emulators_connected';
if (config.useEmulators && !(globalThis as Record<string, unknown>)[FLAG]) {
  (globalThis as Record<string, unknown>)[FLAG] = true;
  connectAuthEmulator(auth, config.authEmulatorHost, { disableWarnings: true });
}

const DB_FLAG = '__card_offers_firestore_emulator_connected';
let dbPromise: Promise<Firestore> | null = null;
export const db = getDb();

/**
 * Firestore, loaded lazily so the ~4 MB SDK never blocks first paint.
 * Auth stays eager (the shell needs it); wallet/catalog await this instead.
 */
export function getDb(): Promise<Firestore> {
  if (!dbPromise) {
    dbPromise = (async () => {
      const { connectFirestoreEmulator, getFirestore } = await import('firebase/firestore');
      const firestore = getFirestore(app);
      if (config.useEmulators && !(globalThis as Record<string, unknown>)[DB_FLAG]) {
        (globalThis as Record<string, unknown>)[DB_FLAG] = true;
        connectFirestoreEmulator(firestore, config.firestoreEmulatorHost, config.firestoreEmulatorPort);
      }
      return firestore;
    })();
  }
  return dbPromise;
}
