// Live catalog from Firestore (/catalog/v1*), with the bundled JSON catalog as
// the offline/error fallback. Reads are public (see firestore.rules), so no
// sign-in is needed; writes happen only through scripts/sync-catalog-*.mjs.

import type { Firestore } from 'firebase/firestore';
import { useEffect, useMemo, useState } from 'react';
import { db } from '../firebase';
import { catalog as bundledCatalog, validateCatalog } from './seeds/catalog';
import type {
  BankOfferSeed,
  CardSeed,
  Catalog,
  LoyaltySeed,
  MerchantSeed,
  ProgramSeed,
} from './types';

export const CATALOG_DOC_PATH = 'catalog/v1';

export type CatalogSource = 'live' | 'bundled';

export interface RemoteCatalogMeta {
  dataAsOf: string;
  /** ISO timestamp of the last sync, when the server recorded one. */
  updatedAt: string | null;
  source: string;
  snapshotRef: string | null;
}

export interface CatalogState {
  catalog: Catalog;
  source: CatalogSource;
  meta: RemoteCatalogMeta | null;
  loading: boolean;
}

const FRESH_KEY = 'catalog-fresh-at';
const FRESH_TTL_MS = 24 * 60 * 60 * 1000;

function readFreshAt(): number {
  try {
    return Number(localStorage.getItem(FRESH_KEY) ?? 0);
  } catch {
    return 0;
  }
}

function writeFreshAt(now: number): void {
  try {
    localStorage.setItem(FRESH_KEY, String(now));
  } catch {
    // Private mode etc: freshness simply won't persist.
  }
}

interface SharedCatalog {
  refs: number;
  state: CatalogState;
  listeners: Set<(state: CatalogState) => void>;
  stop: (() => void) | null;
  started: boolean;
}

let shared: SharedCatalog | null = null;

function getShared(): SharedCatalog {
  if (!shared) {
    shared = {
      refs: 0,
      state: { catalog: bundledCatalog, source: 'bundled', meta: null, loading: true },
      listeners: new Set(),
      stop: null,
      started: false,
    };
  }
  return shared;
}

let settleTimer: ReturnType<typeof setTimeout> | null = null;

/**
 * Loading safety net: if Firestore (SDK load or reads) hangs — offline,
 * throttled, or denied — resolve to the last good (or bundled) catalog
 * instead of showing "Loading…" forever. Cleared by any settled publish.
 */
function armSettleFallback(): void {
  if (settleTimer) return;
  settleTimer = setTimeout(() => {
    settleTimer = null;
    const current = getShared();
    if (current.started && current.state.loading) {
      publish({ ...current.state, loading: false });
    }
  }, 8000);
}

function publish(state: CatalogState): void {
  const current = getShared();
  current.state = state;
  if (!state.loading && settleTimer) {
    clearTimeout(settleTimer);
    settleTimer = null;
  }
  for (const listener of [...current.listeners]) listener(state);
}

async function fetchRemoteCatalog(firestore: Firestore): Promise<{ catalog: Catalog; meta: RemoteCatalogMeta }> {
  const { collection, doc, getDoc, getDocs } = await import('firebase/firestore');
  const metaSnap = await getDoc(doc(firestore, CATALOG_DOC_PATH));
  if (!metaSnap.exists()) throw new Error('remote catalog: missing meta doc (sync has not run yet?)');
  const meta = parseMeta(metaSnap.data());
  const [cards, programs, merchants, loyalty, bankOffers] = await Promise.all([
    getDocs(collection(firestore, `${CATALOG_DOC_PATH}/cards`)),
    getDocs(collection(firestore, `${CATALOG_DOC_PATH}/programs`)),
    getDocs(collection(firestore, `${CATALOG_DOC_PATH}/merchants`)),
    getDocs(collection(firestore, `${CATALOG_DOC_PATH}/loyalty`)),
    getDocs(collection(firestore, `${CATALOG_DOC_PATH}/offers`)),
  ]);
  const catalog = assembleCatalog({
    dataAsOf: meta.dataAsOf,
    cards: cards.docs.map((d) => d.data()),
    programs: programs.docs.map((d) => d.data()),
    merchants: merchants.docs.map((d) => d.data()),
    loyalty: loyalty.docs.map((d) => d.data()),
    bankOffers: bankOffers.docs.map((d) => d.data()),
  });
  return { catalog, meta };
}

async function startShared(): Promise<void> {
  const first = getShared();
  if (first.started) return;
  first.started = true;
  armSettleFallback();
  try {
    const firestore = await db;
    // Staleness gate: a fresh bundled copy needs no collection reads at all.
    let stale = true;
    try {
      const { doc, getDoc } = await import('firebase/firestore');
      const metaSnap = await getDoc(doc(firestore, CATALOG_DOC_PATH));
      if (metaSnap.exists()) {
        const meta = parseMeta(metaSnap.data());
        publish({ ...getShared().state, meta });
        if (meta.dataAsOf === bundledCatalog.dataAsOf && Date.now() - readFreshAt() < FRESH_TTL_MS) {
          stale = false;
        }
      }
    } catch {
      stale = true;
    }
    if (!stale) {
      publish({ ...getShared().state, loading: false });
      return;
    }
    try {
      const { catalog, meta } = await fetchRemoteCatalog(firestore);
      writeFreshAt(Date.now());
      if (getShared().started) publish({ catalog, source: 'live', meta, loading: false });
    } catch {
      if (getShared().started) publish({ catalog: bundledCatalog, source: 'bundled', meta: null, loading: false });
      return;
    }
    // Meta-only listener: re-fetch collections only when a sync changes them.
    try {
      const { doc, onSnapshot } = await import('firebase/firestore');
      const unsub = onSnapshot(
        doc(firestore, CATALOG_DOC_PATH),
        (snap) => {
          void (async () => {
            try {
              if (!snap.exists()) return;
              const meta = parseMeta(snap.data());
              const current = getShared();
              if (!current.started || meta.dataAsOf === current.state.catalog.dataAsOf) return;
              const { catalog } = await fetchRemoteCatalog(firestore);
              writeFreshAt(Date.now());
              if (getShared().started) publish({ catalog, source: 'live', meta, loading: false });
            } catch {
              // Keep the last good state.
            }
          })();
        },
        () => {},
      );
      getShared().stop = unsub;
    } catch {
      // One-shot data stands without live updates.
    }
  } catch {
    publish({ catalog: bundledCatalog, source: 'bundled', meta: null, loading: false });
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function toIso(value: unknown): string | null {
  if (typeof value === 'string') return value;
  if (value instanceof Date) return value.toISOString();
  const maybe = value as { toDate?: () => Date } | null;
  if (maybe && typeof maybe.toDate === 'function') {
    try {
      return maybe.toDate().toISOString();
    } catch {
      return null;
    }
  }
  return null;
}

function asArray<T>(value: unknown, label: string): T[] {
  if (!Array.isArray(value)) throw new Error(`remote catalog: ${label} is not an array`);
  return value as T[];
}

/**
 * Assembles raw Firestore payloads into a validated Catalog. Throws on any
 * shape or referential-integrity problem so callers fall back to bundled data.
 */
export function assembleCatalog(input: {
  dataAsOf: unknown;
  cards: unknown;
  programs: unknown;
  merchants: unknown;
  loyalty: unknown;
  bankOffers: unknown;
}): Catalog {
  if (typeof input.dataAsOf !== 'string' || input.dataAsOf.length === 0) {
    throw new Error('remote catalog: missing dataAsOf');
  }
  const catalog: Catalog = {
    dataAsOf: input.dataAsOf,
    cards: asArray<CardSeed>(input.cards, 'cards'),
    programs: asArray<ProgramSeed>(input.programs, 'programs'),
    merchants: asArray<MerchantSeed>(input.merchants, 'merchants'),
    loyalty: asArray<LoyaltySeed>(input.loyalty, 'loyalty'),
    bankOffers: asArray<BankOfferSeed>(input.bankOffers, 'bankOffers'),
  };
  if (catalog.cards.length === 0) throw new Error('remote catalog: no cards');
  const errors = validateCatalog(catalog);
  if (errors.length > 0) throw new Error(`remote catalog invalid: ${errors.join('; ')}`);
  return catalog;
}

export function parseMeta(raw: unknown): RemoteCatalogMeta {
  if (!isRecord(raw) || typeof raw['dataAsOf'] !== 'string') {
    throw new Error('remote catalog: missing meta doc (sync has not run yet?)');
  }
  return {
    dataAsOf: raw['dataAsOf'],
    updatedAt: toIso(raw['updatedAt']),
    source: typeof raw['source'] === 'string' ? raw['source'] : 'unknown',
    snapshotRef: typeof raw['snapshotRef'] === 'string' ? raw['snapshotRef'] : null,
  };
}

/**
 * Active catalog: live Firestore data when available, bundled JSON otherwise.
 * One shared subscription serves every mounted page (ref-counted): the first
 * mount runs a staleness gate (one meta read + 24h local freshness stamp) and
 * otherwise one-shot-fetches the collections once, then listens to the meta
 * doc only. Navigating between pages reuses the shared state with zero reads.
 */
export function useCatalog(): CatalogState {
  const [state, setState] = useState<CatalogState>(() => getShared().state);

  useEffect(() => {
    const current = getShared();
    current.refs += 1;
    current.listeners.add(setState);
    setState(current.state);
    void startShared();
    return () => {
      current.listeners.delete(setState);
      current.refs -= 1;
      // Keep the last good state (and the single meta-doc listener) across
      // navigation: remounts reuse the cache with zero reads instead of
      // refetching every collection on each tab visit.
    };
  }, []);

  return state;
}

export function buildCatalogMaps(catalog: Catalog): {
  cardsById: Map<string, CardSeed>;
  programsById: Map<string, ProgramSeed>;
  merchantsById: Map<string, MerchantSeed>;
  loyaltyById: Map<string, LoyaltySeed>;
} {
  return {
    cardsById: new Map(catalog.cards.map((c) => [c.id, c])),
    programsById: new Map(catalog.programs.map((p) => [p.id, p])),
    merchantsById: new Map(catalog.merchants.map((m) => [m.id, m])),
    loyaltyById: new Map(catalog.loyalty.map((l) => [l.id, l])),
  };
}

/** Memoized id maps for the active catalog (replaces the static seed maps). */
export function useCatalogMaps(catalog: Catalog): ReturnType<typeof buildCatalogMaps> {
  return useMemo(() => buildCatalogMaps(catalog), [catalog]);
}
