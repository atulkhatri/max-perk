// v1 tracks a small DEFINED set of representative offers. These rotate in
// real life and vary by customer, so every entry is illustrative sample data
// — never presented as a live bank feed.

import type { BankOfferSeed } from '../types';

export const bankOffers: BankOfferSeed[] = [
  {
    id: 'offer-grocery-10',
    label: '$10 back on $60+ grocery',
    detail: 'Spend $60 at a major grocery chain, get a $10 statement credit (one-time, activate in app).',
    valueCAD: 10,
    minSpendCAD: 60,
    appliesTo: 'all',
    categories: ['grocery'],
    conditions: 'Illustrative sample only; bank offers rotate monthly and vary by customer.',
    illustrative: true,
  },
  {
    id: 'offer-streaming-15',
    label: '10% back on streaming (up to $15)',
    detail: '10% back, up to $15, on the first $150 of streaming-service spend in a calendar month.',
    valueCAD: 15,
    minSpendCAD: 150,
    appliesTo: { cards: ['scotia-momentum', 'tangerine'] },
    categories: ['recurring'],
    conditions: 'Illustrative sample only; requires activation before purchase; one per card.',
    illustrative: true,
  },
  {
    id: 'offer-delivery-20',
    label: '$20 delivery-app credit',
    detail: 'A $20 statement credit when you add your card to a food-delivery app and spend $40+.',
    valueCAD: 20,
    minSpendCAD: 40,
    appliesTo: { cards: ['amex-cobalt', 'rogers-red'] },
    categories: ['dining'],
    conditions: 'Illustrative sample only; new-to-service customers; terms vary.',
    illustrative: true,
  },
  {
    id: 'offer-hotel-30',
    label: '15% back on portal hotel bookings (up to $30)',
    detail: '15% back, up to $30, on hotel bookings made through the bank travel portal.',
    valueCAD: 30,
    minSpendCAD: 200,
    appliesTo: 'all',
    categories: ['travel'],
    conditions: 'Illustrative sample only; travel promos change frequently.',
    illustrative: true,
  },
];
