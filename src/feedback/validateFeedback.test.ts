import { describe, expect, it } from 'vitest';
import { validateFeedback } from './validateFeedback';
import { strings } from '../strings';

const USER = { uid: 'user-1', isAnonymous: false, email: 'me@example.com' };

describe('validateFeedback', () => {
  it('accepts the four routing examples with their kinds', () => {
    const cases: [string, string][] = [
      ['feature', 'I want to link my US credit card into the app'],
      ['correction', 'The reward points of Scotiabank Passport is incorrect'],
      ['bug', 'The website shows error when I add any card'],
      ['bug', 'The website shows 0 rewards for my card'],
    ];
    for (const [kind, text] of cases) {
      const result = validateFeedback({ kind, text }, USER);
      expect(result).toEqual({ ok: true, value: { kind, text, contact: 'me@example.com' } });
    }
  });

  it('attaches the account email and trims it', () => {
    expect(
      validateFeedback(
        { kind: 'bug', text: 'Something broke badly here' },
        { ...USER, email: '  me@example.com  ' },
      ),
    ).toEqual({
      ok: true,
      value: { kind: 'bug', text: 'Something broke badly here', contact: 'me@example.com' },
    });
  });

  it('rejects bad input with form copy', () => {
    const t = strings.settings.feedback;
    expect(validateFeedback({ kind: 'bug', text: 'too short' }, USER)).toEqual({
      ok: false,
      message: t.errTooShort,
    });
    expect(validateFeedback({ kind: 'bug', text: 'x'.repeat(2001) }, USER)).toEqual({
      ok: false,
      message: t.errTooLong,
    });
    expect(validateFeedback({ kind: 'idea', text: 'A perfectly fine length report' }, USER)).toEqual({
      ok: false,
      message: t.errKind,
    });
  });

  it('rejects accounts without a usable email', () => {
    const t = strings.settings.feedback;
    for (const email of [null, '', 'not-an-email', `a@${'b'.repeat(251)}.c`]) {
      expect(validateFeedback({ kind: 'bug', text: 'A perfectly fine length report' }, { ...USER, email })).toEqual({
        ok: false,
        message: t.errNoEmail,
      });
    }
  });

  it('rejects signed-out and anonymous senders', () => {
    const t = strings.settings.feedback;
    const input = { kind: 'bug', text: 'A perfectly fine length report' };
    expect(validateFeedback(input, { uid: null, isAnonymous: false, email: 'me@example.com' })).toEqual({
      ok: false,
      message: t.errSignin,
    });
    expect(validateFeedback(input, { uid: 'guest-1', isAnonymous: true, email: null })).toEqual({
      ok: false,
      message: t.errSignin,
    });
  });
});
