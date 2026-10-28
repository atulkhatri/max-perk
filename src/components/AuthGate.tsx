import { useState, type ReactElement, type ReactNode } from 'react';
import { useAuth } from '../auth/AuthContext';
import { strings } from '../strings';

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

  if (loading) return <p className="muted">{strings.common.loading}</p>;
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
    <div className="stack">
      <h1 className="page-title">{mode === 'in' ? strings.auth.title : strings.auth.signUpTitle}</h1>
      <p className="page-subtitle">{strings.auth.subtitle}</p>
      <form className="stack" onSubmit={(e) => void submitEmail(e)}>
        <div className="field">
          <label htmlFor="auth-email">{strings.auth.emailLabel}</label>
          <input
            id="auth-email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
        <div className="field">
          <label htmlFor="auth-password">{strings.auth.passwordLabel}</label>
          <input
            id="auth-password"
            type="password"
            autoComplete={mode === 'in' ? 'current-password' : 'new-password'}
            required
            minLength={6}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>
        {error && <p className="error-text">{error}</p>}
        <button className="btn" type="submit" disabled={busy}>
          {mode === 'in' ? strings.auth.signIn : strings.auth.signUp}
        </button>
      </form>
      <button className="btn secondary" type="button" disabled={busy} onClick={() => void submitGoogle()}>
        {strings.auth.google}
      </button>
      <button
        className="link-btn"
        type="button"
        onClick={() => {
          setMode(mode === 'in' ? 'up' : 'in');
          setError(null);
        }}
      >
        {mode === 'in' ? strings.auth.needAccount : strings.auth.haveAccount}
      </button>
    </div>
  );
}
