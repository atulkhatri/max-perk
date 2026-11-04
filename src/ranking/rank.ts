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

/** Fill a partial monthly-spend profile with defaults for untouched categories. */
export function activeSpendProfile(
  spend?: Partial<Record<EarnCategory, number>>,
): { category: EarnCategory; monthlyCAD: number }[] {
  return DEFAULT_SPEND_PROFILE.map((p) => ({
    category: p.category,
    monthlyCAD: spend?.[p.category] ?? p.monthlyCAD,
  }));
}

/** Annual value net of the annual fee: what the card actually leaves you. */
export function netAnnualValue(
  catalog: Catalog,
  card: CardSeed,
  profile: { category: EarnCategory; monthlyCAD: number }[] = DEFAULT_SPEND_PROFILE,
): number {
  return annualValue(catalog, card, profile) - card.annualFeeCAD;
}

export function suggestNewCards(
  catalog: Catalog,
  ownedCardIds: string[],
  thresholdCAD: number = SUGGEST_THRESHOLD_CAD,
  spendProfile?: Partial<Record<EarnCategory, number>>,
): Suggestion[] {
  const owned = catalog.cards.filter((c) => ownedCardIds.includes(c.id));
  if (owned.length === 0) return [];
  const ownedSegments = new Set(owned.map((c) => c.segment));
  const profile = activeSpendProfile(spendProfile);
  const bestOwnedAnnualCAD = Math.max(...owned.map((c) => annualValue(catalog, c, profile)));
  const bestOwnedNetCAD = Math.max(...owned.map((c) => netAnnualValue(catalog, c, profile)));
  return catalog.cards
    .filter((c) => !ownedCardIds.includes(c.id))
    // Debit cards earn nothing to suggest; business cards only make sense for
    // owners who already hold that segment.
    .filter((c) => c.kind === 'credit' && ownedSegments.has(c.segment))
    .map((card) => {
      const annualValueCAD = annualValue(catalog, card, profile);
      // Threshold, ranking and the displayed "extra value" are all net of
      // fees on both sides: a +$60-gross card with a $120 fee must never be
      // recommended over a fee-free owned card.
      const incrementalCAD = annualValueCAD - card.annualFeeCAD - bestOwnedNetCAD;
      return { card, annualValueCAD, bestOwnedAnnualCAD, incrementalCAD };
    })
    .filter((s) => s.incrementalCAD >= thresholdCAD)
    .sort((a, b) => b.incrementalCAD - a.incrementalCAD)
    .slice(0, 3);
}

export interface StatementTransaction {
  /** ISO date YYYY-MM-DD. */
  date: string;
  /** Signed dollars; refunds reduce category spend. */
  amountCAD: number;
  category: EarnCategory;
  merchantId?: string;
}

/** Whole calendar months spanned by the transactions (min 1). */
export function transactionCoverageMonths(txns: StatementTransaction[]): number {
  return Math.max(1, new Set(txns.map((t) => t.date.slice(0, 7))).size);
}

/**
 * Annualized dollar value one card would earn on real transactions.
 * Monthly caps apply per calendar month; yearly caps scale to the coverage
 * window; merchant-rate overrides bypass caps. Refunds net within their
 * month (floored at zero). Fuel-per-litre earn cannot apply to dollar
 * amounts, matching annualValue.
 */
export function valueOfTransactions(catalog: Catalog, card: CardSeed, txns: StatementTransaction[]): number {
  if (txns.length === 0) return 0;
  const cpp = programCpp(catalog, card);
  const rate = (category: EarnCategory): number => card.earn[category] ?? card.earn.other ?? 0;
  const monthly = new Map<string, Map<EarnCategory, number>>();
  const totals = new Map<EarnCategory, number>();
  let overridePoints = 0;
  let minDay = Number.POSITIVE_INFINITY;
  let maxDay = Number.NEGATIVE_INFINITY;
  for (const t of txns) {
    const day = Date.parse(`${t.date}T00:00:00Z`);
    if (Number.isFinite(day)) {
      minDay = Math.min(minDay, day);
      maxDay = Math.max(maxDay, day);
    }
    const override = t.merchantId ? card.merchantRates?.[t.merchantId] : undefined;
    if (override !== undefined) {
      overridePoints += t.amountCAD * override;
      continue;
    }
    const key = t.date.slice(0, 7);
    const bucket = monthly.get(key) ?? new Map<EarnCategory, number>();
    bucket.set(t.category, (bucket.get(t.category) ?? 0) + t.amountCAD);
    monthly.set(key, bucket);
    totals.set(t.category, (totals.get(t.category) ?? 0) + t.amountCAD);
  }
  const months = Math.max(1, monthly.size);
  const elapsedDays = Number.isFinite(minDay) ? Math.max(1, Math.round((maxDay - minDay) / 86400000) + 1) : months * 30;
  // Annualize by elapsed days, not calendar-month buckets: Jan 31 to Feb 1
  // spans 2 days, not 2 months. A floor of one average month keeps a single
  // day of transactions from annualizing to an absurd multiple.
  const days = Math.max(elapsedDays, 365 / 12);
  let points = overridePoints;
  for (const bucket of monthly.values()) {
    for (const [category, spend] of bucket) {
      const net = Math.max(0, spend);
      points += net * rate(category);
      const cap = card.caps.find((c) => c.period === 'month' && c.categories.includes(category));
      if (cap) points -= Math.max(0, net - cap.limitCAD) * (rate(category) - cap.rateAfter);
    }
  }
  for (const cap of card.caps) {
    if (cap.period !== 'year') continue;
    for (const category of cap.categories) {
      const total = Math.max(0, totals.get(category) ?? 0);
      const scaled = (cap.limitCAD * days) / 365;
      points -= Math.max(0, total - scaled) * (rate(category) - cap.rateAfter);
    }
  }
  return ((Math.max(0, points) * 365) / days) * (cpp / 100);
}

export interface StatementGroup {
  cardId: string;
  transactions: StatementTransaction[];
}

export interface StatementSuggestion extends Suggestion {
  forCardId: string;
}

/**
 * Compare each attributed owned card against every candidate on that card's
 * own transactions. Same credit/segment/threshold rules as suggestNewCards.
 */
export function suggestFromStatements(
  catalog: Catalog,
  ownedCardIds: string[],
  groups: StatementGroup[],
  thresholdCAD: number = SUGGEST_THRESHOLD_CAD,
): StatementSuggestion[] {
  const owned = catalog.cards.filter((c) => ownedCardIds.includes(c.id));
  if (owned.length === 0) return [];
  const ownedSegments = new Set(owned.map((c) => c.segment));
  const candidates = catalog.cards.filter(
    (c) => !ownedCardIds.includes(c.id) && c.kind === 'credit' && ownedSegments.has(c.segment),
  );
  const out: StatementSuggestion[] = [];
  for (const group of groups) {
    const ownedCard = owned.find((c) => c.id === group.cardId);
    if (!ownedCard || group.transactions.length === 0) continue;
    const bestOwnedAnnualCAD = valueOfTransactions(catalog, ownedCard, group.transactions);
    for (const card of candidates) {
      const annualValueCAD = valueOfTransactions(catalog, card, group.transactions);
      // Net of fees on both sides, same as suggestNewCards.
      const incrementalCAD = annualValueCAD - card.annualFeeCAD - (bestOwnedAnnualCAD - ownedCard.annualFeeCAD);
      if (incrementalCAD >= thresholdCAD) {
        out.push({ card, annualValueCAD, bestOwnedAnnualCAD, incrementalCAD, forCardId: group.cardId });
      }
    }
  }
  return out.sort((a, b) => b.incrementalCAD - a.incrementalCAD).slice(0, 3);
}
