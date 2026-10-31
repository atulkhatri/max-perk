// Minimal Firestore REST helper for server-side scripts (zero dependencies).
// The client SDK cannot write /catalog (rules deny client writes by design),
// so privileged writes go through this module: service-account JWT auth for
// production, Bearer-owner for the emulator (same trick as seed-emulators).
//
// Document layout (public read, no client writes — see firestore.rules):
//   catalog/v1                    meta { dataAsOf, updatedAt, source, counts }
//   catalog/v1/cards/{cardId}     exact CardSeed JSON, no extra fields
//   catalog/v1/programs/{id}      exact ProgramSeed JSON
//   catalog/v1/merchants/{id}     exact MerchantSeed JSON
//   catalog/v1/loyalty/{id}       exact LoyaltySeed JSON
//   catalog/v1/offers/{id}        exact BankOfferSeed JSON

import { createSign } from 'node:crypto';
import { readFileSync } from 'node:fs';

export const CATALOG_ROOT = 'catalog/v1';
export const SUBCOLLECTIONS = ['cards', 'programs', 'merchants', 'loyalty', 'offers'];

/** Plain JS value -> Firestore Value wire format. Drops `undefined` fields. */
export function encodeValue(value) {
  if (value === null) return { nullValue: null };
  switch (typeof value) {
    case 'string':
      return { stringValue: value };
    case 'boolean':
      return { booleanValue: value };
    case 'number': {
      if (!Number.isFinite(value)) throw new Error(`cannot encode non-finite number ${value}`);
      return Number.isInteger(value) ? { integerValue: String(value) } : { doubleValue: value };
    }
    default:
      break;
  }
  if (value instanceof Date) return { timestampValue: value.toISOString() };
  if (Array.isArray(value)) {
    return value.length === 0 ? { arrayValue: {} } : { arrayValue: { values: value.map(encodeValue) } };
  }
  if (typeof value === 'object') {
    const fields = {};
    for (const [k, v] of Object.entries(value)) {
      if (v !== undefined) fields[k] = encodeValue(v);
    }
    return { mapValue: { fields } };
  }
  throw new Error(`cannot encode ${typeof value}`);
}

export function encodeFields(obj) {
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v !== undefined) out[k] = encodeValue(v);
  }
  return out;
}

/** Firestore Value wire format -> plain JS (for verify-back reads). */
export function decodeValue(value) {
  if (value == null || typeof value !== 'object') throw new Error('invalid Firestore value');
  if ('stringValue' in value) return value.stringValue;
  if ('booleanValue' in value) return value.booleanValue;
  if ('integerValue' in value) return Number(value.integerValue);
  if ('doubleValue' in value) return Number(value.doubleValue);
  if ('nullValue' in value) return null;
  if ('timestampValue' in value) return value.timestampValue;
  if ('arrayValue' in value) return (value.arrayValue.values ?? []).map(decodeValue);
  if ('mapValue' in value) {
    const out = {};
    for (const [k, v] of Object.entries(value.mapValue.fields ?? {})) out[k] = decodeValue(v);
    return out;
  }
  if ('referenceValue' in value) return value.referenceValue;
  throw new Error(`unsupported Firestore value ${Object.keys(value).join(',')}`);
}

function base64url(input) {
  return Buffer.from(input).toString('base64url');
}

/** OAuth access token for a service-account key (JWT bearer flow, no deps). */
export async function serviceAccountToken(keyJson) {
  const now = Math.floor(Date.now() / 1000);
  const header = base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT', kid: keyJson.private_key_id }));
  const claim = base64url(
    JSON.stringify({
      iss: keyJson.client_email,
      sub: keyJson.client_email,
      aud: 'https://oauth2.googleapis.com/token',
      iat: now,
      exp: now + 3600,
      scope: 'https://www.googleapis.com/auth/datastore',
    }),
  );
  const signer = createSign('RSA-SHA256');
  signer.update(`${header}.${claim}`);
  const assertion = `${header}.${claim}.${signer.sign(keyJson.private_key, 'base64url')}`;
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=${encodeURIComponent('urn:ietf:params:oauth:grant-type:jwt-bearer')}&assertion=${assertion}`,
  });
  const json = await res.json();
  if (!res.ok) throw new Error(`token exchange failed: HTTP ${res.status} ${JSON.stringify(json).slice(0, 200)}`);
  return json.access_token;
}

/**
 * @param {{ emulatorHost?: string|null, projectId: string, token?: string|null }}
 * emulatorHost like "127.0.0.1:8080" selects the emulator (Bearer owner).
 */
export function createClient({ emulatorHost, projectId, token }) {
  const base = emulatorHost
    ? `http://${emulatorHost}/v1/projects/${projectId}/databases/(default)/documents`
    : `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents`;
  const auth = emulatorHost ? 'Bearer owner' : `Bearer ${token}`;

  async function request(method, path, body) {
    const res = await fetch(`${base}/${path}`, {
      method,
      headers: { 'Content-Type': 'application/json', Authorization: auth },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await res.text();
    const json = text ? JSON.parse(text) : null;
    if (!res.ok) {
      throw new Error(`${method} ${path} -> HTTP ${res.status} ${JSON.stringify(json).slice(0, 300)}`);
    }
    return json;
  }

  return {
    base,
    /** Full-replace write (no updateMask: absent fields are deleted). */
    putDocument: (path, obj) => request('PATCH', path, { fields: encodeFields(obj) }),
    getDocument: (path) => request('GET', path),
    deleteDocument: (path) => request('DELETE', path),
    async listDocumentIds(collectionPath) {
      const ids = [];
      let pageToken;
      do {
        const q = `?pageSize=100${pageToken ? `&pageToken=${pageToken}` : ''}`;
        const json = await request('GET', `${collectionPath}${q}`);
        for (const doc of json.documents ?? []) ids.push(doc.name.split('/').pop());
        pageToken = json.nextPageToken;
      } while (pageToken);
      return ids;
    },
  };
}

/** Tiny KEY=VALUE reader (no interpolation, strips one layer of quotes). */
export function readDotenv(path) {
  const out = {};
  let text;
  try {
    text = readFileSync(path, 'utf8');
  } catch {
    return out;
  }
  for (const line of text.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#') || !trimmed.includes('=')) continue;
    const [key, ...rest] = trimmed.split('=');
    const raw = rest.join('=').trim();
    out[key.trim()] = raw.replace(/^(['"])(.*)\1$/, '$2');
  }
  return out;
}
