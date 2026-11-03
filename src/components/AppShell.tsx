import type { ReactElement, ReactNode } from 'react';
import { useAuth } from '../auth/AuthContext';
import { usingEmulators } from '../firebase';
import { routePath, useRoute, type Route } from '../router';
import { strings } from '../strings';
import { cn } from '../lib/utils';
import { CheckIcon, LogoMark, SettingsIcon, SuggestIcon, WalletIcon } from './icons';

const TABS: { route: Route; label: string; icon: () => ReactElement }[] = [
  { route: 'check', label: strings.nav.check, icon: CheckIcon },
  { route: 'wallet', label: strings.nav.wallet, icon: WalletIcon },
  { route: 'suggest', label: strings.nav.suggest, icon: SuggestIcon },
  { route: 'settings', label: strings.nav.settings, icon: SettingsIcon },
];

export function AppShell({ children }: { children: ReactNode }): ReactElement {
  const route = useRoute();
  const { user } = useAuth();

  return (
    <div className="flex min-h-dvh flex-col">
      {/* Desktop top navbar; mobile uses the compact header + bottom tab bar. */}
      <header className="hidden border-b border-border bg-card text-card-foreground lg:block">
        <div className="mx-auto flex h-16 w-full max-w-[1200px] items-center gap-8 px-10">
          <a href={routePath('check')} className="flex items-center gap-2.5 no-underline">
            <LogoMark />
            <span className="flex min-w-0 flex-col leading-tight">
              <span className="font-display text-[19px] font-bold tracking-wide text-heading">
                {strings.app.name}
              </span>
              <span className="truncate text-xs font-medium text-muted-foreground">{strings.app.tagline}</span>
            </span>
          </a>
          {
            <nav aria-label={strings.app.name} className="flex items-center gap-1">
              {TABS.map((tab) => {
                const Icon = tab.icon;
                const active = route === tab.route;
                return (
                  <a
                    key={tab.route}
                    href={routePath(tab.route)}
                    aria-current={active ? 'page' : undefined}
                    className={cn(
                      'flex h-9 items-center gap-2 rounded-lg px-3 text-sm font-semibold no-underline',
                      active ? 'bg-accent text-primary' : 'text-muted-foreground hover:bg-muted',
                    )}
                  >
                    <Icon />
                    {tab.label}
                  </a>
                );
              })}
            </nav>
          }
          <span className="ml-auto flex items-center gap-3">
            {user?.email && (
              <span className="max-w-56 truncate text-[13px] text-muted-foreground">{user.email}</span>
            )}
            {usingEmulators && (
              <span className="rounded-full bg-accent px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap text-primary">
                {strings.app.emulatorBadge}
              </span>
            )}
          </span>
        </div>
      </header>

      <div className="mx-auto flex w-full max-w-[1200px] flex-1 flex-col sm:border-x sm:border-border">
        <header className="sticky top-0 z-10 flex items-center gap-3 border-b border-border bg-header px-5 py-3 text-header-foreground lg:hidden">
          <span className="flex-none">
            <LogoMark />
          </span>
          <span className="flex min-w-0 flex-col leading-tight">
            <span className="font-display text-[19px] font-bold tracking-wide text-heading">{strings.app.name}</span>
            <span className="truncate text-xs font-medium text-muted-foreground">{strings.app.tagline}</span>
          </span>
          {usingEmulators && (
            <span className="ml-auto rounded-full bg-accent px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap text-primary">
              {strings.app.emulatorBadge}
            </span>
          )}
        </header>
        <main className="flex flex-1 flex-col px-5 pt-6 pb-[calc(20px+env(safe-area-inset-bottom))] lg:px-10 lg:pb-10">
          <div className="mx-auto flex w-full max-w-2xl flex-col gap-4 lg:max-w-none">{children}</div>
        </main>
      </div>
      {
        <nav
          aria-label={strings.app.name}
          className="sticky bottom-0 z-10 mt-auto border-t border-border bg-card/95 backdrop-blur-md lg:hidden"
        >
          <div className="mx-auto grid w-full max-w-[640px] grid-cols-4 gap-1 px-2.5 pt-1.5 pb-[calc(6px+env(safe-area-inset-bottom))]">
            {TABS.map((tab) => {
              const Icon = tab.icon;
              const active = route === tab.route;
              return (
                <a
                  key={tab.route}
                  href={routePath(tab.route)}
                  aria-current={active ? 'page' : undefined}
                  className={cn(
                    'flex min-h-12 flex-col items-center justify-center gap-0.5 rounded-xl text-[11px] font-bold no-underline',
                    active ? 'bg-accent text-primary' : 'text-muted-foreground',
                  )}
                >
                  <Icon />
                  {tab.label}
                </a>
              );
            })}
          </div>
        </nav>
      }
    </div>
  );
}
