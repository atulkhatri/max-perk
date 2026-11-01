import { useEffect, useState } from 'react';

export type Route = 'check' | 'wallet' | 'suggest' | 'statements' | 'settings';

const ROUTES: Route[] = ['check', 'wallet', 'suggest', 'statements', 'settings'];

function routeFromHash(): Route {
  const hash = window.location.hash.replace(/^#\/?/, '').split('?')[0] as Route;
  return ROUTES.includes(hash) ? hash : 'check';
}

export function useHashRoute(): Route {
  const [route, setRoute] = useState<Route>(routeFromHash);

  useEffect(() => {
    const onChange = (): void => setRoute(routeFromHash());
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);

  return route;
}

export function routePath(route: Route): string {
  return `#/${route}`;
}
