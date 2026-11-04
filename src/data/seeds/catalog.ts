import type { Catalog } from '../types';
import { DATA_AS_OF, cards } from './cards';
import { loyaltyPrograms } from './loyalty';
import { merchants } from './merchants';
import { bankOffers } from './offers';
import { programs } from './programs';

export const catalog: Catalog = {
  dataAsOf: DATA_AS_OF,
  cards,
  programs,
  merchants,
  loyalty: loyaltyPrograms,
  bankOffers,
};

/** Referential-integrity check for seeds; exercised by tests and at startup in dev. */
export function validateCatalog(cat: Catalog): string[] {
  const errors: string[] = [];
  const cardIds = new Set(cat.cards.map((c) => c.id));
  const programIds = new Set(cat.programs.map((p) => p.id));
  const merchantIds = new Set(cat.merchants.map((m) => m.id));
  const loyaltyIds = new Set(cat.loyalty.map((l) => l.id));

  for (const card of cat.cards) {
    if (!programIds.has(card.programId)) errors.push(`card ${card.id}: unknown program ${card.programId}`);
    if (card.kind !== 'credit' && card.kind !== 'debit') errors.push(`card ${card.id}: unknown kind ${card.kind}`);
    if (card.segment !== 'personal' && card.segment !== 'business') {
      errors.push(`card ${card.id}: unknown segment ${card.segment}`);
    }
    for (const merchantId of Object.keys(card.merchantRates ?? {})) {
      if (!merchantIds.has(merchantId)) errors.push(`card ${card.id}: unknown merchantRate ${merchantId}`);
    }
    for (const merchantId of card.fuel?.merchants ?? []) {
      if (!merchantIds.has(merchantId)) errors.push(`card ${card.id}: unknown fuel merchant ${merchantId}`);
    }
  }
  for (const merchant of cat.merchants) {
    if (merchant.storeCardId && !cardIds.has(merchant.storeCardId)) {
      errors.push(`merchant ${merchant.id}: unknown storeCard ${merchant.storeCardId}`);
    }
    if (merchant.loyaltyId && !loyaltyIds.has(merchant.loyaltyId)) {
      errors.push(`merchant ${merchant.id}: unknown loyalty ${merchant.loyaltyId}`);
    }
  }
  for (const offer of cat.bankOffers) {
    if (offer.appliesTo !== 'all') {
      for (const cardId of offer.appliesTo.cards) {
        if (!cardIds.has(cardId)) errors.push(`offer ${offer.id}: unknown card ${cardId}`);
      }
    }
  }
  return errors;
}
