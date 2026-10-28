import type { LoyaltySeed } from '../types';

export const loyaltyPrograms: LoyaltySeed[] = [
  {
    id: 'pc-optimum',
    name: 'PC Optimum',
    operator: 'Loblaw Companies',
    headline: 'Free loyalty program for Loblaw-banner grocery, Shoppers and Esso.',
    earnStructure:
      'Points come from personalized in-app offers and in-store bonus labels; 15 pts/$1 (1.5%) base at Shoppers Drug Mart and at least 10 pts/L at Esso/Mobil. 10,000 pts = $10 in redemptions.',
    howToJoin: 'Join free in the PC Optimum app or at the customer service desk, then scan or enter your card number at checkout.',
    joinUrl: 'https://www.pcoptimum.ca/',
    stackNote: 'Stacks with PC Financial credit cards and personalized offers for extra value on top of card rewards.',
  },
  {
    id: 'triangle',
    name: 'Triangle Rewards',
    operator: 'Canadian Tire Corporation',
    headline: 'Free loyalty program for Canadian Tire, Sport Chek, Mark’s and partners.',
    earnStructure:
      '0.4% base back in CT Money when scanning a Triangle ID, rising to 4% when paying with a Triangle Mastercard at Canadian Tire banners, plus bonus multipliers from personalized offers.',
    howToJoin: 'Join free online or in the Triangle app, then scan your Triangle ID at checkout.',
    joinUrl: 'https://triangle.canadiantire.ca/en.html',
    stackNote: 'Pay with a Triangle Mastercard at Canadian Tire banners to lift earn from 0.4% to 4%.',
  },
];
