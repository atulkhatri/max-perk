// Bundled sample merchant list; see cards.ts for the dataset note.

import sample from './sample-catalog.json';
import type { MerchantSeed } from '../types';

export const merchants = (sample as { merchants: MerchantSeed[] }).merchants;
