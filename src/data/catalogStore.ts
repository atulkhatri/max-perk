// Live catalog from Firestore (/catalog/v1*), with the bundled JSON catalog as
// the offline/error fallback. Reads are public (see firestore.rules), so no
// sign-in is needed; writes happen only through scripts/sync-catalog-*.mjs.

import {
  collection,
  doc,
  onSnapshot,
  type Firestore,
  type Unsubscribe,
} from 'firebase/firestore';
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

export type CatalogUpdate =
  | { status: 'ready'; catalog: Catalog; meta: RemoteCatalogMeta }
  | { status: 'error'; error: Error };

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
 * Live subscription to the Firestore catalog. Emits `ready` once the meta doc
 * plus all five collections have arrived, again on any later change, and
 * `error` when the remote catalog is missing, invalid, or unreachable (the
 * hook below falls back to the bundled catalog in that case).
 */
export function subscribeCatalog(
  firestore: Firestore,
  onChange: (update: CatalogUpdate) => void,
): Unsubscribe {
  const cache: {
    meta?: Record<string, unknown>;
    cards?: unknown[];
    programs?: unknown[];
    merchants?: unknown[];
    loyalty?: unknown[];
    bankOffers?: unknown[];
  } = {};
  const have = new Set<string>();

  const fail = (error: Error): void => onChange({ status: 'error', error });

  const tryEmit = (): void => {
    if (have.size < 6 || cache.meta === undefined) return;
    try {
      const meta = parseMeta(cache.meta);
      const catalog = assembleCatalog({
        dataAsOf: meta.dataAsOf,
        cards: cache.cards,
        programs: cache.programs,
        merchants: cache.merchants,
        loyalty: cache.loyalty,
        bankOffers: cache.bankOffers,
      });
      onChange({ status: 'ready', catalog, meta });
    } catch (e) {
      fail(e instanceof Error ? e : new Error(String(e)));
    }
  };

  const watchDoc = (key: 'meta', path: string): Unsubscribe =>
    onSnapshot(
      doc(firestore, path),
      (snap) => {
        if (!snap.exists()) {
          fail(new Error('remote catalog: missing meta doc (sync has not run yet?)'));
          return;
        }
        cache.meta = snap.data();
        have.add(key);
        tryEmit();
      },
      (error) => fail(error instanceof Error ? error : new Error(String(error))),
    );

  const watchCollection = (
    key: 'cards' | 'programs' | 'merchants' | 'loyalty' | 'bankOffers',
    path: string,
  ): Unsubscribe =>
    onSnapshot(
      collection(firestore, path),
      (snap) => {
        cache[key] = snap.docs.map((d) => d.data());
        have.add(key);
        tryEmit();
      },
      (error) => fail(error instanceof Error ? error : new Error(String(error))),
    );

  const unsubs = [
    watchDoc('meta', CATALOG_DOC_PATH),
    watchCollection('cards', `${CATALOG_DOC_PATH}/cards`),
    watchCollection('programs', `${CATALOG_DOC_PATH}/programs`),
    watchCollection('merchants', `${CATALOG_DOC_PATH}/merchants`),
    watchCollection('loyalty', `${CATALOG_DOC_PATH}/loyalty`),
    watchCollection('bankOffers', `${CATALOG_DOC_PATH}/offers`),
  ];
  return () => {
    for (const unsub of unsubs) unsub();
  };
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

/** Active catalog: live Firestore data when available, bundled JSON otherwise. */
export function useCatalog(): CatalogState {
  const [state, setState] = useState<CatalogState>({
    catalog: bundledCatalog,
    source: 'bundled',
    meta: null,
    loading: true,
  });

  useEffect(() => {
    const unsub = subscribeCatalog(db, (update) => {
      if (update.status === 'ready') {
        setState({ catalog: update.catalog, source: 'live', meta: update.meta, loading: false });
      } else {
        setState({ catalog: bundledCatalog, source: 'bundled', meta: null, loading: false });
      }
    });
    return unsub;
  }, []);

  return state;
}

/** Memoized id maps for the active catalog (replaces the static seed maps). */
export function useCatalogMaps(catalog: Catalog): ReturnType<typeof buildCatalogMaps> {
  return useMemo(() => buildCatalogMaps(catalog), [catalog]);
}
