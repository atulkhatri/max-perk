import { lazy, Suspense, type ReactElement } from 'react';
import { AuthProvider } from './auth/AuthContext';
import { AppShell } from './components/AppShell';
import { AuthGate } from './components/AuthGate';
import { useHashRoute } from './router';
import { strings } from './strings';
import { useTheme } from './theme/useTheme';

const CheckPage = lazy(() => import('./pages/CheckPage').then((m) => ({ default: m.CheckPage })));
const SettingsPage = lazy(() => import('./pages/SettingsPage').then((m) => ({ default: m.SettingsPage })));
const SuggestPage = lazy(() => import('./pages/SuggestPage').then((m) => ({ default: m.SuggestPage })));
const WalletPage = lazy(() => import('./pages/WalletPage').then((m) => ({ default: m.WalletPage })));

function RoutedPage(): ReactElement {
  const route = useHashRoute();
  switch (route) {
    case 'wallet':
      return <WalletPage />;
    case 'suggest':
      return <SuggestPage />;
    case 'settings':
      return <SettingsPage />;
    case 'check':
    default:
      return <CheckPage />;
  }
}

export function App(): ReactElement {
  useTheme();
  return (
    <AuthProvider>
      <AppShell>
        <AuthGate>
          <Suspense fallback={<p className="muted">{strings.common.loading}</p>}>
            <RoutedPage />
          </Suspense>
        </AuthGate>
      </AppShell>
    </AuthProvider>
  );
}
