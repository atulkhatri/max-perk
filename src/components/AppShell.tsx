import type { ReactElement, ReactNode } from 'react';
import { useAuth } from '../auth/AuthContext';
import { usingEmulators } from '../firebase';
import { routePath, useHashRoute, type Route } from '../router';
import { strings } from '../strings';
import { CheckIcon, LogoMark, SettingsIcon, SuggestIcon, WalletIcon } from './icons';

const TABS: { route: Route; label: string; icon: () => ReactElement }[] = [
  { route: 'check', label: strings.nav.check, icon: CheckIcon },
  { route: 'wallet', label: strings.nav.wallet, icon: WalletIcon },
  { route: 'suggest', label: strings.nav.suggest, icon: SuggestIcon },
  { route: 'settings', label: strings.nav.settings, icon: SettingsIcon },
];

export function AppShell({ children }: { children: ReactNode }): ReactElement {
  const route = useHashRoute();
  const { user } = useAuth();

  return (
    <div className="app">
      <header className="appbar">
        <span className="wordmark">
          <LogoMark />
          {strings.app.name}
        </span>
        {usingEmulators && <span className="env-badge">{strings.app.emulatorBadge}</span>}
      </header>
      <main className="main">{children}</main>
      {user && (
        <nav className="tabbar" aria-label={strings.app.name}>
          {TABS.map((tab) => {
            const Icon = tab.icon;
            return (
              <a
                key={tab.route}
                href={routePath(tab.route)}
                aria-current={route === tab.route ? 'page' : undefined}
              >
                <Icon />
                {tab.label}
              </a>
            );
          })}
        </nav>
      )}
    </div>
  );
}
