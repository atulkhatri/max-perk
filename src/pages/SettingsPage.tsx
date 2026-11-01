import type { ReactElement } from 'react';
import { Moon, Sun, SunMoon } from 'lucide-react';
import { useAuth } from '../auth/AuthContext';
import { useCatalog } from '../data/catalogStore';
import { strings } from '../strings';
import { THEME_MODES, type ThemeMode } from '../theme/themes';
import { useTheme } from '../theme/useTheme';
import { Button } from '../components/ui/button';
import { Card } from '../components/ui/card';

const MODE_ICONS: Record<ThemeMode, () => ReactElement> = {
  light: () => <Sun />,
  dark: () => <Moon />,
  system: () => <SunMoon />,
};

export function SettingsPage(): ReactElement {
  const { user, signOutUser } = useAuth();
  const { mode, setMode } = useTheme();
  const { catalog } = useCatalog();
  const lastRefresh = new Date(`${catalog.dataAsOf}T00:00:00`).toLocaleDateString('en-CA', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  return (
    <div className="flex flex-col gap-4">
      <h1 className="font-display mt-0.5 text-[32px] leading-[1.1] font-bold tracking-tight">
        {strings.settings.title}
      </h1>

      <Card className="p-[18px]">
        <h2 className="text-[13px] font-bold tracking-wide text-muted-foreground uppercase">
          {strings.settings.appearance}
        </h2>
        <div className="mt-3 flex flex-col gap-1.5">
          <span className="text-[13px] font-semibold">{strings.settings.themeMode}</span>
          <div className="flex gap-1 rounded-md border border-border bg-muted p-1" role="group" aria-label={strings.settings.themeMode}>
            {THEME_MODES.map((m) => {
              const Icon = MODE_ICONS[m];
              return (
                <Button
                  key={m}
                  variant={mode === m ? 'default' : 'ghost'}
                  size="sm"
                  type="button"
                  aria-pressed={mode === m}
                  onClick={() => setMode(m)}
                  className="flex-1"
                >
                  <Icon />
                  {strings.settings.modes[m]}
                </Button>
              );
            })}
          </div>
        </div>
      </Card>

      <Card className="p-[18px]">
        <p className="mb-0 text-[13px] text-muted-foreground">
          {strings.settings.lastRefresh} {lastRefresh}.
        </p>
      </Card>

      <Card className="p-[18px]">
        <h2 className="text-[13px] font-bold tracking-wide text-muted-foreground uppercase">
          {strings.settings.account}
        </h2>
        {user?.email && (
          <p className="mt-2 text-[13px] text-muted-foreground">
            {strings.auth.signedInAs} {user.email}
          </p>
        )}
        <Button variant="secondary" type="button" className="mt-3 w-full" onClick={() => void signOutUser()}>
          {strings.auth.signOut}
        </Button>
      </Card>
    </div>
  );
}
