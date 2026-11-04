import { initializeApp } from 'firebase/app';
import { connectAuthEmulator, getAuth } from 'firebase/auth';
import type { Firestore } from 'firebase/firestore';
import { config } from './config';

export const app = initializeApp(config.firebase);

// App Check (abuse protection for the public web key): initialized only when
// a reCAPTCHA v3 site key is configured, so local/emulator builds without
// one keep working. Enforcement is switched on in the Firebase console;
// without it this only attests, it does not block.
//
// Initialization MUST finish before getFirestore() runs: a Firestore
// instance created first captures no App Check token provider, so every
// request for the life of the page goes out unattested and is rejected
// once enforcement is on. getDb() awaits this promise for exactly that
// reason (a plain dynamic-import race here caused "could not load your
// wallet" for every signed-in user after enforcement was enabled).
export const appCheckReady: Promise<void> = config.appCheckSiteKey
  ? import('firebase/app-check')
      .then(({ initializeAppCheck, ReCaptchaV3Provider }) => {
        initializeAppCheck(app, {
          provider: new ReCaptchaV3Provider(config.appCheckSiteKey),
          isTokenAutoRefreshEnabled: true,
        });
      })
      .catch(() => {
        // App Check is defense in depth; never block the app on it.
      })
  : Promise.resolve();
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
      // App Check first: Firestore must be instantiated after initializeAppCheck.
      await appCheckReady;
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
