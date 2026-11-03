// Sample illustrative offer (rotating in real life; never a live bank feed).
// See cards.ts for the dataset note.

import sample from './sample-catalog.json';
import type { BankOfferSeed } from '../types';

export const bankOffers = (sample as { bankOffers: BankOfferSeed[] }).bankOffers;
