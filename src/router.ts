import { useEffect, useState } from 'react';

export type Route = 'check' | 'wallet' | 'suggest' | 'statements' | 'settings';

const ROUTES: Route[] = ['check', 'wallet', 'suggest', 'statements', 'settings'];

function cleanSegment(value: string): string {
  return value.replace(/^\/+|\/+$/g, '').split('/')[0] ?? '';
}

/** Pure route resolution, exported for tests. */
export function parseRoute(pathname: string, hash: string): Route {
  const seg = cleanSegment(pathname) as Route;
  if (ROUTES.includes(seg)) return seg;
  // Old #/wallet-style links keep working: resolve them, then clean up below.
  const legacy = hash.replace(/^#\/?/, '').split('?')[0] as Route;
  return ROUTES.includes(legacy) ? legacy : 'check';
}

function routeFromLocation(): Route {
  return parseRoute(window.location.pathname, window.location.hash);
}

/** One-time upgrade of a legacy #/route URL to its clean-path equivalent. */
function upgradeLegacyHash(): void {
  if (cleanSegment(window.location.pathname) !== '') return;
  const legacy = window.location.hash.replace(/^#\/?/, '').split('?')[0] as Route;
  if (ROUTES.includes(legacy)) {
    window.history.replaceState(null, '', routePath(legacy));
  }
}

export function useRoute(): Route {
  const [route, setRoute] = useState<Route>(routeFromLocation);

  useEffect(() => {
    upgradeLegacyHash();
    setRoute(routeFromLocation());
    const onChange = (): void => setRoute(routeFromLocation());
    window.addEventListener('popstate', onChange);
    return () => window.removeEventListener('popstate', onChange);
  }, []);

  return route;
}

export function routePath(route: Route): string {
  return route === 'check' ? '/' : `/${route}`;
}

/** SPA navigation without a full reload (keeps in-memory session state). */
export function navigate(route: Route): void {
  const path = routePath(route);
  if (window.location.pathname !== path) {
    window.history.pushState(null, '', path);
    window.dispatchEvent(new Event('popstate'));
  }
}
