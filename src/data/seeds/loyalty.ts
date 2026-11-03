// Bundled sample loyalty programs; see cards.ts for the dataset note.

import sample from './sample-catalog.json';
import type { LoyaltySeed } from '../types';

export const loyaltyPrograms = (sample as { loyalty: LoyaltySeed[] }).loyalty;
