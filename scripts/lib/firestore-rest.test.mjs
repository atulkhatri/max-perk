// Codec + dotenv-reader tests (no network).
import { describe, expect, it } from 'vitest';
import { decodeValue, encodeFields, encodeValue, readDotenv } from './firestore-rest.mjs';

describe('encodeValue', () => {
  it('encodes scalars and null', () => {
    expect(encodeValue('a')).toEqual({ stringValue: 'a' });
    expect(encodeValue(true)).toEqual({ booleanValue: true });
    expect(encodeValue(120)).toEqual({ integerValue: '120' });
    expect(encodeValue(1.25)).toEqual({ doubleValue: 1.25 });
    expect(encodeValue(null)).toEqual({ nullValue: null });
  });

  it('encodes nested maps and arrays, dropping undefined', () => {
    expect(encodeValue({ a: 1, b: undefined, c: { d: [1, 'x'] }, e: [] })).toEqual({
      mapValue: {
        fields: {
          a: { integerValue: '1' },
          c: { mapValue: { fields: { d: { arrayValue: { values: [{ integerValue: '1' }, { stringValue: 'x' }] } } } } },
          e: { arrayValue: {} },
        },
      },
    });
  });

  it('rejects non-finite numbers', () => {
    expect(() => encodeValue(Number.NaN)).toThrow();
  });
});

describe('decodeValue', () => {
  it('round-trips a card-like object', () => {
    const card = {
      id: 'x',
      annualFeeCAD: 191.88,
      earn: { grocery: 5 },
      caps: [],
      appliesTo: { cards: ['a'] },
    };
    expect(decodeValue(encodeValue(card))).toEqual(card);
  });
});

describe('readDotenv', () => {
  it('returns {} for a missing file', () => {
    expect(readDotenv('/nonexistent-path-xyz/.env')).toEqual({});
  });
});

describe('encodeFields', () => {
  it('skips undefined top-level fields', () => {
    expect(encodeFields({ a: 1, b: undefined })).toEqual({ a: { integerValue: '1' } });
  });
});
