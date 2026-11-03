import { describe, expect, it } from 'vitest';
import { catalog, validateCatalog } from '../data/seeds/catalog';
import type { BankOfferSeed, CardSeed, Catalog, MerchantSeed, ProgramSeed } from '../data/types';
import { annualValue, programCpp, rankForCheck, rankForPurchase, resolvePurchaseMerchant, suggestFromStatements, suggestNewCards, transactionCoverageMonths, valueOfTransactions } from './rank';

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

  it('covers the bundled sample catalog', () => {
    expect(catalog.cards).toHaveLength(6);
    expect(catalog.programs).toHaveLength(6);
    expect(catalog.merchants).toHaveLength(6);
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

  it('falls back to a $100 example purchase without spend', () => {
    const result = rankForCheck(catalog, ['amex-cobalt'], 'loblaws');
    expect(result?.spendUsed).toBe(100);
    expect(result?.spendEntered).toBe(false);
    expect(result?.assumptions.some((a) => a.text.includes('$100 example purchase'))).toBe(true);
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
  function storeCatalog(): Catalog {
    return fixtureCatalog(
      [
        fixtureCard({ id: 'owned-flat', earn: { grocery: 1 } }),
        fixtureCard({ id: 'store-card', earn: { grocery: 3 } }),
      ],
      { ...fixtureMerchant, storeCardId: 'store-card' },
    );
  }

  it('includes an unowned store card and can rank it first', () => {
    const cat = storeCatalog();
    const result = rankForPurchase(cat, ['owned-flat'], cat.merchants[0], 100);
    const storeRow = result.ranked.find((r) => r.card.id === 'store-card');
    expect(storeRow?.owned).toBe(false);
    expect(result.ranked[0]?.card.id).toBe('store-card');
  });

  it('shows when an owned card beats the store card', () => {
    const cat = fixtureCatalog(
      [
        fixtureCard({ id: 'owned-best', earn: { grocery: 5 } }),
        fixtureCard({ id: 'store-card', earn: { grocery: 3 } }),
      ],
      { ...fixtureMerchant, storeCardId: 'store-card' },
    );
    const result = rankForPurchase(cat, ['owned-best'], cat.merchants[0], 100);
    expect(result.ranked[0]?.card.id).toBe('owned-best');
  });
});

describe('bank-offer factoring', () => {
  function offerCatalog(): Catalog {
    const base = fixtureCatalog([fixtureCard({ id: 'offer-card', earn: { recurring: 1 } })], {
      ...fixtureMerchant,
      id: 'stream',
      name: 'Stream',
      earn: 'recurring',
    });
    const offers: BankOfferSeed[] = [
      {
        id: 'offer-recurring-15',
        label: '10% back on streaming (up to $15)',
        detail: '10% back on recurring streaming spend.',
        valueCAD: 15,
        minSpendCAD: 150,
        appliesTo: { cards: ['offer-card'] },
        categories: ['recurring'],
        conditions: 'Activate first.',
        illustrative: true,
      },
    ];
    return { ...base, bankOffers: offers };
  }

  it('adds applicable card-specific offers to value', () => {
    const cat = offerCatalog();
    const result = rankForPurchase(cat, ['offer-card'], cat.merchants[0], 250);
    const row = result.ranked.find((r) => r.card.id === 'offer-card');
    expect(row?.offerValueCAD).toBe(15);
    expect(row?.totalValueCAD).toBeCloseTo(row!.valueCAD + 15, 2);
    expect(row?.appliedOfferIds).toEqual(['offer-recurring-15']);
  });

  it('respects offer minimum spend', () => {
    const cat = offerCatalog();
    const small = rankForPurchase(cat, ['offer-card'], cat.merchants[0], 100);
    const large = rankForPurchase(cat, ['offer-card'], cat.merchants[0], 200);
    expect(small.ranked.find((r) => r.card.id === 'offer-card')?.offerValueCAD).toBe(0);
    expect(large.ranked.find((r) => r.card.id === 'offer-card')?.offerValueCAD).toBe(15);
  });
});

describe('new-card suggester', () => {
  function segmentCatalog(): Catalog {
    return fixtureCatalog([
      fixtureCard({ id: 'owned-flat', earn: { other: 1 } }),
      fixtureCard({ id: 'rich-personal', earn: { other: 5 } }),
      fixtureCard({ id: 'biz-basic', segment: 'business', earn: { other: 1 } }),
      fixtureCard({ id: 'biz-plus', segment: 'business', earn: { other: 5 } }),
    ]);
  }

  it('suggests a stronger card with incremental value', () => {
    const cat = fixtureCatalog([
      fixtureCard({ id: 'owned-flat', earn: { other: 1 } }),
      fixtureCard({ id: 'rich-card', earn: { other: 5 } }),
    ]);
    const suggestions = suggestNewCards(cat, ['owned-flat']);
    const rich = suggestions.find((s) => s.card.id === 'rich-card');
    expect(rich).toBeDefined();
    expect(rich!.incrementalCAD).toBeGreaterThanOrEqual(50);
  });

  it('suggests only within owned segments (no business cards for personal wallets)', () => {
    const suggestions = suggestNewCards(segmentCatalog(), ['owned-flat']);
    expect(suggestions.length).toBeGreaterThan(0);
    expect(suggestions.every((s) => s.card.segment === 'personal')).toBe(true);
  });

  it('suggests business cards once a business card is owned', () => {
    const suggestions = suggestNewCards(segmentCatalog(), ['owned-flat', 'biz-basic']);
    expect(suggestions.some((s) => s.card.id === 'biz-plus')).toBe(true);
  });

  it('never suggests debit cards (debit earns nothing to recommend)', () => {
    const cat = fixtureCatalog([
      fixtureCard({ id: 'owned-credit', earn: { other: 0.5 } }),
      fixtureCard({ id: 'rich-debit', kind: 'debit', earn: { other: 99 } }),
    ]);
    expect(suggestNewCards(cat, ['owned-credit']).some((s) => s.card.kind === 'debit')).toBe(false);
  });

  it('ranks the bundled sample catalog without NaN or crashes', () => {
    const ids = catalog.cards.map((c) => c.id);
    for (const merchantId of ['loblaws', 'esso', 'shoppers']) {
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

  it('values real transactions with monthly caps', () => {
    const cat = fixtureCatalog([
      fixtureCard({ id: 'owned-flat', earn: { other: 1 } }),
      fixtureCard({
        id: 'capped',
        earn: { other: 2 },
        caps: [{ categories: ['other'], period: 'month', limitCAD: 40, rateAfter: 0 }],
      }),
    ]);
    const txns = [{ date: '2026-09-05', amountCAD: 100, category: 'other' as const }];
    // Flat: 100 pts in one month, annualized ×12 at 1cpp = $12.
    expect(valueOfTransactions(cat, cat.cards[0], txns)).toBeCloseTo(12, 5);
    // Capped: 40×2 + 60×0 = 80 pts → $9.60.
    expect(valueOfTransactions(cat, cat.cards[1], txns)).toBeCloseTo(9.6, 5);
    expect(valueOfTransactions(cat, cat.cards[0], [])).toBe(0);
  });

  it('compares an owned card against candidates on its own transactions', () => {
    const cat = fixtureCatalog([
      fixtureCard({ id: 'owned-flat', earn: { other: 1 } }),
      fixtureCard({ id: 'dining-star', earn: { dining: 5 } }),
    ]);
    const groups = [
      { cardId: 'owned-flat', transactions: [{ date: '2026-09-05', amountCAD: 500, category: 'dining' as const }] },
    ];
    const out = suggestFromStatements(cat, ['owned-flat'], groups);
    expect(out).toHaveLength(1);
    expect(out[0].card.id).toBe('dining-star');
    expect(out[0].forCardId).toBe('owned-flat');
    // Owned earns 500×1, challenger 500×5, annualized: (2000×12)/100 = $240.
    expect(out[0].incrementalCAD).toBeCloseTo(240, 5);
  });

  it('counts coverage months across transactions', () => {
    expect(
      transactionCoverageMonths([
        { date: '2026-09-05', amountCAD: 1, category: 'other' },
        { date: '2026-10-05', amountCAD: 1, category: 'other' },
      ]),
    ).toBe(2);
    expect(transactionCoverageMonths([])).toBe(1);
  });

  it('re-ranks with a custom spend profile', () => {
    const cat = fixtureCatalog([
      fixtureCard({ id: 'owned-flat', earn: { other: 1 } }),
      fixtureCard({ id: 'dining-star', earn: { dining: 5 } }),
    ]);
    const boosted = suggestNewCards(cat, ['owned-flat'], 50, { dining: 1000 });
    expect(boosted.some((s) => s.card.id === 'dining-star')).toBe(true);
    const starved = suggestNewCards(cat, ['owned-flat'], 50, {
      grocery: 0,
      dining: 0,
      gas: 0,
      travel: 0,
      recurring: 0,
      other: 0,
    });
    expect(starved).toEqual([]);
  });
});

describe('sample-data guards', () => {
  it('values cash-back programs at face value', () => {
    const scotia = catalog.cards.find((c) => c.id === 'scotia-momentum');
    expect(programCpp(catalog, scotia!)).toBe(1.0);
  });

  it('applies a category-scoped offer to nothing outside its category', () => {
    const cat = fixtureCatalog([fixtureCard({ id: 'diner', earn: { dining: 2 } })], {
      ...fixtureMerchant,
      id: 'bistro',
      name: 'Bistro',
      earn: 'dining',
    });
    const offers: BankOfferSeed[] = [
      {
        id: 'offer-recurring-15',
        label: '10% back on streaming (up to $15)',
        detail: '10% back on recurring streaming spend.',
        valueCAD: 15,
        minSpendCAD: 150,
        appliesTo: { cards: ['diner'] },
        categories: ['recurring'],
        conditions: 'Activate first.',
        illustrative: true,
      },
    ];
    const scoped: Catalog = { ...cat, bankOffers: offers };
    const result = rankForPurchase(scoped, ['diner'], scoped.merchants[0], 200);
    const row = result.ranked.find((r) => r.card.id === 'diner');
    expect(row?.offerValueCAD).toBe(0);
    expect(row?.appliedOfferIds).toEqual([]);
  });

  it('breaks equal-value ties by preferring the lower annual fee', () => {
    const pricey = fixtureCard({ id: 'tie-pricey', annualFeeCAD: 120, earn: { other: 1 } });
    const free = fixtureCard({ id: 'tie-free', annualFeeCAD: 0, earn: { other: 1 } });
    const merchant: MerchantSeed = { ...fixtureMerchant, id: 'tie-store', name: 'Tie Store', earn: 'other' };
    const tieCatalog = fixtureCatalog([pricey, free], merchant);
    const result = rankForPurchase(tieCatalog, ['tie-pricey', 'tie-free'], merchant, 100);
    expect(result.ranked.map((r) => r.card.id)).toEqual(['tie-free', 'tie-pricey']);
  });

  it('applies no blanket grocery offer to every card (no official source)', () => {
    const result = rankForCheck(catalog, ['amex-cobalt', 'tangerine'], 'loblaws', 100);
    for (const row of result?.ranked ?? []) {
      expect(row.offerValueCAD).toBe(0);
      expect(row.appliedOfferIds).toEqual([]);
    }
  });

  it('links card-level assumptions to an https source', () => {
    const result = rankForCheck(catalog, ['tangerine'], 'loblaws', 100);
    const note = result?.ranked[0]?.assumptions.find((a) => a.text.includes('2% Tangerine'));
    expect(note?.sourceUrl).toMatch(/^https:\/\//);
  });

  it('surfaces usage tips without forcing the suggestion', () => {
    const tipster = fixtureCard({
      id: 'tipster',
      earn: { dining: 1 },
      tips: [{ label: 'Dining tip', detail: 'Pick dining as a bonus category.', categories: ['dining'] }],
    });
    const winner = fixtureCard({ id: 'winner', earn: { dining: 5 } });
    const cat = fixtureCatalog([tipster, winner], { ...fixtureMerchant, earn: 'dining' });
    const result = rankForPurchase(cat, ['tipster', 'winner'], cat.merchants[0], 100);
    expect(result.ranked.find((r) => r.card.id === 'tipster')?.tips.some((t) => t.label.includes('Dining'))).toBe(
      true,
    );
    expect(result.ranked[0]?.card.id).toBe('winner');
  });
});
