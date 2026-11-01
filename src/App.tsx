import { lazy, Suspense, type ReactElement } from 'react';
import { AuthProvider } from './auth/AuthContext';
import { StatementsSessionProvider } from './statements/session';
import { AppShell } from './components/AppShell';
import { AuthGate } from './components/AuthGate';
import { Toaster } from './components/ui/toaster';
import { useHashRoute } from './router';
import { strings } from './strings';
import { useTheme } from './theme/useTheme';

const CheckPage = lazy(() => import('./pages/CheckPage').then((m) => ({ default: m.CheckPage })));
const SettingsPage = lazy(() => import('./pages/SettingsPage').then((m) => ({ default: m.SettingsPage })));
const SuggestPage = lazy(() => import('./pages/SuggestPage').then((m) => ({ default: m.SuggestPage })));
const StatementsPage = lazy(() => import('./pages/StatementsPage').then((m) => ({ default: m.StatementsPage })));
const WalletPage = lazy(() => import('./pages/WalletPage').then((m) => ({ default: m.WalletPage })));

function RoutedPage(): ReactElement {
  const route = useHashRoute();
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

export function App(): ReactElement {
  useTheme();
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
