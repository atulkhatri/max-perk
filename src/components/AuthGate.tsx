import { useEffect, useState, type ReactElement, type ReactNode } from 'react';
import { isExpiredSessionError, useAuth } from '../auth/AuthContext';
import { strings } from '../strings';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';

function errorMessage(error: unknown): string {
  const code = (error as { code?: string } | null)?.code;
  if (code === 'auth/popup-blocked') return strings.auth.errors.popupBlocked;
  if (isExpiredSessionError(error)) return strings.auth.errors.sessionExpired;
  return strings.auth.errors.generic;
}

export function AuthGate({ children }: { children: ReactNode }): ReactElement {
  const { user, loading, signInEmail, signUpEmail, signInGoogle, guestError, signInAnonymouslyOnce, sendPasswordReset } =
    useAuth();
  const [mode, setMode] = useState<'in' | 'up' | 'reset'>('in');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [resetSent, setResetSent] = useState(false);
  const [slow, setSlow] = useState(false);

  // Guests enter silently; the manual form below is only the fallback when
  // automatic guest sign-in is unavailable. The shared in-flight attempt
  // dedupes StrictMode double-invokes, so this safely refires after every
  // sign-out (which resets the attempt) instead of only once per mount.
  // The guestError guard stays: without it a permanently failing backend
  // (anonymous disabled, offline) would retry in a hot loop. Explicit
  // retries go through the Retry button instead.
  useEffect(() => {
    if (!loading && !user && !guestError) {
      void signInAnonymouslyOnce();
    }
  }, [loading, user, guestError, signInAnonymouslyOnce]);

  // Safety net: auth (or the silent guest sign-in) hanging — blocked SDK,
  // no network — must not pin the whole app on "Loading…". Offer a retry.
  useEffect(() => {
    if (!loading && (user || guestError)) {
      setSlow(false);
      return;
    }
    const timer = setTimeout(() => setSlow(true), 10000);
    return () => clearTimeout(timer);
  }, [loading, user, guestError]);

  if (user) return <>{children}</>;

  // No account (signed out, or guest entry failed): the app stays fully
  // usable on the device-local wallet. Auth UI is a notice plus an optional
  // sign-in form — never a wall that replaces the app.
  const submitEmail = async (event: React.FormEvent): Promise<void> => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (mode === 'reset') {
        const outcome = await sendPasswordReset(email.trim());
        if (outcome.sent) setResetSent(true);
        else setError(outcome.message);
      } else if (mode === 'in') await signInEmail(email, password);
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

  const switchMode = (next: 'in' | 'up' | 'reset'): void => {
    setMode(next);
    setError(null);
    setResetSent(false);
  };

  const signInForm = (
    <div className="flex flex-col gap-3.5">
      <h1 className="font-display text-[32px] leading-[1.1] font-bold tracking-tight">
        {mode === 'reset' ? strings.auth.resetTitle : mode === 'in' ? strings.auth.title : strings.auth.signUpTitle}
      </h1>
      {mode !== 'reset' && <p className="text-sm text-muted-foreground">{strings.auth.subtitle}</p>}
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
        {mode !== 'reset' && (
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
        )}
        {error && <p className="text-[13px] text-destructive">{error}</p>}
        {resetSent && <p className="text-[13px] text-muted-foreground">{strings.auth.resetSent}</p>}
        <Button type="submit" disabled={busy}>
          {mode === 'reset' ? strings.auth.resetSubmit : mode === 'in' ? strings.auth.signIn : strings.auth.signUp}
        </Button>
      </form>
      {mode !== 'reset' && (
        <Button variant="secondary" type="button" disabled={busy} onClick={() => void submitGoogle()}>
          {strings.auth.google}
        </Button>
      )}
      {mode === 'reset' ? (
        <Button variant="link" type="button" className="self-start px-0" onClick={() => switchMode('in')}>
          {strings.auth.resetBack}
        </Button>
      ) : (
        <>
          {mode === 'in' && (
            <Button variant="link" type="button" className="self-start px-0" onClick={() => switchMode('reset')}>
              {strings.auth.forgotPassword}
            </Button>
          )}
          <Button variant="link" type="button" className="self-start px-0" onClick={() => switchMode(mode === 'in' ? 'up' : 'in')}>
            {mode === 'in' ? strings.auth.needAccount : strings.auth.haveAccount}
          </Button>
        </>
      )}
    </div>
  );

  // Guest entry still in flight (or auth still resolving): usable app with a
  // lightweight status line instead of a blocking spinner.
  if (loading || (!user && !guestError)) {
    return (
      <div className="flex flex-col gap-3">
        <p className="text-sm text-muted-foreground">{strings.common.loading}</p>
        {slow && (
          <>
            <p className="text-[13px] text-muted-foreground">{strings.auth.errors.slowNotice}</p>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              className="self-start"
              onClick={() => window.location.reload()}
            >
              {strings.auth.errors.retry}
            </Button>
          </>
        )}
        {children}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3.5">
      <div className="flex flex-col gap-2">
        <p className="text-[13px] text-muted-foreground">{strings.auth.signedOutNotice}</p>
        {guestError && (
          <div className="flex flex-col gap-2">
            <p role="alert" className="text-[13px] text-destructive">
              {guestError}
            </p>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              className="self-start"
              onClick={() => void signInAnonymouslyOnce()}
            >
              {strings.auth.errors.retry}
            </Button>
          </div>
        )}
      </div>
      {children}
      <details>
        <summary className="cursor-pointer text-sm font-semibold text-primary">
          {strings.auth.optionalSignIn}
        </summary>
        <div className="pt-3">{signInForm}</div>
      </details>
    </div>
  );
}
