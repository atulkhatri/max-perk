// Bundled loyalty programs, backed by data/catalog.curated.json.

import curated from '../../../data/catalog.curated.json';
import type { LoyaltySeed } from '../types';

export const loyaltyPrograms = curated.loyalty as LoyaltySeed[];
