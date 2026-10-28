import { initializeApp } from 'firebase/app';
import { connectAuthEmulator, getAuth } from 'firebase/auth';
import { connectFirestoreEmulator, getFirestore } from 'firebase/firestore';
import { config } from './config';

export const app = initializeApp(config.firebase);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const usingEmulators = config.useEmulators;

// connect*Emulator throws if called twice (React StrictMode / HMR), so guard.
const FLAG = '__card_offers_emulators_connected';
if (config.useEmulators && !(globalThis as Record<string, unknown>)[FLAG]) {
  (globalThis as Record<string, unknown>)[FLAG] = true;
  connectAuthEmulator(auth, config.authEmulatorHost, { disableWarnings: true });
  connectFirestoreEmulator(db, config.firestoreEmulatorHost, config.firestoreEmulatorPort);
}
