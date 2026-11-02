import { describe, expect, it } from 'vitest';
import { isExpiredSessionError, isStaleCredentialError } from './AuthContext';

function coded(code: string): Error {
  const err = new Error(`Firebase: Error (${code}).`) as Error & { code: string };
  err.code = code;
  return err;
}

describe('isStaleCredentialError', () => {
  it('flags dead server-side sessions', () => {
    for (const code of [
      'auth/invalid-refresh-token',
      'auth/user-token-expired',
      'auth/user-disabled',
      'auth/user-not-found',
    ]) {
      expect(isStaleCredentialError(coded(code))).toBe(true);
    }
  });

  it('ignores actionable and unknown errors', () => {
    expect(isStaleCredentialError(coded('auth/wrong-password'))).toBe(false);
    expect(isStaleCredentialError(coded('auth/popup-blocked'))).toBe(false);
    expect(isStaleCredentialError(new Error('network down'))).toBe(false);
    expect(isStaleCredentialError(null)).toBe(false);
    expect(isStaleCredentialError(undefined)).toBe(false);
  });

  it('limits the session-expired message to dead tokens', () => {
    expect(isExpiredSessionError(coded('auth/invalid-refresh-token'))).toBe(true);
    expect(isExpiredSessionError(coded('auth/user-token-expired'))).toBe(true);
    // A mistyped email is a failed sign-in, not an expired session.
    expect(isExpiredSessionError(coded('auth/user-not-found'))).toBe(false);
    expect(isExpiredSessionError(coded('auth/user-disabled'))).toBe(false);
    expect(isExpiredSessionError(coded('auth/wrong-password'))).toBe(false);
  });
});
