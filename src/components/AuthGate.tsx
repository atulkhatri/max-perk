import { useState, type ReactElement, type ReactNode } from 'react';
import { useAuth } from '../auth/AuthContext';
import { strings } from '../strings';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';

function errorMessage(error: unknown): string {
  const code = (error as { code?: string } | null)?.code;
  if (code === 'auth/popup-blocked') return strings.auth.errors.popupBlocked;
  return strings.auth.errors.generic;
}

export function AuthGate({ children }: { children: ReactNode }): ReactElement {
  const { user, loading, signInEmail, signUpEmail, signInGoogle } = useAuth();
  const [mode, setMode] = useState<'in' | 'up'>('in');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (loading) return <p className="text-sm text-muted-foreground">{strings.common.loading}</p>;
  if (user) return <>{children}</>;

  const submitEmail = async (event: React.FormEvent): Promise<void> => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (mode === 'in') await signInEmail(email, password);
      else await signUpEmail(email, password);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const submitGoogle = async (): Promise<void> => {
    setBusy(true);
    setError(null);
    try {
      await signInGoogle();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-3.5">
      <h1 className="font-display text-[32px] leading-[1.1] font-bold tracking-tight">
        {mode === 'in' ? strings.auth.title : strings.auth.signUpTitle}
      </h1>
      <p className="text-sm text-muted-foreground">{strings.auth.subtitle}</p>
      <form className="flex flex-col gap-3.5" onSubmit={(e) => void submitEmail(e)}>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="auth-email">{strings.auth.emailLabel}</Label>
          <Input
            id="auth-email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="auth-password">{strings.auth.passwordLabel}</Label>
          <Input
            id="auth-password"
            type="password"
            autoComplete={mode === 'in' ? 'current-password' : 'new-password'}
            required
            minLength={6}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>
        {error && <p className="text-[13px] text-destructive">{error}</p>}
        <Button type="submit" disabled={busy}>
          {mode === 'in' ? strings.auth.signIn : strings.auth.signUp}
        </Button>
      </form>
      <Button variant="secondary" type="button" disabled={busy} onClick={() => void submitGoogle()}>
        {strings.auth.google}
      </Button>
      <Button
        variant="link"
        type="button"
        className="self-start px-0"
        onClick={() => {
          setMode(mode === 'in' ? 'up' : 'in');
          setError(null);
        }}
      >
        {mode === 'in' ? strings.auth.needAccount : strings.auth.haveAccount}
      </Button>
    </div>
  );
}
