#!/usr/bin/env node
/**
 * Seeds a mirror of the production catalog (data/catalog.curated.json) into
 * the Firestore emulator: meta doc + merchants collection. Lets ask-pick be
 * tested locally against the real 230-store list without touching prod.
 * Usage: npm run seed:catalog
 * Requires: Firestore emulator on 127.0.0.1:8080, and functions/node_modules
 * installed (npm --prefix functions install) for the Admin SDK, which
 * bypasses security rules the same way the Functions runtime does.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(join(ROOT, 'functions', 'package.json'));
let admin;
try {
  admin = require('firebase-admin');
} catch {
  console.error('Missing functions/node_modules. Run: npm --prefix functions install');
  process.exit(1);
}

process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8080';
admin.initializeApp({ projectId: 'cardoffers-5e586' });
const db = admin.firestore();

const catalog = JSON.parse(readFileSync(join(ROOT, 'data', 'catalog.curated.json'), 'utf8'));
await db.doc('catalog/v1').set({ dataAsOf: catalog.dataAsOf || 'unknown' }, { merge: true });
const batch = db.batch();
for (const m of catalog.merchants) {
  batch.set(db.doc(`catalog/v1/merchants/${m.id}`), { name: m.name }, { merge: true });
}
await batch.commit();
const snap = await db.collection('catalog/v1/merchants').get();
console.log(`seeded catalog mirror: meta + ${snap.size} merchants`);
process.exit(0);
