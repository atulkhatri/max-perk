import { useEffect, useState, type ReactElement, type ReactNode } from 'react';
import { useAuth } from '../auth/AuthContext';
import { routePath } from '../router';
import { strings } from '../strings';
import { Button } from './ui/button';

export function AuthGate({ children }: { children: ReactNode }): ReactElement {
  const { user, loading, guestError, signInAnonymouslyOnce } = useAuth();
  const [slow, setSlow] = useState(false);

  // Guests enter silently; the banner below is only the fallback when
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

  // No account (signed out, or guest entry failed): the app stays fully
  // usable on the device-local wallet. Auth UI is one compact banner — the
  // full sign-in form lives on the Settings page, not on every page.
  return (
    <div className="flex flex-col gap-3.5">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
        <p className="text-[13px] text-muted-foreground">{guestError ?? strings.auth.signedOutNotice}</p>
        {guestError && (
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => void signInAnonymouslyOnce()}
          >
            {strings.auth.errors.retry}
          </Button>
        )}
        <a href={routePath('settings')}>{strings.auth.signIn}</a>
      </div>
      {children}
    </div>
  );
}
