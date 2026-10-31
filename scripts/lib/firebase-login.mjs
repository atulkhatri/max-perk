// Mint a Firestore-usable access token from the Firebase CLI login, so the
// catalog sync needs no service-account key file. Mirrors the installed
// firebase-tools refresh flow (same OAuth client, same configstore file,
// same token endpoint) without depending on its internals.

import { homedir } from 'node:os';
import { join } from 'node:path';

/** Same OAuth client the Firebase CLI itself uses (honours its env overrides). */
export const FIREBASE_CLIENT_ID =
  process.env.FIREBASE_CLIENT_ID ??
  '563584335869-fgrhgmd47bqnekij5i8b5pr03ho849e6.apps.googleusercontent.com';
export const FIREBASE_CLIENT_SECRET =
  process.env.FIREBASE_CLIENT_SECRET ?? 'REDACTED-FIREBASE-CLI-CLIENT-SECRET';

/** Same token endpoint the Firebase CLI refresh flow posts to. */
export const GOOGLE_TOKEN_URL = 'https://www.googleapis.com/oauth2/v3/token';

/** Reuse a cached token until this close to expiry. */
export const EXPIRY_SKEW_MS = 60_000;

/**
 * Ordered configstore candidates for the Firebase CLI token file. The CLI
 * has stored it under `~/.config/configstore/` on this machine; other
 * installs use XDG_CONFIG_HOME or %APPDATA%.
 */
export function configstoreCandidates(env = process.env, platform = process.platform) {
  const home = env.HOME ?? env.USERPROFILE ?? homedir();
  const candidates = [];
  if (env.XDG_CONFIG_HOME) candidates.push(join(env.XDG_CONFIG_HOME, 'configstore', 'firebase-tools.json'));
  candidates.push(join(home, '.config', 'configstore', 'firebase-tools.json'));
  const appData = platform === 'win32' ? env.APPDATA : undefined;
  if (appData) candidates.push(join(appData, 'configstore', 'firebase-tools.json'));
  return candidates;
}

/**
 * Read the CLI refresh token from a configstore file. Throws a guidance
 * error (never token material) when the file, login, or token is missing.
 */
export function readRefreshToken(storePath, readFile) {
  let store;
  try {
    store = JSON.parse(readFile(storePath, 'utf8'));
  } catch {
    throw new Error(
      `no Firebase CLI login found at ${storePath}: run \`firebase login\`, or pass --service-account=path.json`,
    );
  }
  const refreshToken = store?.tokens?.refresh_token;
  if (typeof refreshToken !== 'string' || refreshToken.length === 0) {
    throw new Error(
      `Firebase CLI login at ${storePath} has no refresh token: run \`firebase login\` again, or pass --service-account=path.json`,
    );
  }
  return { refreshToken, cached: store.tokens };
}

/** True when the cached CLI access token is still usable. */
export function cachedTokenFresh(cached, nowMs = Date.now()) {
  return (
    typeof cached?.access_token === 'string' &&
    typeof cached?.expires_at === 'number' &&
    cached.expires_at - EXPIRY_SKEW_MS > nowMs
  );
}

/**
 * Exchange a refresh token for a fresh access token (same form-encoded flow
 * the Firebase CLI uses). fetchFn is injectable for tests.
 */
export async function refreshAccessToken(
  refreshToken,
  { fetchFn = fetch, clientId = FIREBASE_CLIENT_ID, clientSecret = FIREBASE_CLIENT_SECRET } = {},
) {
  const form = new URLSearchParams({
    refresh_token: refreshToken,
    client_id: clientId,
    client_secret: clientSecret,
    grant_type: 'refresh_token',
  });
  let res;
  try {
    res = await fetchFn(GOOGLE_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: form.toString(),
    });
  } catch (err) {
    throw new Error(`Firebase token refresh failed to reach Google: ${err.message}`);
  }
  let body = {};
  try {
    body = await res.json();
  } catch {
    // Fall through to the error below with an empty body.
  }
  if (!res.ok || typeof body.access_token !== 'string') {
    if (body.error === 'invalid_grant') {
      throw new Error('Firebase login expired or revoked: run `firebase login` again');
    }
    throw new Error(`Firebase token refresh failed (HTTP ${res.status}): run \`firebase login\` again`);
  }
  return body.access_token;
}

/**
 * Full keyless flow: find the CLI token store, reuse the cached access
 * token when fresh, otherwise refresh it. Resolves to a Bearer token for
 * the Firestore REST client. Never logs or returns token material in errors.
 */
export async function firebaseLoginAccessToken({
  env = process.env,
  platform = process.platform,
  readFile,
  fetchFn = fetch,
  nowMs = Date.now(),
} = {}) {
  if (!readFile) {
    ({ readFileSync: readFile } = await import('node:fs'));
  }
  let lastError;
  for (const candidate of configstoreCandidates(env, platform)) {
    try {
      const { refreshToken, cached } = readRefreshToken(candidate, readFile);
      if (cachedTokenFresh(cached, nowMs)) return cached.access_token;
      return await refreshAccessToken(refreshToken, { fetchFn });
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError ?? new Error('no Firebase CLI login found: run `firebase login`');
}
