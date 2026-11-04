// Central runtime configuration, parsed once from Vite environment variables.
// See .env.example for documentation of every variable.

export interface FirebaseWebConfig {
  apiKey: string;
  authDomain: string;
  projectId: string;
  storageBucket: string;
  messagingSenderId: string;
  appId: string;
  measurementId: string;
}

export interface AppConfig {
  firebase: FirebaseWebConfig;
  /** reCAPTCHA v3 site key for App Check; empty disables App Check init. */
  appCheckSiteKey: string;
  useEmulators: boolean;
  authEmulatorHost: string;
  firestoreEmulatorHost: string;
  firestoreEmulatorPort: number;
}

function required(name: string): string {
  const value = import.meta.env[name] as string | undefined;
  if (!value) throw new Error(`Missing required environment variable ${name}. See .env.example.`);
  return value;
}

function optional(name: string, fallback: string): string {
  const value = import.meta.env[name] as string | undefined;
  return value ?? fallback;
}

export const config: AppConfig = {
  firebase: {
    apiKey: required('VITE_FIREBASE_API_KEY'),
    authDomain: required('VITE_FIREBASE_AUTH_DOMAIN'),
    projectId: required('VITE_FIREBASE_PROJECT_ID'),
    storageBucket: required('VITE_FIREBASE_STORAGE_BUCKET'),
    messagingSenderId: required('VITE_FIREBASE_MESSAGING_SENDER_ID'),
    appId: required('VITE_FIREBASE_APP_ID'),
    measurementId: optional('VITE_FIREBASE_MEASUREMENT_ID', ''),
  },
  appCheckSiteKey: optional('VITE_FIREBASE_APPCHECK_SITE_KEY', ''),
  useEmulators: optional('VITE_USE_EMULATORS', 'false') === 'true',
  authEmulatorHost: optional('VITE_AUTH_EMULATOR_HOST', 'http://127.0.0.1:9099'),
  firestoreEmulatorHost: optional('VITE_FIRESTORE_EMULATOR_HOST', '127.0.0.1'),
  firestoreEmulatorPort: Number(optional('VITE_FIRESTORE_EMULATOR_PORT', '8080')),
};
