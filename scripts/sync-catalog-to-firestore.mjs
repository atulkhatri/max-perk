// Uploads a catalog JSON (default: the committed sample) to Firestore (/catalog/v1 + subcollections)
// so the app can read the live catalog. Privileged server-side write via the
// REST API: service-account JWT for production, Bearer-owner for the emulator.
//
// Safety: production writes require --confirm. Emulator writes are free.
// Always run `npm test` first; the script re-checks catalog integrity itself.
//
// Usage:
//   node scripts/sync-catalog-to-firestore.mjs --dry-run
//   node scripts/sync-catalog-to-firestore.mjs --emulator [--prune]
//   node scripts/sync-catalog-to-firestore.mjs --confirm [--prune]
//     [--project-id=X] [--service-account=path.json] [--snapshot-ref=dir]

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  CATALOG_ROOT,
  SUBCOLLECTIONS,
  createClient,
  decodeValue,
  readDotenv,
  serviceAccountToken,
} from './lib/firestore-rest.mjs';
import { firebaseLoginAccessToken } from './lib/firebase-login.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

function printHelp() {
  console.log(`sync-catalog-to-firestore.mjs — upload the curated catalog to Firestore

  --dry-run            validate + print the write plan, change nothing
  --emulator           write to the local emulator (needs npm run emulators)
  --confirm            required for production writes (no-op for --dry-run)
  --prune              delete remote docs missing from the JSON (stale cards)
  --project-id=X       override project id (default: env / service account / .env files)
  --service-account=P  service-account key JSON (default: $GOOGLE_APPLICATION_CREDENTIALS)
  --access-token=T     raw OAuth access token with cloud-platform scope
                       (default: $FIRESTORE_ACCESS_TOKEN, e.g. from
                       gcloud auth print-access-token)
  --snapshot-ref=DIR   snapshot dir backing this curation (recorded in meta)
  --data=PATH          catalog JSON (default: src/data/seeds/sample-catalog.json)

Production auth resolves automatically, first match wins:
  1. --service-account=path.json (or $GOOGLE_APPLICATION_CREDENTIALS) - preferred, scoped
  2. --access-token=T (or $FIRESTORE_ACCESS_TOKEN) - discouraged: lands in shell history
  3. your Firebase CLI login (\`firebase login\`) — no key file needed.
Key files are never committed: store them OUTSIDE the repo.`);
}

function parseArgs(argv) {
  const args = {
    dryRun: false,
    emulator: false,
    confirm: false,
    prune: false,
    projectId: null,
    accessToken: process.env.FIRESTORE_ACCESS_TOKEN ?? null,
    serviceAccount: null,
    snapshotRef: null,
    data: join(ROOT, 'src', 'data', 'seeds', 'sample-catalog.json'),
    help: false,
  };
  for (const token of argv) {
    if (token === '--help' || token === '-h') args.help = true;
    else if (token === '--dry-run') args.dryRun = true;
    else if (token === '--emulator') args.emulator = true;
    else if (token === '--confirm') args.confirm = true;
    else if (token === '--prune') args.prune = true;
    else if (token.startsWith('--project-id=')) args.projectId = token.slice(13);
    else if (token.startsWith('--access-token=')) args.accessToken = token.slice(15);
    else if (token.startsWith('--service-account=')) args.serviceAccount = token.slice(18);
    else if (token.startsWith('--snapshot-ref=')) args.snapshotRef = token.slice(15);
    else if (token.startsWith('--data=')) args.data = token.slice(7);
    else if (token.startsWith('--')) throw new Error(`unknown flag ${token} (see --help)`);
    else throw new Error(`unexpected argument ${token} (see --help)`);
  }
  return args;
}

/**
 * Structural + referential check of the catalog JSON. Mirrors the TS
 * validateCatalog() in src/data/seeds/catalog.ts (the authority); this copy
 * exists so the uploader refuses to ship a broken catalog on its own.
 */
export function checkCatalogJson(cat) {
  const errors = [];
  for (const key of ['dataAsOf', 'cards', 'programs', 'merchants', 'loyalty', 'bankOffers']) {
    if (cat[key] === undefined) errors.push(`missing top-level key ${key}`);
  }
  if (errors.length > 0) return errors;
  if (!Array.isArray(cat.cards) || cat.cards.length === 0) errors.push('cards must be a non-empty array');

  const cardIds = new Set((cat.cards ?? []).map((c) => c?.id));
  const programIds = new Set((cat.programs ?? []).map((p) => p?.id));
  const merchantIds = new Set((cat.merchants ?? []).map((m) => m?.id));
  const loyaltyIds = new Set((cat.loyalty ?? []).map((l) => l?.id));

  for (const card of cat.cards ?? []) {
    for (const f of ['id', 'name', 'issuer', 'network', 'kind', 'segment', 'annualFeeCAD', 'programId', 'earn', 'caps', 'conditions', 'benefits', 'dataAsOf', 'sourceUrls']) {
      if (card?.[f] === undefined) errors.push(`card ${card?.id ?? '?'}: missing ${f}`);
    }
    if (card && card.kind !== 'credit' && card.kind !== 'debit') errors.push(`card ${card.id}: unknown kind ${card.kind}`);
    if (card && card.segment !== 'personal' && card.segment !== 'business') {
      errors.push(`card ${card.id}: unknown segment ${card.segment}`);
    }
    if (card && !programIds.has(card.programId)) errors.push(`card ${card.id}: unknown program ${card.programId}`);
    for (const m of Object.keys(card?.merchantRates ?? {})) {
      if (!merchantIds.has(m)) errors.push(`card ${card.id}: unknown merchantRate ${m}`);
    }
    for (const m of card?.fuel?.merchants ?? []) {
      if (!merchantIds.has(m)) errors.push(`card ${card.id}: unknown fuel merchant ${m}`);
    }
  }
  for (const merchant of cat.merchants ?? []) {
    if (merchant?.storeCardId && !cardIds.has(merchant.storeCardId)) {
      errors.push(`merchant ${merchant.id}: unknown storeCard ${merchant.storeCardId}`);
    }
    if (merchant?.loyaltyId && !loyaltyIds.has(merchant.loyaltyId)) {
      errors.push(`merchant ${merchant.id}: unknown loyalty ${merchant.loyaltyId}`);
    }
  }
  for (const offer of cat.bankOffers ?? []) {
    if (offer?.appliesTo !== 'all') {
      for (const cardId of offer?.appliesTo?.cards ?? []) {
        if (!cardIds.has(cardId)) errors.push(`offer ${offer.id}: unknown card ${cardId}`);
      }
    }
  }
  return errors;
}

function resolveProjectId(args, serviceAccount) {
  if (args.projectId) return args.projectId;
  if (process.env.FIRESTORE_PROJECT_ID) return process.env.FIRESTORE_PROJECT_ID;
  if (serviceAccount?.project_id) return serviceAccount.project_id;
  // Emulator runs share the app's project id; read it from local env files.
  for (const file of ['.env.development', '.env.local']) {
    const env = readDotenv(join(ROOT, file));
    if (env.VITE_FIREBASE_PROJECT_ID) return env.VITE_FIREBASE_PROJECT_ID;
  }
  throw new Error('cannot determine project id: pass --project-id or set FIRESTORE_PROJECT_ID');
}

function planWrites(cat, snapshotRef) {
  const docs = [];
  const counts = {
    cardCount: cat.cards.length,
    programCount: cat.programs.length,
    merchantCount: cat.merchants.length,
    loyaltyCount: cat.loyalty.length,
    offerCount: cat.bankOffers.length,
  };
  docs.push({
    path: CATALOG_ROOT,
    obj: {
      dataAsOf: cat.dataAsOf,
      updatedAt: new Date(),
      source: 'issuer-direct',
      version: 1,
      snapshotRef: snapshotRef ?? null,
      ...counts,
    },
  });
  const buckets = { cards: cat.cards, programs: cat.programs, merchants: cat.merchants, loyalty: cat.loyalty, offers: cat.bankOffers };
  for (const name of SUBCOLLECTIONS) {
    for (const entry of buckets[name]) docs.push({ path: `${CATALOG_ROOT}/${name}/${entry.id}`, obj: entry });
  }
  return { docs, counts };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    printHelp();
    return;
  }
  const cat = JSON.parse(readFileSync(args.data, 'utf8'));
  const errors = checkCatalogJson(cat);
  if (errors.length > 0) {
    console.error('catalog check FAILED — refusing to sync:');
    for (const e of errors) console.error(`  - ${e}`);
    process.exitCode = 1;
    return;
  }
  console.log(`catalog check passed (${cat.cards.length} cards, dataAsOf ${cat.dataAsOf})`);

  const keyPath = args.serviceAccount ?? process.env.GOOGLE_APPLICATION_CREDENTIALS ?? null;
  const serviceAccount = keyPath && !args.emulator ? JSON.parse(readFileSync(keyPath, 'utf8')) : null;
  const projectId = args.emulator && args.projectId === null && !process.env.FIRESTORE_PROJECT_ID && !serviceAccount
    ? resolveProjectId(args, null)
    : resolveProjectId(args, serviceAccount);
  const { docs, counts } = planWrites(cat, args.snapshotRef);

  if (args.dryRun) {
    console.log(`\nplan: ${docs.length} document writes to catalog/v1* in project ${projectId}`);
    console.log(`counts: ${JSON.stringify(counts)}`);
    console.log(`sample ${docs[1].path}: ${JSON.stringify(docs[1].obj).slice(0, 220)}…`);
    if (args.prune) console.log('prune: would delete remote docs missing from the JSON (list at sync time)');
    console.log('\ndry run — nothing written.');
    return;
  }

  const emulatorHost = args.emulator
    ? (process.env.FIRESTORE_EMULATOR_HOST ?? '127.0.0.1:8080')
    : null;
  if (!args.emulator && !args.confirm) {
    throw new Error('production write needs --confirm (or use --emulator / --dry-run)');
  }
  let token = null;
  if (!args.emulator && serviceAccount) {
    token = await serviceAccountToken(serviceAccount);
  } else if (!args.emulator && args.accessToken) {
    console.error('warning: using a raw access token (visible in shell history/process list); prefer --service-account');
    token = args.accessToken;
  }
  if (!args.emulator && !token) {
    {
      try {
        token = await firebaseLoginAccessToken();
      } catch (err) {
        throw new Error(
          `production sync needs credentials (${err.message}); or pass --access-token=T / --service-account=path.json`,
        );
      }
    }
  }
  const client = createClient({ emulatorHost, projectId, token });
  console.log(`target: ${client.base}`);

  let written = 0;
  for (const doc of docs) {
    await client.putDocument(doc.path, doc.obj);
    written += 1;
    if (written % 20 === 0) console.log(`  …${written}/${docs.length}`);
  }
  console.log(`wrote ${written}/${docs.length} documents.`);

  if (args.prune) {
    const wanted = {
      cards: new Set(cat.cards.map((c) => c.id)),
      programs: new Set(cat.programs.map((p) => p.id)),
      merchants: new Set(cat.merchants.map((m) => m.id)),
      loyalty: new Set(cat.loyalty.map((l) => l.id)),
      offers: new Set(cat.bankOffers.map((o) => o.id)),
    };
    let pruned = 0;
    for (const name of SUBCOLLECTIONS) {
      const remote = await client.listDocumentIds(`${CATALOG_ROOT}/${name}`);
      for (const id of remote) {
        if (!wanted[name].has(id)) {
          await client.deleteDocument(`${CATALOG_ROOT}/${name}/${id}`);
          console.log(`pruned ${CATALOG_ROOT}/${name}/${id}`);
          pruned += 1;
        }
      }
    }
    console.log(pruned === 0 ? 'prune: nothing stale.' : `prune: deleted ${pruned} stale doc(s).`);
  }

  // Verify back: meta counts + one card round-trip.
  const metaRaw = await client.getDocument(CATALOG_ROOT);
  const meta = decodeValue({ mapValue: { fields: metaRaw.fields ?? {} } });
  const probe = await client.getDocument(`${CATALOG_ROOT}/cards/${cat.cards[0].id}`);
  const probeId = decodeValue({ mapValue: { fields: probe.fields } }).id;
  const ok = meta.dataAsOf === cat.dataAsOf && meta.cardCount === cat.cards.length && probeId === cat.cards[0].id;
  console.log(`verify: meta dataAsOf=${meta.dataAsOf} cardCount=${meta.cardCount} probe=${probeId} -> ${ok ? 'OK' : 'MISMATCH'}`);
  if (!ok) process.exitCode = 1;
}

const invokedDirectly = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (invokedDirectly) {
  await main().catch((e) => {
    console.error(`error: ${e.message}`);
    process.exitCode = 1;
  });
}
