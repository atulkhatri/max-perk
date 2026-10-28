import type { ReactElement } from 'react';
import { AuthProvider } from './auth/AuthContext';
import { AppShell } from './components/AppShell';
import { AuthGate } from './components/AuthGate';
import { CheckPage } from './pages/CheckPage';
import { SettingsPage } from './pages/SettingsPage';
import { SuggestPage } from './pages/SuggestPage';
import { WalletPage } from './pages/WalletPage';
import { useHashRoute } from './router';
import { useTheme } from './theme/useTheme';

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
          <RoutedPage />
        </AuthGate>
      </AppShell>
    </AuthProvider>
  );
}
