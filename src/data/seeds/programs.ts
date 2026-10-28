import type { ProgramSeed } from '../types';

export const programs: ProgramSeed[] = [
  {
    id: 'amex-mr',
    name: 'Amex Membership Rewards',
    typicalCpp: 2.0,
    methodology: 'Assumes 1 Membership Rewards point redeemed via airline transfer partners at about 2.0¢. Statement-credit redemptions are worth far less (about 1.0¢).',
    redemption: [
      { label: 'Transfer 1:1 to Aeroplan for economy and short-haul awards', cpp: 2.0 },
      { label: 'Transfer to Aeroplan, Avios or Flying Blue for premium-cabin awards', cpp: 4.0, note: 'High value but needs award availability.' },
      { label: 'Amex Travel Online or statement credit', cpp: 1.0, note: 'Floor value — avoid if you can transfer instead.' },
    ],
  },
  {
    id: 'avion',
    name: 'RBC Avion Rewards',
    typicalCpp: 2.0,
    methodology: 'Assumes Avion points used on the fixed-grid Air Travel Redemption Schedule at about 2.0¢. Flexible portal bookings are worth less.',
    redemption: [
      { label: 'Air Travel Redemption Schedule fixed-grid flights', cpp: 2.0 },
      { label: 'Transfer 1:1 to British Airways Avios or Cathay Asia Miles', cpp: 1.75 },
      { label: 'Flexible travel booking through the Avion portal', cpp: 1.0, note: 'Convenient but lower value.' },
    ],
  },
  {
    id: 'td-rewards',
    name: 'TD Rewards',
    typicalCpp: 0.5,
    methodology: 'TD points are worth 0.5¢ when booking travel through Expedia for TD (200 pts = $1). Other redemptions are worth less.',
    redemption: [
      { label: 'Book travel via Expedia for TD (200 pts = $1)', cpp: 0.5 },
      { label: 'Book Any Way: redeem against any travel purchase (225 pts = $1)', cpp: 0.44 },
      { label: 'Redeem against everyday non-travel purchases (400 pts = $1)', cpp: 0.25, note: 'Poor value — travel redemptions pay double.' },
    ],
  },
  {
    id: 'scotia-momentum',
    name: 'Scotia Momentum cash back',
    typicalCpp: 1.0,
    methodology: 'Cash-back dollars at face value, paid out to the account.',
    redemption: [
      { label: 'Annual cash payout credited to the account', cpp: 1.0 },
      { label: 'Redeem cash back against the statement balance', cpp: 1.0 },
    ],
  },
  {
    id: 'cibc-dividend',
    name: 'CIBC Dividend cash back',
    typicalCpp: 1.0,
    methodology: 'Cash-back dollars at face value, paid to the statement once per year.',
    redemption: [
      { label: 'Annual cash-back payout credited to the statement', cpp: 1.0 },
      { label: 'Stack Journie fuel discounts with gas earn', cpp: 1.0, note: 'Extra savings on top of the earn rate.' },
    ],
  },
  {
    id: 'bmo-cashback',
    name: 'BMO CashBack Rewards',
    typicalCpp: 1.0,
    methodology: 'Cash-back dollars at face value.',
    redemption: [
      { label: 'Statement credit redemption', cpp: 1.0 },
      { label: 'Deposit cash back to a BMO account', cpp: 1.0 },
    ],
  },
  {
    id: 'tangerine',
    name: 'Tangerine Money-Back Rewards',
    typicalCpp: 1.0,
    methodology: 'Cash-back dollars at face value, paid monthly.',
    redemption: [
      { label: 'Monthly statement credit', cpp: 1.0 },
      { label: 'Deposit to a Tangerine Savings Account', cpp: 1.0, note: 'Unlocks a third 2% category.' },
    ],
  },
  {
    id: 'rogers',
    name: 'Rogers Bank cash back',
    typicalCpp: 1.5,
    methodology: 'Assumes redeeming against Rogers/Fido/Shaw purchases at 1.5×. Plain statement-credit redemptions are worth 1.0¢.',
    redemption: [
      { label: 'Redeem against Rogers/Fido/Shaw purchases at 1.5×', cpp: 1.5, note: 'Terms changing Nov 2026 — confirm current rules.' },
      { label: 'Statement credit against any purchase', cpp: 1.0 },
    ],
  },
  {
    id: 'pc-optimum',
    name: 'PC Optimum',
    typicalCpp: 0.1,
    methodology: '1,000 PC Optimum points = $1, so each point is worth 0.1¢ at base redemption. Bonus redemption events lift value to about 0.14¢.',
    redemption: [
      { label: 'Bonus redemption events (e.g. 100,000 pts for $140 of value)', cpp: 0.14, note: 'Best value — wait for an event when you can.' },
      { label: 'Redeem in 10,000-pt ($10) increments at Loblaw and Shoppers', cpp: 0.1 },
      { label: 'Redeem online via PC Express or partners', cpp: 0.1 },
    ],
  },
  {
    id: 'triangle',
    name: 'Triangle Rewards (CT Money)',
    typicalCpp: 1.0,
    methodology: 'Canadian Tire Money at face value across the Canadian Tire family of stores.',
    redemption: [
      { label: 'Redeem CT Money at Canadian Tire family banners', cpp: 1.0 },
      { label: 'Redeem CT Money on groceries and gas at partners where accepted', cpp: 1.0 },
    ],
  },
  {
    id: 'costco-cibc',
    name: 'CIBC Costco cash back',
    typicalCpp: 1.0,
    methodology: 'Cash-back dollars at face value, issued as an annual Costco certificate.',
    redemption: [
      { label: 'Annual Costco cash-back certificate redeemable in-warehouse', cpp: 1.0 },
    ],
  },
  {
    id: 'walmart',
    name: 'Walmart Reward Dollars',
    typicalCpp: 1.0,
    methodology: 'Reward Dollars at face value, redeemable only at Walmart.',
    redemption: [
      { label: 'Redeem Reward Dollars at Walmart checkout ($1 = $1)', cpp: 1.0 },
      { label: 'Redeem Reward Dollars on Walmart.ca orders', cpp: 1.0 },
    ],
  },
];
