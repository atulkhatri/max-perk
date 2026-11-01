import { describe, expect, it } from 'vitest';
import {
  dedupeTransactions,
  isAccountPayment,
  parseCsvTransactions,
  parsePdfLines,
  parseStatementAmount,
  parseStatementDate,
} from './parse';

describe('parseStatementDate', () => {
  it('reads ISO, slash, and written dates', () => {
    expect(parseStatementDate('2026-09-05')).toBe('2026-09-05');
    expect(parseStatementDate('2026/09/05')).toBe('2026-09-05');
    expect(parseStatementDate('09/05/2026')).toBe('2026-09-05');
    expect(parseStatementDate('Sep 5, 2026')).toBe('2026-09-05');
    expect(parseStatementDate('5 Sep 2026')).toBe('2026-09-05');
    expect(parseStatementDate('09/05/26')).toBe('2026-09-05');
  });

  it('rejects non-dates', () => {
    expect(parseStatementDate('not a date')).toBeNull();
    expect(parseStatementDate('2026-13-01')).toBeNull();
    expect(parseStatementDate('')).toBeNull();
  });
});

describe('parseStatementAmount', () => {
  it('reads statement conventions', () => {
    expect(parseStatementAmount('$1,234.56')).toBe(1234.56);
    expect(parseStatementAmount('(12.34)')).toBe(-12.34);
    expect(parseStatementAmount('12.34CR')).toBe(-12.34);
    expect(parseStatementAmount('12.34DR')).toBe(12.34);
    expect(parseStatementAmount('-45.00')).toBe(-45);
    expect(parseStatementAmount('45.00-')).toBe(-45);
  });

  it('rejects non-amounts', () => {
    expect(parseStatementAmount('abc')).toBeNull();
    expect(parseStatementAmount('')).toBeNull();
  });
});

describe('parseCsvTransactions', () => {
  it('parses single-amount columns after a preamble', () => {
    const text = [
      'My Bank Statement',
      'Date,Description,Amount',
      '2026-09-05,LOBLAWS #123,$84.20',
      '2026-09-06,STARBUCKS,5.75',
    ].join('\n');
    const { transactions, skipped } = parseCsvTransactions(text);
    expect(transactions).toEqual([
      { date: '2026-09-05', description: 'LOBLAWS #123', amountCAD: 84.2 },
      { date: '2026-09-06', description: 'STARBUCKS', amountCAD: 5.75 },
    ]);
    expect(skipped).toBe(0);
  });

  it('parses debit/credit column pairs and quoted commas', () => {
    const text = [
      'Posted,Details,Debit,Credit',
      '09/05/2026,"SHOP, BIG",84.20,',
      '09/06/2026,REFUND,,12.34',
      'garbage,row,here',
    ].join('\n');
    const { transactions, skipped } = parseCsvTransactions(text);
    expect(transactions).toEqual([
      { date: '2026-09-05', description: 'SHOP, BIG', amountCAD: 84.2 },
      { date: '2026-09-06', description: 'REFUND', amountCAD: -12.34 },
    ]);
    expect(skipped).toBe(1);
  });

  it('reports no header as all-skipped', () => {
    const { transactions, skipped } = parseCsvTransactions('hello\nworld\n');
    expect(transactions).toEqual([]);
    expect(skipped).toBe(2);
  });
});

describe('parsePdfLines', () => {
  it('parses date-led lines and appends continuations', () => {
    const { transactions, skipped } = parsePdfLines([
      'Sep 5, 2026 LOBLAWS #123 84.20',
      'EXTRA INFO LINE',
      '2026-09-06 STARBUCKS 5.75',
      'Page 1',
      'not a transaction at all',
    ]);
    expect(transactions).toEqual([
      { date: '2026-09-05', description: 'LOBLAWS #123 EXTRA INFO LINE', amountCAD: 84.2 },
      { date: '2026-09-06', description: 'STARBUCKS', amountCAD: 5.75 },
    ]);
    expect(skipped).toBe(1);
  });
});

describe('isAccountPayment', () => {
  it('excludes card payments but keeps refunds and spend', () => {
    expect(isAccountPayment('PAYMENT THANK YOU', -1200)).toBe(true);
    expect(isAccountPayment('PAYMENT RECEIVED', -50)).toBe(true);
    expect(isAccountPayment('AMAZON REFUND', -42.5)).toBe(false);
    expect(isAccountPayment('LOBLAWS', 84.2)).toBe(false);
    expect(isAccountPayment('PAYMENT THANK YOU', 1200)).toBe(false);
  });
});

describe('dedupeTransactions', () => {
  it('drops exact repeats from overlapping statements', () => {
    const a = { date: '2026-09-05', description: 'LOBLAWS', amountCAD: 10 };
    const b = { date: '2026-09-06', description: 'LOBLAWS', amountCAD: 10 };
    expect(dedupeTransactions([a, { ...a }, b])).toEqual([a, b]);
  });
});
