// v1 tracks a small DEFINED set of representative offers. These rotate in
// real life and vary by customer, so every entry is illustrative sample data
// — never presented as a live bank feed. Backed by data/catalog.curated.json.

import curated from '../../../data/catalog.curated.json';
import type { BankOfferSeed } from '../types';

export const bankOffers = curated.bankOffers as BankOfferSeed[];
