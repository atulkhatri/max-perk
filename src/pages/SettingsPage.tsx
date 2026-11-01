import { useState, type ReactElement } from 'react';
import { Moon, Sun, SunMoon } from 'lucide-react';
import { useAuth } from '../auth/AuthContext';
import { useCatalog } from '../data/catalogStore';
import { strings } from '../strings';
import { THEME_MODES, type ThemeMode } from '../theme/themes';
import { useTheme } from '../theme/useTheme';
import { Button } from '../components/ui/button';
import { Card } from '../components/ui/card';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { toast } from '../components/ui/toaster';
import type { UpgradeOutcome } from '../auth/AuthContext';

const MODE_ICONS: Record<ThemeMode, () => ReactElement> = {
  light: () => <Sun />,
  dark: () => <Moon />,
  system: () => <SunMoon />,
};

function upgradeToast(outcome: UpgradeOutcome): void {
  if (outcome.mode === 'merged') {
    toast({ title: strings.settings.mergedTitle, description: strings.settings.mergedBody });
  } else {
    toast({ title: strings.settings.keptTitle, description: strings.settings.keptBody });
  }
}

export function SettingsPage(): ReactElement {
  const { user, isGuest, signOutUser, linkEmail, linkGoogle } = useAuth();
  const { mode, setMode } = useTheme();
  const { catalog } = useCatalog();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const lastRefresh = new Date(`${catalog.dataAsOf}T00:00:00`).toLocaleDateString('en-CA', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  const submitUpgradeEmail = async (event: React.FormEvent): Promise<void> => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      upgradeToast(await linkEmail(email, password));
    } catch (err) {
      setError(err instanceof Error ? err.message : strings.auth.errors.generic);
    } finally {
      setBusy(false);
    }
  };

  const submitUpgradeGoogle = async (): Promise<void> => {
    setBusy(true);
    setError(null);
    try {
      upgradeToast(await linkGoogle());
    } catch (err) {
      setError(err instanceof Error ? err.message : strings.auth.errors.generic);
    } finally {
      setBusy(false);
    }
  };

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
        {isGuest ? (
          <div className="mt-2 flex flex-col gap-3">
            <p className="text-sm font-bold">{strings.settings.guestTitle}</p>
            <ul className="m-0 list-disc pl-5 text-[13px] text-muted-foreground">
              <li className="mt-1">{strings.settings.guestLimitBrowser}</li>
              <li className="mt-1">{strings.settings.guestLimitDevice}</li>
            </ul>
            <p className="text-[13px] text-muted-foreground">{strings.settings.upgradeHint}</p>
            <form className="flex flex-col gap-3" onSubmit={(e) => void submitUpgradeEmail(e)}>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="upgrade-email">{strings.auth.emailLabel}</Label>
                <Input
                  id="upgrade-email"
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="upgrade-password">{strings.auth.passwordLabel}</Label>
                <Input
                  id="upgrade-password"
                  type="password"
                  autoComplete="new-password"
                  required
                  minLength={6}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>
              {error && <p className="text-[13px] text-destructive">{error}</p>}
              <Button type="submit" disabled={busy}>
                {strings.auth.signUp}
              </Button>
            </form>
            <Button variant="secondary" type="button" disabled={busy} onClick={() => void submitUpgradeGoogle()}>
              {strings.auth.google}
            </Button>
          </div>
        ) : (
          <>
            {user?.email && (
              <p className="mt-2 text-[13px] text-muted-foreground">
                {strings.auth.signedInAs} {user.email}
              </p>
            )}
            <Button variant="secondary" type="button" className="mt-3 w-full" onClick={() => void signOutUser()}>
              {strings.auth.signOut}
            </Button>
          </>
        )}
      </Card>
    </div>
  );
}
