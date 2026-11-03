// Bundled sample catalog for public builds and first-run demos.
// The full issuer-researched catalog (96 cards, snapshots, refresh ritual)
// is the maintainer's local-only dataset and is NOT committed: see README
// "Full catalog (maintainers)". This sample keeps every collection shape and
// the ids the demo seed + tests rely on.

import sample from './sample-catalog.json';
import type { CardSeed } from '../types';

export const DATA_AS_OF: string = (sample as { dataAsOf: string }).dataAsOf;

export const cards = (sample as { cards: CardSeed[] }).cards;
