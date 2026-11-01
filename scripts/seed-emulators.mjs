// Seeds the Firebase emulators with a demo account + wallet for local testing.
// Prerequisite: `npm run emulators` running (auth :9099, firestore :8080).
// Re-runnable: existing test user is reused, wallet docs are overwritten.
//
//   node scripts/seed-emulators.mjs [email] [password]

const AUTH = 'http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1';
const FIRESTORE = 'http://127.0.0.1:8080/v1/projects/cardoffers-5e586/databases/(default)/documents';
const KEY = 'fake-api-key';

const EMAIL = process.argv[2] ?? 'tester@example.com';
const PASSWORD = process.argv[3] ?? 'tester-1234';
const WALLET = ['amex-cobalt', 'scotia-momentum', 'tangerine', 'pc-financial', 'triangle'];

async function postJson(url, body, headers = {}) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(`${url} -> ${res.status} ${JSON.stringify(json)}`);
  return json;
}

async function ensureUser() {
  try {
    const created = await postJson(`${AUTH}/accounts:signUp?key=${KEY}`, {
      email: EMAIL,
      password: PASSWORD,
      returnSecureToken: true,
    });
    console.log(`created user ${EMAIL} (${created.localId})`);
    return created.localId;
  } catch (err) {
    if (!String(err).includes('EMAIL_EXISTS')) throw err;
    const signedIn = await postJson(`${AUTH}/accounts:signInWithPassword?key=${KEY}`, {
      email: EMAIL,
      password: PASSWORD,
      returnSecureToken: true,
    });
    console.log(`reusing user ${EMAIL} (${signedIn.localId})`);
    return signedIn.localId;
  }
}

async function seedWallet(uid) {
  const headers = { Authorization: 'Bearer owner' }; // emulator superuser, bypasses rules
  for (const cardId of WALLET) {
    const res = await fetch(`${FIRESTORE}/users/${uid}/wallet?documentId=${cardId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify({ fields: { addedAt: { timestampValue: new Date().toISOString() } } }),
    });
    if (!res.ok && res.status !== 409) throw new Error(`wallet ${cardId} -> ${res.status}`);
    console.log(`wallet: ${cardId} ${res.status === 409 ? '(already present)' : '(seeded)'}`);
  }
  const prefs = await fetch(`${FIRESTORE}/users/${uid}?updateMask.fieldPaths=loyaltyUsed`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify({ fields: { loyaltyUsed: { arrayValue: {} } } }),
  });
  if (!prefs.ok) throw new Error(`prefs -> ${prefs.status}`);
  console.log('prefs: loyaltyUsed reset to []');
}

const uid = await ensureUser();
await seedWallet(uid);
console.log(`\nDone. Sign in locally with:\n  email:    ${EMAIL}\n  password: ${PASSWORD}\n  uid:      ${uid}`);
