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

export const functionsEmulatorHost = '127.0.0.1';
export const functionsEmulatorPort = 5001;
const FN_FLAG = '__card_offers_functions_emulator_connected';

/**
 * Functions client for ask-pick. Points at the local emulator in dev so the
 * feature is testable without deploying; production in release builds.
 */
export async function getFunctionsClient(): Promise<import('firebase/functions').Functions> {
  const { connectFunctionsEmulator, getFunctions } = await import('firebase/functions');
  const functions = getFunctions(app);
  if (config.useEmulators && !(globalThis as Record<string, unknown>)[FN_FLAG]) {
    (globalThis as Record<string, unknown>)[FN_FLAG] = true;
    connectFunctionsEmulator(functions, functionsEmulatorHost, functionsEmulatorPort);
  }
  return functions;
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
