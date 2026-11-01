// Pure rewards-ranking engine. No React, no Firebase: every function is a
// deterministic transformation of (catalog, wallet, purchase) and is covered
// by rank.test.ts.

import type {
  Assumption,
  BenefitKey,
  CardSeed,
  CardTip,
  Catalog,
  EarnCategory,
  MerchantSeed,
  PurchaseContext,
} from '../data/types';

export const REFERENCE_SPEND = 100;
export const REFERENCE_FUEL_PRICE = 1.5;
export const SUGGEST_THRESHOLD_CAD = 50;

/** Default monthly spend profile used by the new-card suggester (stated in UI). */
export const DEFAULT_SPEND_PROFILE: { category: EarnCategory; monthlyCAD: number }[] = [
  { category: 'grocery', monthlyCAD: 600 },
  { category: 'dining', monthlyCAD: 200 },
  { category: 'gas', monthlyCAD: 150 },
  { category: 'travel', monthlyCAD: 100 },
  { category: 'recurring', monthlyCAD: 150 },
  { category: 'other', monthlyCAD: 300 },
];

const COVERAGE_PERKS: Record<Exclude<PurchaseContext, 'general'>, BenefitKey[]> = {
  electronics: ['extendedWarranty', 'purchaseProtection'],
  carRental: ['rentalCarInsurance'],
  hotels: ['travelMedical', 'hotelPerks'],
};

export interface RankedCard {
  card: CardSeed;
  owned: boolean;
  points: number;
  /** Blended earn rate actually applied (points per $1). */
  earnRate: number;
  cpp: number;
  valueCAD: number;
  offerValueCAD: number;
  totalValueCAD: number;
  appliedOfferLabels: string[];
  /** Offer ids applied to this card (for per-card detail display). */
  appliedOfferIds: string[];
  assumptions: Assumption[];
  /** Usage tips relevant to this purchase; display-only, never ranking math. */
  tips: CardTip[];
  capApplied: boolean;
  coverageScore: number;
  coverageNotes: string[];
}

export interface RankResult {
  merchant: MerchantSeed;
  ranked: RankedCard[];
  mode: 'rewards' | 'coverage';
  spendUsed: number;
  spendEntered: boolean;
  assumptions: Assumption[];
}

export function programCpp(catalog: Catalog, card: CardSeed): number {
  return catalog.programs.find((p) => p.id === card.programId)?.typicalCpp ?? 1.0;
}

interface RewardsComputation {
  points: number;
  earnRate: number;
  assumptions: Assumption[];
  capApplied: boolean;
  fuelLitres?: number;
}

/** Points for one card + merchant + spend, handling overrides, fuel and caps. */
export function computeRewards(
  card: CardSeed,
  merchant: MerchantSeed,
  spendCAD: number,
): RewardsComputation {
  const assumptions: Assumption[] = [];
  const category = merchant.earn;

  // Per-litre fuel earn wins for gas merchants when the card offers it there.
  if (category === 'gas' && card.fuel && (!card.fuel.merchants || card.fuel.merchants.includes(merchant.id))) {
    const litres = spendCAD / REFERENCE_FUEL_PRICE;
    const valueCAD = (litres * card.fuel.centsPerLitre) / 100;
    assumptions.push({
      text: `Fuel earn assumes ${card.fuel.centsPerLitre}¢/L at $${REFERENCE_FUEL_PRICE.toFixed(2)}/L (about ${Math.round(litres)} L).`,
    });
    // Points are back-derived so points and dollar value stay consistent.
    const points = valueCAD; // placeholder replaced below once cpp is known
    return { points, earnRate: points / spendCAD, assumptions, capApplied: false, fuelLitres: litres };
  }

  const baseRate = card.merchantRates?.[merchant.id] ?? card.earn[category] ?? card.earn.other ?? 0;
  if (card.merchantRates?.[merchant.id] !== undefined) {
    assumptions.push({ text: `Merchant-specific rate at ${merchant.name}.` });
  }

  const cap = card.caps.find((c) => c.categories.includes(category));
  if (!cap) {
    return { points: spendCAD * baseRate, earnRate: baseRate, assumptions, capApplied: false };
  }
  const withinCap = Math.min(spendCAD, cap.limitCAD);
  const overCap = Math.max(0, spendCAD - cap.limitCAD);
  const points = withinCap * baseRate + overCap * cap.rateAfter;
  assumptions.push({
    text: `Assumes the full ${cap.period === 'month' ? 'monthly' : 'yearly'} cap ($${cap.limitCAD.toLocaleString('en-CA')}) is still available.`,
  });
  const capApplied = overCap > 0;
  if (capApplied) {
    assumptions.push({
      text: `Purchase exceeds the cap: $${overCap.toFixed(0)} earns at the base rate of ${cap.rateAfter} per $1.`,
    });
  }
  return { points, earnRate: points / spendCAD, assumptions, capApplied };
}

export interface PurchaseSelection {
  /** Catalog merchant id when the store matched a tracked merchant. */
  merchantId?: string;
  /** Chosen earn category (the store default unless the shopper overrides it). */
  earn: EarnCategory;
  /** Chosen purchase context (the store default unless overridden). */
  context: PurchaseContext;
  /** Typed store text, used as the display name for untracked stores. */
  customName: string;
}

/**
 * Effective merchant for one check: the tracked merchant when nothing was
 * overridden, that merchant with a category/context override applied, or a
 * synthetic merchant so untracked stores still rank by category.
 */
export function resolvePurchaseMerchant(catalog: Catalog, selection: PurchaseSelection): MerchantSeed {
  const base = selection.merchantId
    ? catalog.merchants.find((m) => m.id === selection.merchantId)
    : undefined;
  if (!base) {
    return { id: 'custom', name: selection.customName, earn: selection.earn, context: selection.context };
  }
  if (base.earn === selection.earn && base.context === selection.context) return base;
  return { ...base, earn: selection.earn, context: selection.context };
}

export function rankForPurchase(
  catalog: Catalog,
  ownedCardIds: string[],
  merchant: MerchantSeed,
  spendCAD?: number,
): RankResult {

  const spendEntered = typeof spendCAD === 'number' && Number.isFinite(spendCAD) && spendCAD > 0;
  const spendUsed = spendEntered ? (spendCAD as number) : REFERENCE_SPEND;

  const candidateIds = new Set(ownedCardIds);
  if (merchant.storeCardId) candidateIds.add(merchant.storeCardId);
  const candidates = [...candidateIds]
    .map((id) => catalog.cards.find((c) => c.id === id))
    .filter((c): c is CardSeed => Boolean(c));

  const mode = merchant.context === 'general' ? 'rewards' : 'coverage';
  const coverageKeys = merchant.context === 'general' ? [] : COVERAGE_PERKS[merchant.context];

  const ranked: RankedCard[] = candidates.map((card) => {
    const cpp = programCpp(catalog, card);
    const computed = computeRewards(card, merchant, spendUsed);
    // Fuel path back-derives points from dollar value via this card's cpp.
    const litres = computed.fuelLitres;
    const fuelValue = litres !== undefined ? (litres * (card.fuel?.centsPerLitre ?? 0)) / 100 : 0;
    const points = litres !== undefined ? (fuelValue * 100) / cpp : computed.points;
    const valueCAD = (points * cpp) / 100;

    const applicableOffers = catalog.bankOffers.filter(
      (o) =>
        o.valueCAD !== undefined &&
        spendUsed >= (o.minSpendCAD ?? 0) &&
        (!o.categories || o.categories.includes(merchant.earn)) &&
        (o.appliesTo === 'all' || o.appliesTo.cards.includes(card.id)),
    );
    const offerValueCAD = applicableOffers.reduce((sum, o) => sum + (o.valueCAD ?? 0), 0);

    // Every card-level assumption links to an official source: explicit
    // per-note URLs win, otherwise the card's primary issuer page.
    const primarySource = card.sourceUrls[0];
    const withSource = (note: Assumption): Assumption =>
      note.sourceUrl ? note : { ...note, sourceUrl: primarySource };
    const assumptions: Assumption[] = [
      ...computed.assumptions.map(withSource),
      ...card.rankingNotes.map((note) =>
        withSource(typeof note === 'string' ? { text: note } : note),
      ),
    ];
    for (const offer of applicableOffers) {
      // Illustrative samples have no issuer page; the text says so outright.
      assumptions.push({ text: `Includes tracked offer “${offer.label}” (assumes you activated and qualify).` });
    }
    const tips = (card.tips ?? []).filter((t) => !t.categories || t.categories.includes(merchant.earn));

    let coverageScore = 0;
    const coverageNotes: string[] = [];
    for (const key of coverageKeys) {
      const benefit = card.benefits[key];
      if (benefit.offered) {
        coverageScore += 1;
        if (benefit.note) coverageNotes.push(benefit.note);
      }
    }

    return {
      card,
      owned: ownedCardIds.includes(card.id),
      points,
      earnRate: spendUsed > 0 ? points / spendUsed : 0,
      cpp,
      valueCAD,
      offerValueCAD,
      totalValueCAD: valueCAD + offerValueCAD,
      appliedOfferLabels: applicableOffers.map((o) => o.label),
      appliedOfferIds: applicableOffers.map((o) => o.id),
      assumptions,
      tips,
      capApplied: computed.capApplied,
      coverageScore,
      coverageNotes,
    };
  });

  ranked.sort((a, b) => {
    if (mode === 'coverage' && b.coverageScore !== a.coverageScore) {
      return b.coverageScore - a.coverageScore;
    }
    if (b.totalValueCAD !== a.totalValueCAD) {
      return b.totalValueCAD - a.totalValueCAD;
    }
    // Equal value: the cheaper card to hold wins.
    return a.card.annualFeeCAD - b.card.annualFeeCAD;
  });

  const assumptions: Assumption[] = [];
  const tracked = catalog.merchants.find((m) => m.id === merchant.id);
  if (!tracked) {
    assumptions.push({
      text: `“${merchant.name}” isn't in our store list yet, so store-specific rates don't apply; ranking by category instead.`,
    });
  } else if (tracked.earn !== merchant.earn || tracked.context !== merchant.context) {
    assumptions.push({ text: 'Using your chosen category instead of the store default.' });
  }
  if (!spendEntered) {
    assumptions.push({ text: `No amount entered, so values are for a $${REFERENCE_SPEND} example purchase.` });
  }
  assumptions.push({ text: 'Point values use typical best redemptions.' });
  if (ranked.some((r) => r.appliedOfferLabels.length > 0)) {
    assumptions.push({ text: "Offers shown are examples; check they're activated before you count on them." });
  }

  return { merchant, ranked, mode, spendUsed, spendEntered, assumptions };
}

export function rankForCheck(
  catalog: Catalog,
  ownedCardIds: string[],
  merchantId: string,
  spendCAD?: number,
): RankResult | null {
  const merchant = catalog.merchants.find((m) => m.id === merchantId);
  if (!merchant) return null;
  return rankForPurchase(catalog, ownedCardIds, merchant, spendCAD);
}

export interface Suggestion {
  card: CardSeed;
  annualValueCAD: number;
  bestOwnedAnnualCAD: number;
  incrementalCAD: number;
}

/** Annual rewards value of one card under a spend profile, honouring caps. */
export function annualValue(
  catalog: Catalog,
  card: CardSeed,
  profile: { category: EarnCategory; monthlyCAD: number }[] = DEFAULT_SPEND_PROFILE,
): number {
  const cpp = programCpp(catalog, card);
  let totalPoints = 0;
  for (const { category, monthlyCAD } of profile) {
    const annualSpend = monthlyCAD * 12;
    const baseRate = card.earn[category] ?? card.earn.other ?? 0;
    const cap = card.caps.find((c) => c.categories.includes(category));
    if (!cap) {
      totalPoints += annualSpend * baseRate;
      continue;
    }
    // Monthly caps annualize (limit × 12); yearly caps apply once.
    const annualLimit = cap.period === 'month' ? cap.limitCAD * 12 : cap.limitCAD;
    const withinCap = Math.min(annualSpend, annualLimit);
    totalPoints += withinCap * baseRate + Math.max(0, annualSpend - annualLimit) * cap.rateAfter;
  }
  return (totalPoints * cpp) / 100;
}

export function suggestNewCards(
  catalog: Catalog,
  ownedCardIds: string[],
  thresholdCAD: number = SUGGEST_THRESHOLD_CAD,
): Suggestion[] {
  const owned = catalog.cards.filter((c) => ownedCardIds.includes(c.id));
  if (owned.length === 0) return [];
  const ownedSegments = new Set(owned.map((c) => c.segment));
  const bestOwnedAnnualCAD = Math.max(...owned.map((c) => annualValue(catalog, c)));
  return catalog.cards
    .filter((c) => !ownedCardIds.includes(c.id))
    // Debit cards earn nothing to suggest; business cards only make sense for
    // owners who already hold that segment.
    .filter((c) => c.kind === 'credit' && ownedSegments.has(c.segment))
    .map((card) => {
      const annualValueCAD = annualValue(catalog, card);
      return { card, annualValueCAD, bestOwnedAnnualCAD, incrementalCAD: annualValueCAD - bestOwnedAnnualCAD };
    })
    .filter((s) => s.incrementalCAD >= thresholdCAD)
    .sort((a, b) => b.incrementalCAD - a.incrementalCAD)
    .slice(0, 3);
}
