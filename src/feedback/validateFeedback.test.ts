import { describe, expect, it } from 'vitest';
import { validateFeedback } from './validateFeedback';
import { strings } from '../strings';

const USER = { uid: 'user-1', isAnonymous: false };

describe('validateFeedback', () => {
  it('accepts the four routing examples with their kinds', () => {
    const cases: [string, string][] = [
      ['feature', 'I want to link my US credit card into the app'],
      ['correction', 'The reward points of Scotiabank Passport is incorrect'],
      ['bug', 'The website shows error when I add any card'],
      ['bug', 'The website shows 0 rewards for my card'],
    ];
    for (const [kind, text] of cases) {
      const result = validateFeedback({ kind, text, contact: '' }, USER);
      expect(result).toEqual({ ok: true, value: { kind, text } });
    }
  });

  it('keeps a valid contact and drops a blank one', () => {
    expect(
      validateFeedback({ kind: 'bug', text: 'Something broke badly here', contact: 'me@example.com' }, USER),
    ).toEqual({
      ok: true,
      value: { kind: 'bug', text: 'Something broke badly here', contact: 'me@example.com' },
    });
  });

  it('rejects bad input with form copy', () => {
    const t = strings.settings.feedback;
    expect(validateFeedback({ kind: 'bug', text: 'too short', contact: '' }, USER)).toEqual({
      ok: false,
      message: t.errTooShort,
    });
    expect(validateFeedback({ kind: 'bug', text: 'x'.repeat(2001), contact: '' }, USER)).toEqual({
      ok: false,
      message: t.errTooLong,
    });
    expect(validateFeedback({ kind: 'idea', text: 'A perfectly fine length report', contact: '' }, USER)).toEqual({
      ok: false,
      message: t.errKind,
    });
    expect(
      validateFeedback({ kind: 'bug', text: 'A perfectly fine length report', contact: 'not-an-email' }, USER),
    ).toEqual({ ok: false, message: t.errEmail });
    expect(
      validateFeedback({ kind: 'bug', text: 'A perfectly fine length report', contact: `a@${'b'.repeat(251)}.c` }, USER),
    ).toEqual({ ok: false, message: t.errEmail });
  });

  it('rejects signed-out and anonymous senders', () => {
    const t = strings.settings.feedback;
    const input = { kind: 'bug', text: 'A perfectly fine length report', contact: '' };
    expect(validateFeedback(input, { uid: null, isAnonymous: false })).toEqual({
      ok: false,
      message: t.errSignin,
    });
    expect(validateFeedback(input, { uid: 'guest-1', isAnonymous: true })).toEqual({
      ok: false,
      message: t.errSignin,
    });
  });
});
