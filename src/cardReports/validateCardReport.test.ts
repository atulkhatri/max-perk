import { describe, expect, it } from 'vitest';
import { validateCardReport } from './validateCardReport';
import { strings } from '../strings';

const USER = { uid: 'user-1', isAnonymous: false, email: 'me@example.com' };

describe('validateCardReport', () => {
  it('accepts a card id and attaches the account email', () => {
    expect(validateCardReport('amex-cobalt', USER)).toEqual({
      ok: true,
      value: { cardId: 'amex-cobalt', contact: 'me@example.com' },
    });
  });

  it('rejects bad card ids', () => {
    const t = strings.report;
    for (const cardId of ['', 'x'.repeat(129), null, undefined, 42]) {
      expect(validateCardReport(cardId, USER)).toEqual({ ok: false, message: t.errSubmit });
    }
  });

  it('rejects accounts without a usable email', () => {
    const t = strings.report;
    for (const email of [null, '', 'not-an-email']) {
      expect(validateCardReport('amex-cobalt', { ...USER, email })).toEqual({
        ok: false,
        message: t.errNoEmail,
      });
    }
  });

  it('rejects signed-out and anonymous senders', () => {
    const t = strings.report;
    expect(validateCardReport('amex-cobalt', { uid: null, isAnonymous: false, email: 'me@example.com' })).toEqual(
      { ok: false, message: t.signinPrompt },
    );
    expect(validateCardReport('amex-cobalt', { uid: 'guest-1', isAnonymous: true, email: null })).toEqual({
      ok: false,
      message: t.signinPrompt,
    });
  });
});
