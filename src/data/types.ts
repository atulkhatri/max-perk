// Domain model for the curated catalog. v1 ships this catalog as versioned
// seed files (see src/data/seeds/); Firestore stores per-user wallet data.

export type EarnCategory =
  | 'grocery'
  | 'dining'
  | 'gas'
  | 'travel'
  | 'drugstore'
  | 'transit'
  | 'recurring'
  | 'foreign'
  | 'other';

export type PurchaseContext = 'general' | 'electronics' | 'carRental' | 'hotels';

export type BenefitKey =
  | 'extendedWarranty'
  | 'purchaseProtection'
  | 'rentalCarInsurance'
  | 'travelMedical'
  | 'hotelPerks';

export interface MerchantSeed {
  id: string;
  name: string;
  /** Which earn bucket a purchase here falls into (approximate by design). */
  earn: EarnCategory;
  /** Benefit-sensitive context; coverage-first ranking applies when set. */
  context: PurchaseContext;
  storeCardId?: string;
  loyaltyId?: string;
  note?: string;
}

export interface EarnCap {
  categories: EarnCategory[];
  period: 'month' | 'year';
  limitCAD: number;
  /** Rate applied to spend above the cap (same units as earn rates). */
  rateAfter: number;
}

export interface CardBenefit {
  offered: boolean;
  note?: string;
}

export interface CardSeed {
  id: string;
  name: string;
  issuer: string;
  network: 'Visa' | 'Mastercard' | 'Amex' | 'Interac';
  /** Credit cards rank and suggest normally; debit is modelled for future use. */
  kind: 'credit' | 'debit';
  /** Personal and business cards are suggested only within owned segments. */
  segment: 'personal' | 'business';
  annualFeeCAD: number;
  programId: string;
  /** Points (or cash-back percent units) earned per $1. Missing = 0. */
  earn: Partial<Record<EarnCategory, number>>;
  /** Merchant-specific overrides, e.g. store banners (points per $1). */
  merchantRates?: Record<string, number>;
  /** Per-litre fuel earn (cents/L) instead of a per-dollar rate, optionally merchant-scoped. */
  fuel?: { centsPerLitre: number; merchants?: string[] };
  caps: EarnCap[];
  conditions: string[];
  /** Card-specific caveats surfaced as ranking assumptions. */
  rankingNotes: string[];
  benefits: Record<BenefitKey, CardBenefit>;
  dataAsOf: string;
  sourceUrls: string[];
  uncertain: string[];
}

export interface RedemptionPath {
  label: string;
  cpp: number;
  note?: string;
}

export interface ProgramSeed {
  id: string;
  name: string;
  /** Typical cents-per-point for best-value redemptions. */
  typicalCpp: number;
  methodology: string;
  redemption: RedemptionPath[];
}

export interface LoyaltySeed {
  id: string;
  name: string;
  operator: string;
  headline: string;
  earnStructure: string;
  howToJoin: string;
  joinUrl: string;
  stackNote: string;
}

export interface BankOfferSeed {
  id: string;
  label: string;
  detail: string;
  /** Flat statement-credit value when applicable. */
  valueCAD?: number;
  /** Minimum purchase amount for the offer to apply. */
  minSpendCAD?: number;
  appliesTo: 'all' | { cards: string[] };
  categories?: EarnCategory[];
  conditions: string;
  illustrative: true;
}

export interface Catalog {
  dataAsOf: string;
  cards: CardSeed[];
  programs: ProgramSeed[];
  merchants: MerchantSeed[];
  loyalty: LoyaltySeed[];
  bankOffers: BankOfferSeed[];
}
