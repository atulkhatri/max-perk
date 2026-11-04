/**
 * Shared contract for the ask-pick feature: free text in, structured
 * purchase legs out. Pure logic only (no firebase imports) so the client
 * test suite can import it directly.
 *
 * The model NEVER picks a card. It only parses what the purchase is; the
 * deterministic ranking engine in src/ranking/rank.ts does the money math.
 */

export const EARN_CATEGORIES = [
  'grocery',
  'dining',
  'gas',
  'travel',
  'drugstore',
  'transit',
  'recurring',
  'foreign',
  'other',
] as const;
export type EarnCategory = (typeof EARN_CATEGORIES)[number];

export const PURCHASE_CONTEXTS = ['general', 'electronics', 'carRental', 'hotels'] as const;
export type PurchaseContext = (typeof PURCHASE_CONTEXTS)[number];

export interface PickLeg {
  /** Catalog merchant id when the text matched a tracked store. */
  merchantId?: string;
  earn: EarnCategory;
  context: PurchaseContext;
  spendCAD?: number;
}

export interface AskPickRequest {
  text: string;
}

export type AskPickResponse =
  | { ok: true; legs: PickLeg[]; interpretation: string }
  | { ok: true; legs: []; interpretation: string; clarification: string }
  | { ok: false; error: 'empty' | 'too_long' | 'invalid' | 'disabled' | 'rate_limited' | 'model_error' };

export const MAX_TEXT_LENGTH = 500;
export const MIN_CONFIDENCE = 0.7;

export interface MerchantRef {
  id: string;
  name: string;
}

export function validatePickLegs(
  value: unknown,
  merchants: MerchantRef[],
): { legs: PickLeg[]; interpretation: string } | { clarification: string } | null {
  if (typeof value !== 'object' || value === null) return null;
  const v = value as Record<string, unknown>;
  const rawLegs = v['legs'];
  const interpretation = typeof v['interpretation'] === 'string' ? v['interpretation'] : '';
  if (!Array.isArray(rawLegs) || rawLegs.length === 0 || rawLegs.length > 6) {
    if (typeof v['clarification'] === 'string' && v['clarification'].length > 0) {
      return { clarification: v['clarification'].slice(0, 300) };
    }
    return null;
  }
  const ids = new Set(merchants.map((m) => m.id));
  const legs: PickLeg[] = [];
  for (const raw of rawLegs) {
    if (typeof raw !== 'object' || raw === null) return null;
    const leg = raw as Record<string, unknown>;
    if (
      typeof leg['earn'] !== 'string' ||
      !(EARN_CATEGORIES as readonly string[]).includes(leg['earn']) ||
      typeof leg['context'] !== 'string' ||
      !(PURCHASE_CONTEXTS as readonly string[]).includes(leg['context'])
    ) {
      return null;
    }
    const out: PickLeg = {
      earn: leg['earn'] as EarnCategory,
      context: leg['context'] as PurchaseContext,
    };
    if (typeof leg['merchantId'] === 'string') {
      if (!ids.has(leg['merchantId'])) return null;
      out.merchantId = leg['merchantId'];
    }
    if (typeof leg['spendCAD'] === 'number') {
      if (!Number.isFinite(leg['spendCAD']) || leg['spendCAD'] <= 0 || leg['spendCAD'] > 1_000_000) {
        return null;
      }
      out.spendCAD = Math.round(leg['spendCAD'] * 100) / 100;
    }
    legs.push(out);
  }
  const confidence = typeof v['confidence'] === 'number' ? v['confidence'] : 0;
  if (confidence < MIN_CONFIDENCE || interpretation.length === 0) {
    if (typeof v['clarification'] === 'string' && v['clarification'].length > 0) {
      return { clarification: v['clarification'].slice(0, 300) };
    }
    return null;
  }
  return { legs, interpretation: interpretation.slice(0, 300) };
}

export function buildSystemPrompt(merchants: MerchantRef[], dataAsOf: string): string {
  const list = merchants.map((m) => `- ${m.id}: ${m.name}`).join('\n');
  return [
    'You parse a shopper\'s free-text purchase description into structured purchase legs.',
    'Rules:',
    '1. Output JSON only, matching the provided schema. Never recommend a card.',
    '2. Split multi-category descriptions into one leg per category.',
    '3. merchantId must be an id from the store list below, or omitted when no store matches.',
    '4. spendCAD is a single number in CAD, or omitted when no amount is stated.',
    '5. Set confidence below 0.7 and include a short clarification question when the text is ambiguous.',
    `Catalog snapshot: ${dataAsOf}. Tracked stores:`,
    list,
  ].join('\n');
}

export function normalizeText(text: string): string {
  return text.trim().replace(/\s+/g, ' ').slice(0, MAX_TEXT_LENGTH);
}
