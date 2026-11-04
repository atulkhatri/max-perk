import { describe, expect, it } from 'vitest';
import { buildSystemPrompt, normalizeText, validatePickLegs } from '../../functions/src/contract';

const merchants = [
  { id: 'loblaws', name: 'Loblaws' },
  { id: 'costco-gas', name: 'Costco Gas' },
];

describe('validatePickLegs', () => {
  it('accepts a well-formed single leg', () => {
    const out = validatePickLegs(
      {
        legs: [{ merchantId: 'loblaws', earn: 'grocery', context: 'general', spendCAD: 250 }],
        interpretation: 'Groceries at Loblaws, $250',
        confidence: 0.95,
      },
      merchants,
    );
    expect(out).toEqual({
      legs: [{ merchantId: 'loblaws', earn: 'grocery', context: 'general', spendCAD: 250 }],
      interpretation: 'Groceries at Loblaws, $250',
    });
  });

  it('accepts multi-leg baskets', () => {
    const out = validatePickLegs(
      {
        legs: [
          { earn: 'grocery', context: 'general', spendCAD: 200 },
          { earn: 'gas', context: 'general', spendCAD: 60 },
        ],
        interpretation: 'Groceries $200 and gas $60',
        confidence: 0.8,
      },
      merchants,
    );
    expect(out && 'legs' in out && out.legs).toHaveLength(2);
  });

  it('drops unknown merchant ids but keeps the leg, and keeps storeName', () => {
    const out = validatePickLegs(
      {
        legs: [{ merchantId: 'nope', storeName: 'Cineplex', earn: 'other', context: 'general', spendCAD: 100 }],
        interpretation: 'Movies at Cineplex, $100',
        confidence: 0.9,
      },
      merchants,
    );
    expect(out).toEqual({
      legs: [{ storeName: 'Cineplex', earn: 'other', context: 'general', spendCAD: 100 }],
      interpretation: 'Movies at Cineplex, $100',
    });
  });

  it('treats zero spend as absent, rejects NaN and absurd spend', () => {
    const zero = validatePickLegs(
      { legs: [{ earn: 'grocery', context: 'general', spendCAD: 0 }], interpretation: 'x', confidence: 0.9 },
      merchants,
    );
    expect(zero && 'legs' in zero && zero.legs[0]).not.toHaveProperty('spendCAD');
    expect(
      validatePickLegs(
        { legs: [{ earn: 'grocery', context: 'general', spendCAD: 2e9 }], interpretation: 'x', confidence: 0.9 },
        merchants,
      ),
    ).toBeNull();
  });

  it('rejects bad enums', () => {
    expect(
      validatePickLegs(
        { legs: [{ earn: 'streaming', context: 'general' }], interpretation: 'x', confidence: 0.9 },
        merchants,
      ),
    ).toBeNull();
  });

  it('routes low confidence to clarification, never to legs', () => {
    const out = validatePickLegs(
      {
        legs: [{ earn: 'grocery', context: 'general' }],
        interpretation: '',
        confidence: 0.3,
        clarification: 'Groceries, or a gift card purchase?',
      },
      merchants,
    );
    expect(out).toEqual({ clarification: 'Groceries, or a gift card purchase?' });
  });

  it('rejects non-objects and overlong leg lists', () => {
    expect(validatePickLegs(null, merchants)).toBeNull();
    expect(
      validatePickLegs(
        { legs: new Array(7).fill({ earn: 'other', context: 'general' }), interpretation: 'x', confidence: 1 },
        merchants,
      ),
    ).toBeNull();
  });
});

describe('prompt + normalize', () => {
  it('pins the merchant list and snapshot date', () => {
    const prompt = buildSystemPrompt(merchants, '2026-11-03');
    expect(prompt).toContain('loblaws: Loblaws');
    expect(prompt).toContain('2026-11-03');
    expect(prompt).toContain('Never recommend a card');
  });

  it('trims and caps input', () => {
    expect(normalizeText('  hello   world  ')).toBe('hello world');
    expect(normalizeText('x'.repeat(600))).toHaveLength(500);
  });
});
