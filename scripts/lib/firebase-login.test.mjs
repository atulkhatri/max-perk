// Keyless-auth checks (no network, no real credentials).
import { describe, expect, it, vi } from 'vitest';
import {
  cachedTokenFresh,
  configstoreCandidates,
  firebaseLoginAccessToken,
  readRefreshToken,
  refreshAccessToken,
} from './firebase-login.mjs';

const STORE = JSON.stringify({
  tokens: { refresh_token: 'rt-123', access_token: 'at-cached', expires_at: 9_999_999_999_999 },
});

function mockFetch(body, ok = true, status = 200) {
  return vi.fn().mockResolvedValue({ ok, status, json: async () => body });
}

describe('configstoreCandidates', () => {
  it('prefers XDG_CONFIG_HOME, then home, then APPDATA on Windows', () => {
    const paths = configstoreCandidates(
      { XDG_CONFIG_HOME: '/xdg', HOME: '/home/u', APPDATA: 'C:\\App' },
      'win32',
    );
    expect(paths[0]).toContain('xdg');
    expect(paths[1]).toContain('home');
    expect(paths[1]).toContain('.config');
    expect(paths[paths.length - 1]).toContain('App');
  });

  it('skips APPDATA off Windows', () => {
    const paths = configstoreCandidates({ HOME: '/home/u', APPDATA: 'C:\\App' }, 'linux');
    expect(paths.every((p) => !p.includes('C:\\App'))).toBe(true);
  });
});

describe('readRefreshToken', () => {
  it('reads the CLI refresh token', () => {
    const { refreshToken } = readRefreshToken('store.json', () => STORE);
    expect(refreshToken).toBe('rt-123');
  });

  it('guides to firebase login when the file is missing', () => {
    expect(() =>
      readRefreshToken('missing.json', () => {
        throw new Error('ENOENT');
      }),
    ).toThrow(/firebase login/);
  });

  it('guides to firebase login when the token is missing', () => {
    expect(() => readRefreshToken('store.json', () => '{}')).toThrow(/firebase login/);
  });
});

describe('cachedTokenFresh', () => {
  it('reuses a fresh cached token', () => {
    expect(cachedTokenFresh({ access_token: 'a', expires_at: Date.now() + 3_600_000 })).toBe(true);
  });

  it('rejects expired or missing tokens', () => {
    expect(cachedTokenFresh({ access_token: 'a', expires_at: Date.now() - 1 })).toBe(false);
    expect(cachedTokenFresh({})).toBe(false);
    expect(cachedTokenFresh(null)).toBe(false);
  });
});

describe('refreshAccessToken', () => {
  const creds = { clientId: 'test-client-id', clientSecret: 'test-client-secret' };

  it('posts the CLI refresh flow and returns the access token', async () => {
    const fetchFn = mockFetch({ access_token: 'at-new', expires_in: 3600 });
    const token = await refreshAccessToken('rt-123', { fetchFn, ...creds });
    expect(token).toBe('at-new');
    const [url, init] = fetchFn.mock.calls[0];
    expect(url).toContain('googleapis.com/oauth2/v3/token');
    expect(init.method).toBe('POST');
    expect(init.body).toContain('grant_type=refresh_token');
    expect(init.body).toContain('refresh_token=rt-123');
  });

  it('asks for a fresh login on invalid_grant', async () => {
    await expect(
      refreshAccessToken('rt-bad', { fetchFn: mockFetch({ error: 'invalid_grant' }, false, 400), ...creds }),
    ).rejects.toThrow(/firebase login/);
  });

  it('wraps network failures without leaking the token', async () => {
    const failing = vi.fn().mockRejectedValue(new Error('socket hang up'));
    await expect(refreshAccessToken('rt-secret', { fetchFn: failing, ...creds })).rejects.toThrow(
      /failed to reach Google/,
    );
  });

  it('fails with setup guidance when the client secret is missing', async () => {
    await expect(
      refreshAccessToken('rt-123', { fetchFn: mockFetch({}), clientSecret: '' }),
    ).rejects.toThrow(/FIREBASE_CLIENT_SECRET is not set/);
  });
});

describe('firebaseLoginAccessToken', () => {
  const env = { HOME: '/home/u' };

  it('reuses a fresh cached token without refreshing', async () => {
    const fetchFn = mockFetch({ access_token: 'at-new' });
    const token = await firebaseLoginAccessToken({ env, platform: 'linux', readFile: () => STORE, fetchFn });
    expect(token).toBe('at-cached');
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('refreshes when the cached token is stale', async () => {
    const stale = JSON.stringify({
      tokens: { refresh_token: 'rt-123', access_token: 'old', expires_at: 1 },
    });
    const fetchFn = mockFetch({ access_token: 'at-new', expires_in: 3600 });
    const token = await firebaseLoginAccessToken({
      env,
      platform: 'linux',
      readFile: () => stale,
      fetchFn,
      clientId: 'test-client-id',
      clientSecret: 'test-client-secret',
    });
    expect(token).toBe('at-new');
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it('errors clearly with no CLI login anywhere', async () => {
    await expect(
      firebaseLoginAccessToken({
        env,
        platform: 'linux',
        readFile: () => {
          throw new Error('ENOENT');
        },
      }),
    ).rejects.toThrow(/firebase login/);
  });
});
