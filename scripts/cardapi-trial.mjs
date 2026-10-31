// RETIRED Oct 2026: CardAPI vendor evaluation. The refresh plan dropped the
// paid feed in favour of official issuer pages + Firestore (see
// docs/CARD_DATA_REFRESH.md). Kept for provenance; do not run (the CARDAPI_KEY
// variable no longer exists).
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const BASE = 'https://api.cardapi.dev';

function loadKey() {
  const env = readFileSync(join(ROOT, '.env.local'), 'utf8');
  const line = env.split('\n').find((l) => l.startsWith('CARDAPI_KEY='));
  const key = line?.slice('CARDAPI_KEY='.length).trim();
  if (!key) throw new Error('CARDAPI_KEY missing from .env.local');
  return key;
}

// [catalogId, exact CardAPI slug]. Resolved 2026-10-30 via /v1/cards/search
// plus per-issuer lists. `walmart` has no coverage (no Duo Bank issuer).
const CARDS = [
  ['amex-cobalt', 'american-express-cobalt-card'],
  ['scotia-momentum', 'scotia-momentum-visa-infinite-card'],
  ['td-first-class', 'td-first-class-travel-visa-infinite-card'],
  ['rbc-avion', 'rbc-avion-visa-infinite'],
  ['cibc-dividend', 'cibc-dividend-visa-infinite-card'],
  ['bmo-cashback', 'bmo-cashback-world-elite-mastercard'],
  ['tangerine', 'tangerine-money-back-credit-card'],
  ['rogers-red', 'rogers-red-world-elite-mastercard'],
  ['pc-financial', 'pc-world-elite-mastercard'],
  ['triangle', 'triangle-world-elite-mastercard'],
  ['costco-cibc', 'cibc-costco-mastercard'],
];

async function get(key, path) {
  const res = await fetch(`${BASE}${path}`, {
    headers: { Authorization: `Bearer ${key}` },
  });
  const remaining = res.headers.get('x-ratelimit-remaining');
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`${path} -> ${res.status}: ${text.slice(0, 300)}`);
  }
  return { json: await res.json(), remaining };
}

const key = loadKey();

const stats = await get(key, '/v1/stats').then((r) => r.json).catch((e) => ({ error: String(e) }));
console.log('stats:', JSON.stringify(stats).slice(0, 400));

const issuers = await get(key, '/v1/issuers?country=CA').then((r) => r.json).catch((e) => ({ error: String(e) }));
const issuerList = issuers.data ?? issuers.issuers ?? issuers;
console.log('CA issuers:', JSON.stringify(issuerList.map((i) => `${i.slug} (${i.card_count})`)));

console.log('\ncatalogId | slug | name | annual_fee | rates | quota-left');
for (const [id, slug] of CARDS) {
  try {
    const full = await get(key, `/v1/cards/${slug}`);
    const d = full.json.data ?? full.json;
    const rates = d.reward_rates ?? d.rewardRates ?? [];
    console.log(
      `${id} | ${d.slug} | ${d.name} | ${d.annual_fee} | ${Array.isArray(rates) ? rates.length : '?'} rates | quota-left=${full.remaining}`,
    );
  } catch (e) {
    console.log(`${id} | ERROR: ${String(e).slice(0, 200)}`);
  }
}
console.log('walmart | NO COVERAGE (Duo Bank not among CardAPI issuers; manual curation fallback)');

const sample = await get(key, '/v1/cards/american-express-cobalt-card');
const s = sample.json.data ?? sample.json;
console.log('\nsample keys:', Object.keys(s).join(', '));
console.log('reward_rates:', JSON.stringify(s.reward_rates ?? s.rewardRates));
for (const k of Object.keys(s)) {
  if (/date|check|update|source|url|verified/i.test(k)) console.log(`${k}:`, JSON.stringify(s[k]).slice(0, 300));
}
