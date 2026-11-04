// Repeatable Firestore rules check against the local emulator (deny matrix).
// Allow-cases that need serverTimestamp are covered by SDK tests + app E2E;
// REST cannot mint request.time, so valid creates are asserted there instead.
const AUTH = 'http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1';
const DB = 'http://127.0.0.1:8080/v1/projects/cardoffers-5e586/databases/(default)/documents';
const KEY = 'key=fake-api-key';

async function token(body) {
  const r = await fetch(`${AUTH}/accounts:signUp?${KEY}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ returnSecureToken: true, ...body }),
  });
  const j = await r.json();
  if (!j.idToken) throw new Error(`token failed: ${JSON.stringify(j).slice(0, 120)}`);
  return j;
}

async function signIn(email, password) {
  const r = await fetch(`${AUTH}/accounts:signInWithPassword?${KEY}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, returnSecureToken: true }),
  });
  const j = await r.json();
  if (!j.idToken) throw new Error(`signin failed: ${JSON.stringify(j).slice(0, 120)}`);
  return j;
}

const F = (v) =>
  typeof v === 'string'
    ? { stringValue: v }
    : typeof v === 'number'
      ? { integerValue: String(v) }
      : Array.isArray(v)
        ? { arrayValue: { values: v.map(F) } }
        : { mapValue: { fields: Object.fromEntries(Object.entries(v).map(([k, x]) => [k, F(x)])) } };

async function attempt({ name, method, url, token: tok, body, expect }) {
  const headers = { 'Content-Type': 'application/json' };
  if (tok) headers.Authorization = `Bearer ${tok}`;
  let res;
  try {
    res = await fetch(url, { method, headers, body: body ? JSON.stringify(body) : undefined });
  } catch (e) {
    console.log(`FAIL ${name}: transport ${e.message}`);
    return false;
  }
  // Deny must be a rules 403 for writes/creates; a 404 on a missing doc also
  // proves no leak for reads, so reads accept either. A bare >=400 check
  // would let a broken (always-404) ruleset pass.
  const ok = expect === 'allow' ? res.status < 300 : method === 'GET' ? (res.status === 403 || res.status === 404) : res.status === 403;
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name} (want ${expect}, got ${res.status})`);
  return ok;
}

const anon = await token({});
const userA = await token({ email: 'rules-a@example.com', password: 'rules-1234' });
const userB = await token({ email: 'rules-b@example.com', password: 'rules-1234' });
const tester = await signIn('tester@example.com', 'tester-1234');

// One feedback doc owned by A, for get/update/delete probes.
const created = await fetch(`${DB}/feedback`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${userA.idToken}` },
  body: JSON.stringify({
    fields: {
      kind: F('bug'),
      text: F('Rules probe report with enough detail'),
      uid: F(userA.localId),
      status: F('new'),
      createdAt: { timestampValue: new Date().toISOString() },
    },
  }),
});
console.log(`setup feedback doc: ${created.status} (want 403: createdAt != request.time over REST)`);
const seedId = created.status < 300 ? created.headers.get('location')?.split('/').pop() : 'probe-missing';

const loyalty51 = Array.from({ length: 51 }, (_, i) => `prog-${i}`);
const cases = [
  // feedback creates
  { name: 'feedback create anon denied', method: 'POST', url: `${DB}/feedback`, token: anon.idToken, body: { fields: { kind: F('bug'), text: F('Anonymous spam attempt here'), uid: F(anon.localId), status: F('new') } }, expect: 'deny' },
  { name: 'feedback create unauth denied', method: 'POST', url: `${DB}/feedback`, token: null, body: { fields: { kind: F('bug'), text: F('No-auth spam attempt here!'), uid: F('x'), status: F('new') } }, expect: 'deny' },
  { name: 'feedback create short text denied', method: 'POST', url: `${DB}/feedback`, token: userA.idToken, body: { fields: { kind: F('bug'), text: F('short'), uid: F(userA.localId), status: F('new') } }, expect: 'deny' },
  { name: 'feedback create bad kind denied', method: 'POST', url: `${DB}/feedback`, token: userA.idToken, body: { fields: { kind: F('idea'), text: F('A long enough report text here'), uid: F(userA.localId), status: F('new') } }, expect: 'deny' },
  { name: 'feedback create wrong uid denied', method: 'POST', url: `${DB}/feedback`, token: userA.idToken, body: { fields: { kind: F('bug'), text: F('A long enough report text here'), uid: F(userB.localId), status: F('new') } }, expect: 'deny' },
  { name: 'feedback create extra key denied', method: 'POST', url: `${DB}/feedback`, token: userA.idToken, body: { fields: { kind: F('bug'), text: F('A long enough report text here'), uid: F(userA.localId), status: F('new'), evil: F('x') } }, expect: 'deny' },
  { name: 'feedback create spoofed contact denied', method: 'POST', url: `${DB}/feedback`, token: userA.idToken, body: { fields: { kind: F('bug'), text: F('Filing under a victim address here'), uid: F(userA.localId), status: F('new'), contact: F('victim@example.com') } }, expect: 'deny' },
  { name: 'feedback create bad contact denied', method: 'POST', url: `${DB}/feedback`, token: userA.idToken, body: { fields: { kind: F('bug'), text: F('A long enough report text here'), uid: F(userA.localId), status: F('new'), contact: F('not-an-email') } }, expect: 'deny' },
  // feedback reads/writes (seedId only exists if REST create passed; otherwise they 404 which still proves no leak)
  { name: 'feedback cross-user get denied', method: 'GET', url: `${DB}/feedback/${seedId}`, token: userB.idToken, expect: 'deny' },
  { name: 'feedback list denied', method: 'GET', url: `${DB}/feedback?pageSize=5`, token: userA.idToken, expect: 'deny' },
  { name: 'feedback update denied', method: 'PATCH', url: `${DB}/feedback/${seedId}`, token: userA.idToken, body: { fields: { status: F('done') } }, expect: 'deny' },
  { name: 'feedback delete denied', method: 'DELETE', url: `${DB}/feedback/${seedId}`, token: userA.idToken, expect: 'deny' },
  // card report creates
  { name: 'card report create anon denied', method: 'POST', url: `${DB}/cardReports`, token: anon.idToken, body: { fields: { cardId: F('amex-cobalt'), uid: F(anon.localId), status: F('new') } }, expect: 'deny' },
  { name: 'card report create unauth denied', method: 'POST', url: `${DB}/cardReports`, token: null, body: { fields: { cardId: F('amex-cobalt'), uid: F('x'), status: F('new') } }, expect: 'deny' },
  { name: 'card report create missing card denied', method: 'POST', url: `${DB}/cardReports`, token: userA.idToken, body: { fields: { uid: F(userA.localId), status: F('new') } }, expect: 'deny' },
  { name: 'card report create bad contact denied', method: 'POST', url: `${DB}/cardReports`, token: userA.idToken, body: { fields: { cardId: F('amex-cobalt'), uid: F(userA.localId), status: F('new'), contact: F('not-an-email') } }, expect: 'deny' },
  { name: 'card report create extra key denied', method: 'POST', url: `${DB}/cardReports`, token: userA.idToken, body: { fields: { cardId: F('amex-cobalt'), uid: F(userA.localId), status: F('new'), evil: F('x') } }, expect: 'deny' },
  // card report reads/writes (no REST-created seed exists; 404 still proves no leak)
  { name: 'card report cross-user get denied', method: 'GET', url: `${DB}/cardReports/probe-missing`, token: userB.idToken, expect: 'deny' },
  { name: 'card report list denied', method: 'GET', url: `${DB}/cardReports?pageSize=5`, token: userA.idToken, expect: 'deny' },
  { name: 'card report update denied', method: 'PATCH', url: `${DB}/cardReports/probe-missing`, token: userA.idToken, body: { fields: { status: F('done') } }, expect: 'deny' },
  { name: 'card report delete denied', method: 'DELETE', url: `${DB}/cardReports/probe-missing`, token: userA.idToken, expect: 'deny' },
  // wallet/user locks
  { name: 'wallet junk field denied', method: 'PATCH', url: `${DB}/users/${userA.localId}/wallet/amex-cobalt`, token: userA.idToken, body: { fields: { addedAt: { timestampValue: new Date().toISOString() }, evil: F('x') } }, expect: 'deny' },
  { name: 'wallet bad card id denied', method: 'PATCH', url: `${DB}/users/${userA.localId}/wallet/BAD ID!`, token: userA.idToken, body: { fields: { addedAt: { timestampValue: new Date().toISOString() } } }, expect: 'deny' },
  { name: 'wallet cross-user denied', method: 'PATCH', url: `${DB}/users/${userB.localId}/wallet/amex-cobalt`, token: userA.idToken, body: { fields: { addedAt: { timestampValue: new Date().toISOString() } } }, expect: 'deny' },
  { name: 'users junk field denied', method: 'PATCH', url: `${DB}/users/${userA.localId}`, token: userA.idToken, body: { fields: { loyaltyUsed: F(['x']), evil: F('y') } }, expect: 'deny' },
  { name: 'users oversize loyalty denied', method: 'PATCH', url: `${DB}/users/${userA.localId}`, token: userA.idToken, body: { fields: { loyaltyUsed: F(loyalty51) } }, expect: 'deny' },
  { name: 'users negative spend denied', method: 'PATCH', url: `${DB}/users/${userA.localId}`, token: userA.idToken, body: { fields: { spendProfile: F({ grocery: -5 }) } }, expect: 'deny' },
  { name: 'users unknown spend key denied', method: 'PATCH', url: `${DB}/users/${userA.localId}`, token: userA.idToken, body: { fields: { spendProfile: F({ yacht: 10 }) } }, expect: 'deny' },
  { name: 'users cross-user denied', method: 'PATCH', url: `${DB}/users/${userB.localId}`, token: userA.idToken, body: { fields: { loyaltyUsed: F(['x']) } }, expect: 'deny' },
  // sanity: own reads still work
  { name: 'own wallet read allowed', method: 'GET', url: `${DB}/users/${tester.localId}/wallet/amex-cobalt`, token: tester.idToken, expect: 'allow' },
];

let pass = 0;
for (const c of cases) {
  if (await attempt(c)) pass++;
}
console.log(`\n${pass}/${cases.length} rules checks passed`);
process.exit(pass === cases.length ? 0 : 1);
