import { afterEach, describe, expect, it, vi } from 'vitest';
import { navigate, parseRoute, routePath } from './router';

describe('routePath', () => {
  it('uses clean paths with / as the check home', () => {
    expect(routePath('check')).toBe('/');
    expect(routePath('wallet')).toBe('/wallet');
    expect(routePath('settings')).toBe('/settings');
  });
});

describe('parseRoute', () => {
  it('resolves the home and app paths', () => {
    expect(parseRoute('/', '')).toBe('check');
    expect(parseRoute('/wallet', '')).toBe('wallet');
    expect(parseRoute('/wallet/', '')).toBe('wallet');
    expect(parseRoute('/statements', '')).toBe('statements');
  });

  it('falls back to check for unknown paths', () => {
    expect(parseRoute('/nope', '')).toBe('check');
  });

  it('honours legacy #/route links when the path is unknown', () => {
    expect(parseRoute('/', '#/wallet')).toBe('wallet');
    expect(parseRoute('/nope', '#/settings')).toBe('settings');
  });

  it('prefers the clean path over the hash', () => {
    expect(parseRoute('/suggest', '#/wallet')).toBe('suggest');
  });
});

describe('navigate', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('pushes a new path without reloading', () => {
    const pushState = vi.fn();
    const dispatchEvent = vi.fn();
    vi.stubGlobal('window', {
      location: { pathname: '/', origin: 'http://localhost/' },
      history: { pushState },
      dispatchEvent,
    } as unknown as Window);
    navigate('wallet');
    expect(pushState).toHaveBeenCalledWith(null, '', '/wallet');
    expect(dispatchEvent).toHaveBeenCalledTimes(1);
  });

  it('skips pushing when already on the path', () => {
    const pushState = vi.fn();
    vi.stubGlobal('window', {
      location: { pathname: '/wallet', origin: 'http://localhost/' },
      history: { pushState },
      dispatchEvent: vi.fn(),
    } as unknown as Window);
    navigate('wallet');
    expect(pushState).not.toHaveBeenCalled();
  });
});
