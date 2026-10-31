// Bundled merchant list, backed by data/catalog.curated.json.

import curated from '../../../data/catalog.curated.json';
import type { MerchantSeed } from '../types';

export const merchants = curated.merchants as MerchantSeed[];
