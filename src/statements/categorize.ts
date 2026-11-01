import type { Catalog, EarnCategory } from '../data/types';
import type { RawTransaction } from './parse';

export interface CategorizedTransaction extends RawTransaction {
  category: EarnCategory;
  merchantId?: string;
  /** False when nothing matched and the transaction fell back to other. */
  matched: boolean;
}

/** Generic description keywords per category (merchant names win first). */
const KEYWORDS: Partial<Record<EarnCategory, string[]>> = {
  grocery: [
    'grocery',
    'groceries',
    'supermarket',
    'loblaws',
    'zehrs',
    'nofrills',
    'freshco',
    'food basics',
    'sobeys',
    'safeway',
    'iga extra',
    'costco',
    'walmart supercentre',
  ],
  dining: [
    'restaurant',
    'cafe',
    'coffee',
    'tim hortons',
    'starbucks',
    'mcdonald',
    'burger king',
    "wendy'",
    'pizza',
    'sushi',
    'uber eats',
    'doordash',
    'skipthedishes',
    'food delivery',
    'bakery',
    'deli-',
  ],
  gas: ['esso', 'shell', 'petro-canada', 'petro canada', 'ultramar', 'chevron', 'husky', 'pioneer', 'fuel', 'gas bar'],
  travel: [
    'air canada',
    'westjet',
    'porter airlines',
    'hotel',
    'marriott',
    'hilton',
    'hyatt',
    'expedia',
    'airbnb',
    'booking.com',
    'via rail',
    'porter air',
  ],
  drugstore: ['shoppers drug', 'rexall', 'pharmaprix', 'pharmacy', 'drug mart', 'london drugs', 'jean coutu'],
  transit: ['uber trip', 'lyft', 'presto', 'opus', 'compass card', 'ttc', 'stm ', 'transit', 'taxi', 'aeroport', 'parking'],
  recurring: [
    'netflix',
    'spotify',
    'disney+',
    'bell ',
    'rogers ',
    'telus',
    'fido',
    'koodo',
    'hydro',
    'enbridge',
    'gym',
    'goodlife',
    'membership',
  ],
  // Known general-merchandise names: correctly other, and recognized.
  other: ['amazon', 'canadian tire', 'best buy', 'ikea', 'home depot', 'rona', 'walmart'],
};

/**
 * Categorize parsed transactions: curated merchant names first (longest
 * first so banners beat generics), then keyword rules, else other.
 */
export function categorizeTransactions(catalog: Catalog, transactions: RawTransaction[]): CategorizedTransaction[] {
  const merchants = [...catalog.merchants].sort((a, b) => b.name.length - a.name.length);
  return transactions.map((t) => {
    const hay = t.description.toLowerCase();
    const merchant = merchants.find((mb) => mb.name.length > 2 && hay.includes(mb.name.toLowerCase()));
    if (merchant) return { ...t, category: merchant.earn, merchantId: merchant.id, matched: true };
    for (const [category, words] of Object.entries(KEYWORDS)) {
      if (words.some((w) => hay.includes(w))) {
        return { ...t, category: category as EarnCategory, matched: true };
      }
    }
    return { ...t, category: 'other' as EarnCategory, matched: false };
  });
}
