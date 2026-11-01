import { describe, expect, it } from 'vitest';
import { resetPasswordOutcome } from './AuthContext';
import { strings } from '../strings';

function coded(code: string): { code: string } {
  return { code };
}

describe('resetPasswordOutcome', () => {
  it('reports sent on success and on unknown email (no account enumeration)', () => {
    expect(resetPasswordOutcome(null)).toEqual({ sent: true });
    expect(resetPasswordOutcome(undefined)).toEqual({ sent: true });
    expect(resetPasswordOutcome(coded('auth/user-not-found'))).toEqual({ sent: true });
  });

  it('asks for a valid email on malformed addresses', () => {
    expect(resetPasswordOutcome(coded('auth/invalid-email'))).toEqual({
      sent: false,
      message: strings.auth.errors.invalidEmail,
    });
    expect(resetPasswordOutcome(coded('auth/missing-email'))).toEqual({
      sent: false,
      message: strings.auth.errors.invalidEmail,
    });
  });

  it('falls back to generic for anything else', () => {
    expect(resetPasswordOutcome(coded('auth/too-many-requests'))).toEqual({
      sent: false,
      message: strings.auth.errors.generic,
    });
    expect(resetPasswordOutcome(new Error('boom'))).toEqual({
      sent: false,
      message: strings.auth.errors.generic,
    });
  });
});
