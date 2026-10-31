import { describe, expect, it } from 'vitest';
import { catalog, validateCatalog } from '../data/seeds/catalog';
import type { CardSeed, Catalog, MerchantSeed, ProgramSeed } from '../data/types';
import { annualValue, programCpp, rankForCheck, rankForPurchase, resolvePurchaseMerchant, suggestNewCards } from './rank';

function fixtureCard(overrides: Partial<CardSeed> & { id: string }): CardSeed {
  return {
    name: overrides.id,
    issuer: 'Test Bank',
    network: 'Visa',
    kind: 'credit',
    segment: 'personal',
    annualFeeCAD: 0,
    programId: 'test-program',
    earn: {},
    caps: [],
    conditions: [],
    rankingNotes: [],
    benefits: {
      extendedWarranty: { offered: false },
      purchaseProtection: { offered: false },
      rentalCarInsurance: { offered: false },
      travelMedical: { offered: false },
      hotelPerks: { offered: false },
    },
    dataAsOf: '2026-10-27',
    sourceUrls: [],
    uncertain: [],
    ...overrides,
  };
}

const fixtureProgram: ProgramSeed = {
  id: 'test-program',
  name: 'Test Program',
  typicalCpp: 1.0,
  methodology: 'Face value.',
  redemption: [],
};

const fixtureMerchant: MerchantSeed = {
  id: 'test-store',
  name: 'Test Store',
  earn: 'grocery',
  context: 'general',
};

function fixtureCatalog(cards: CardSeed[], merchant: MerchantSeed = fixtureMerchant): Catalog {
  return {
    dataAsOf: '2026-10-27',
    cards,
    programs: [fixtureProgram],
    merchants: [merchant],
    loyalty: [],
    bankOffers: [],
  };
}

describe('catalog seeds', () => {
  it('passes referential-integrity validation', () => {
    expect(validateCatalog(catalog)).toEqual([]);
  });

  it('covers the full researched catalog (12 seeds + 84 census cards)', () => {
    expect(catalog.cards).toHaveLength(96);
    expect(catalog.cards.filter((c) => c.segment === 'business')).toHaveLength(32);
    expect(catalog.programs).toHaveLength(30);
  });
});

describe('rewards ranking', () => {
  it('computes a plain category bonus (Cobalt grocery)', () => {
    const result = rankForCheck(catalog, ['amex-cobalt'], 'loblaws', 100);
    const row = result?.ranked.find((r) => r.card.id === 'amex-cobalt');
    expect(row?.points).toBe(500);
    expect(row?.valueCAD).toBeCloseTo(10.0, 2);
  });

  it('applies merchant-specific rates (PC at Loblaws vs Sobeys)', () => {
    const atLoblaws = rankForCheck(catalog, ['pc-financial'], 'loblaws', 100);
    const atSobeys = rankForCheck(catalog, ['pc-financial'], 'sobeys', 100);
    expect(atLoblaws?.ranked[0]?.points).toBe(3000);
    expect(atLoblaws?.ranked[0]?.valueCAD).toBeCloseTo(3.0, 2);
    expect(atSobeys?.ranked[0]?.points).toBe(1000);
    expect(atSobeys?.ranked[0]?.valueCAD).toBeCloseTo(1.0, 2);
  });

  it('blends rates when an earn cap is exceeded (BMO grocery)', () => {
    const under = rankForCheck(catalog, ['bmo-cashback'], 'loblaws', 100);
    const over = rankForCheck(catalog, ['bmo-cashback'], 'loblaws', 600);
    expect(under?.ranked[0]?.points).toBe(500);
    expect(under?.ranked[0]?.capApplied).toBe(false);
    expect(over?.ranked[0]?.points).toBe(500 * 5 + 100 * 1);
    expect(over?.ranked[0]?.capApplied).toBe(true);
  });

  it('handles monthly tiered caps (BMO transit)', () => {
    const result = rankForCheck(catalog, ['bmo-cashback'], 'transit-fare', 400);
    expect(result?.ranked[0]?.points).toBe(300 * 4 + 100 * 1);
  });

  it('falls back to a $100 reference basket without spend', () => {
    const result = rankForCheck(catalog, ['amex-cobalt'], 'loblaws');
    expect(result?.spendUsed).toBe(100);
    expect(result?.spendEntered).toBe(false);
    expect(result?.assumptions.some((a) => a.text.includes('$100 reference basket'))).toBe(true);
  });

  it('converts per-litre fuel earn (PC at Esso)', () => {
    const result = rankForCheck(catalog, ['pc-financial'], 'esso', 150);
    // $150 at $1.50/L = 100 L × 3¢ = $3.00
    expect(result?.ranked[0]?.valueCAD).toBeCloseTo(3.0, 2);
  });

  it('returns null for an unknown merchant', () => {
    expect(rankForCheck(catalog, ['amex-cobalt'], 'nope')).toBeNull();
  });
});

describe('category override and custom stores', () => {
  it('returns the tracked merchant unchanged without an override', () => {
    const merchant = resolvePurchaseMerchant(catalog, {
      merchantId: 'loblaws',
      earn: 'grocery',
      context: 'general',
      customName: 'Loblaws',
    });
    expect(merchant).toBe(catalog.merchants.find((m) => m.id === 'loblaws'));
  });

  it('ranks an unknown store by the chosen category', () => {
    const custom = resolvePurchaseMerchant(catalog, {
      earn: 'grocery',
      context: 'general',
      customName: 'FreshCo',
    });
    expect(custom.name).toBe('FreshCo');
    const result = rankForPurchase(catalog, ['amex-cobalt'], custom, 100);
    expect(result?.mode).toBe('rewards');
    expect(result?.ranked[0]?.points).toBe(500);
  });

  it('honours a category override at a tracked store', () => {
    const card = fixtureCard({ id: 'flex', earn: { grocery: 5, dining: 1 } });
    const cat = fixtureCatalog([card]);
    const overridden = resolvePurchaseMerchant(cat, {
      merchantId: 'test-store',
      earn: 'dining',
      context: 'general',
      customName: 'Test Store',
    });
    expect(overridden.storeCardId).toBeUndefined();
    const result = rankForPurchase(cat, ['flex'], overridden, 100);
    expect(result?.ranked[0]?.points).toBe(100);
    expect(result?.assumptions.some((a) => a.text.includes('chosen category'))).toBe(true);
  });

  it('switches to coverage mode for a benefit-sensitive context', () => {
    const custom = resolvePurchaseMerchant(catalog, {
      earn: 'travel',
      context: 'carRental',
      customName: 'Discount Car Rental',
    });
    const result = rankForPurchase(catalog, ['amex-cobalt'], custom, 100);
    expect(result?.mode).toBe('coverage');
  });
});

describe('coverage-first ranking', () => {
  const electronics: MerchantSeed = { ...fixtureMerchant, id: 'circuit', earn: 'other', context: 'electronics' };
  const highRewardsNoCoverage = fixtureCard({
    id: 'plain-plus',
    earn: { other: 5 },
    benefits: {
      extendedWarranty: { offered: false },
      purchaseProtection: { offered: false },
      rentalCarInsurance: { offered: false },
      travelMedical: { offered: false },
      hotelPerks: { offered: false },
    },
  });
  const lowRewardsWithCoverage = fixtureCard({
    id: 'shield',
    earn: { other: 1 },
    benefits: {
      extendedWarranty: { offered: true, note: 'Doubles the warranty.' },
      purchaseProtection: { offered: true, note: '90-day protection.' },
      rentalCarInsurance: { offered: false },
      travelMedical: { offered: false },
      hotelPerks: { offered: false },
    },
  });

  it('ranks coverage above rewards for benefit-sensitive purchases', () => {
    const cat = fixtureCatalog([highRewardsNoCoverage, lowRewardsWithCoverage], electronics);
    const result = rankForCheck(cat, ['plain-plus', 'shield'], 'circuit', 100);
    expect(result?.mode).toBe('coverage');
    expect(result?.ranked[0]?.card.id).toBe('shield');
    expect(result?.ranked[0]?.coverageNotes).toHaveLength(2);
  });

  it('ranks by value for general purchases', () => {
    const cat = fixtureCatalog([highRewardsNoCoverage, lowRewardsWithCoverage]);
    const result = rankForCheck(cat, ['plain-plus', 'shield'], 'test-store', 100);
    expect(result?.mode).toBe('rewards');
    expect(result?.ranked[0]?.card.id).toBe('plain-plus');
  });
});

describe('store-card comparison', () => {
  it('includes an unowned store card and can rank it first', () => {
    const result = rankForCheck(catalog, ['tangerine'], 'walmart', 100);
    const storeRow = result?.ranked.find((r) => r.card.id === 'walmart');
    expect(storeRow?.owned).toBe(false);
    expect(result?.ranked[0]?.card.id).toBe('walmart');
  });

  it('shows when an owned card beats the store card', () => {
    const result = rankForCheck(catalog, ['amex-cobalt'], 'walmart', 100);
    expect(result?.ranked[0]?.card.id).toBe('amex-cobalt');
  });
});

describe('bank-offer factoring', () => {
  it('adds applicable card-specific offers to value', () => {
    const result = rankForCheck(catalog, ['amex-cobalt'], 'pizza-hut', 100);
    const row = result?.ranked.find((r) => r.card.id === 'amex-cobalt');
    expect(row?.offerValueCAD).toBe(20);
    expect(row?.totalValueCAD).toBeCloseTo(row!.valueCAD + 20, 2);
    expect(row?.appliedOfferIds).toEqual(['offer-delivery-20']);
  });

  it('respects offer minimum spend', () => {
    const small = rankForCheck(catalog, ['scotia-momentum'], 'streaming', 100);
    const large = rankForCheck(catalog, ['scotia-momentum'], 'streaming', 200);
    expect(small?.ranked.find((r) => r.card.id === 'scotia-momentum')?.offerValueCAD).toBe(0);
    expect(large?.ranked.find((r) => r.card.id === 'scotia-momentum')?.offerValueCAD).toBe(15);
  });
});

describe('new-card suggester', () => {
  it('suggests a stronger card with incremental value', () => {
    const suggestions = suggestNewCards(catalog, ['walmart']);
    const cobalt = suggestions.find((s) => s.card.id === 'amex-cobalt');
    expect(cobalt).toBeDefined();
    expect(cobalt!.incrementalCAD).toBeGreaterThanOrEqual(50);
  });

  it('suggests only within owned segments (no business cards for personal wallets)', () => {
    const suggestions = suggestNewCards(catalog, ['walmart']);
    expect(suggestions.length).toBeGreaterThan(0);
    expect(suggestions.every((s) => s.card.segment === 'personal')).toBe(true);
  });

  it('suggests business cards once a business card is owned', () => {
    const suggestions = suggestNewCards(catalog, ['rbc-cashback-biz']);
    expect(suggestions.some((s) => s.card.segment === 'business')).toBe(true);
  });

  it('never suggests debit cards (debit earns nothing to recommend)', () => {
    const cat = fixtureCatalog([
      fixtureCard({ id: 'owned-credit', earn: { other: 0.5 } }),
      fixtureCard({ id: 'rich-debit', kind: 'debit', earn: { other: 99 } }),
    ]);
    expect(suggestNewCards(cat, ['owned-credit']).some((s) => s.card.kind === 'debit')).toBe(false);
  });

  it('ranks the full 96-card catalog without NaN or crashes', () => {
    const ids = catalog.cards.map((c) => c.id);
    for (const merchantId of ['loblaws', 'esso', 'best-buy']) {
      const result = rankForCheck(catalog, ids, merchantId, 250);
      expect(result?.ranked.length).toBeGreaterThan(0);
      for (const row of result!.ranked) {
        expect(Number.isFinite(row.totalValueCAD)).toBe(true);
      }
    }
  });

  it('suggests nothing for an empty wallet or a complete wallet', () => {
    expect(suggestNewCards(catalog, [])).toEqual([]);
    expect(suggestNewCards(catalog, catalog.cards.map((c) => c.id))).toEqual([]);
  });

  it('honours caps in annual value (BMO grocery)', () => {
    const bmo = catalog.cards.find((c) => c.id === 'bmo-cashback');
    const groceryOnly = [{ category: 'grocery' as const, monthlyCAD: 600 }];
    // $7,200/yr grocery vs $6,000 annualized cap: 6000×5 + 1200×1 = 31,200 pts = $312
    expect(annualValue(catalog, bmo!, groceryOnly)).toBeCloseTo(312, 0);
  });
});

describe('issuer-verified corrections (Oct 2026)', () => {
  it('removes the expired Rogers 1.5x redemption: cpp is face value', () => {
    const rogers = catalog.cards.find((c) => c.id === 'rogers-red');
    expect(programCpp(catalog, rogers!)).toBe(1.0);
  });

  it('models post-Nov-18 5% Rogers purchases on the phone bill', () => {
    const result = rankForCheck(catalog, ['rogers-red'], 'phone-bill', 100);
    expect(result?.ranked[0]?.points).toBe(500);
  });

  it('drops rogers-red from the delivery-app credit offer', () => {
    const result = rankForCheck(catalog, ['rogers-red'], 'pizza-hut', 100);
    expect(result?.ranked.find((r) => r.card.id === 'rogers-red')?.offerValueCAD).toBe(0);
  });

  it('uses official PC tier rates (World 20 at Loblaws, 35 at Shoppers)', () => {
    const loblaws = rankForCheck(catalog, ['pc-world'], 'loblaws', 100);
    const shoppers = rankForCheck(catalog, ['pc-world'], 'shoppers', 100);
    expect(loblaws?.ranked[0]?.points).toBe(2000);
    expect(shoppers?.ranked[0]?.points).toBe(3500);
  });

  it('links every card-level assumption to its official source', () => {
    const result = rankForCheck(catalog, ['rogers-red'], 'phone-bill', 100);
    const cardNotes = result?.ranked[0]?.assumptions ?? [];
    expect(cardNotes.length).toBeGreaterThan(0);
    for (const a of cardNotes) {
      expect(a.sourceUrl).toMatch(/^https:\/\//);
    }
  });

  it('surfaces Amex Platinum dining/travel credit tips without forcing the suggestion', () => {
    const result = rankForCheck(catalog, ['amex-platinum', 'amex-cobalt'], 'pizza-hut', 100);
    const plat = result?.ranked.find((r) => r.card.id === 'amex-platinum');
    expect(plat?.tips.some((t) => t.label.includes('Dining'))).toBe(true);
    expect(result?.ranked[0]?.card.id).toBe('amex-cobalt');
  });
});
