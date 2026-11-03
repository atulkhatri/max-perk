import { lazy, Suspense, useEffect, type ReactElement } from 'react';
import { AuthProvider } from './auth/AuthContext';
import { StatementsSessionProvider } from './statements/session';
import { AppShell } from './components/AppShell';
import { AuthGate } from './components/AuthGate';
import { Toaster } from './components/ui/toaster';
import { navigate, useRoute, type Route } from './router';
import { strings } from './strings';
import { useTheme } from './theme/useTheme';

const CheckPage = lazy(() => import('./pages/CheckPage').then((m) => ({ default: m.CheckPage })));
const SettingsPage = lazy(() => import('./pages/SettingsPage').then((m) => ({ default: m.SettingsPage })));
const SuggestPage = lazy(() => import('./pages/SuggestPage').then((m) => ({ default: m.SuggestPage })));
const StatementsPage = lazy(() => import('./pages/StatementsPage').then((m) => ({ default: m.StatementsPage })));
const WalletPage = lazy(() => import('./pages/WalletPage').then((m) => ({ default: m.WalletPage })));

function RoutedPage(): ReactElement {
  const route = useRoute();
  switch (route) {
    case 'wallet':
      return <WalletPage />;
    case 'suggest':
      return <SuggestPage />;
    case 'statements':
      return <StatementsPage />;
    case 'settings':
      return <SettingsPage />;
    case 'check':
    default:
      return <CheckPage />;
  }
}

const APP_PATHS = new Set(['', 'check', 'wallet', 'suggest', 'statements', 'settings']);

export function App(): ReactElement {
  useTheme();
  // SPA link handling: same-origin taps on app paths navigate without a full
  // reload (which would wipe in-memory state such as statement results).
  // Modifier/right clicks and off-app links behave like normal links.
  useEffect(() => {
    const onClick = (event: MouseEvent): void => {
      if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const anchor = (event.target as HTMLElement).closest?.('a[href]') as HTMLAnchorElement | null;
      if (!anchor) return;
      let url: URL;
      try {
        url = new URL(anchor.href);
      } catch {
        return;
      }
      if (url.origin !== window.location.origin) return;
      const seg = url.pathname.replace(/^\/+|\/+$/g, '').split('/')[0] ?? '';
      if (!APP_PATHS.has(seg)) return;
      event.preventDefault();
      navigate((seg === '' ? 'check' : seg) as Route);
    };
    document.addEventListener('click', onClick);
    return () => document.removeEventListener('click', onClick);
  }, []);
  return (
    <AuthProvider>
      <StatementsSessionProvider>
      <AppShell>
        <AuthGate>
          <Suspense fallback={<p className="text-sm text-muted-foreground">{strings.common.loading}</p>}>
            <RoutedPage />
          </Suspense>
        </AuthGate>
      </AppShell>
      <Toaster />
      </StatementsSessionProvider>
    </AuthProvider>
  );
}
