// Bundled card catalog, backed by data/catalog.curated.json (the single source
// of truth shared with the issuer-fetch and Firestore-sync scripts).
// Curated from issuer pages; see data/README.md for the refresh ritual.
// Welcome bonuses are excluded as rotating. Fields listed in `uncertain` are
// best-effort estimates — confirm with the issuer.

import curated from '../../../data/catalog.curated.json';
import type { CardSeed } from '../types';

export const DATA_AS_OF: string = curated.dataAsOf;

export const cards = curated.cards as CardSeed[];
