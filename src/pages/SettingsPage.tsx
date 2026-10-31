import type { ReactElement } from 'react';
import { useAuth } from '../auth/AuthContext';
import { useCatalog } from '../data/catalogStore';
import { strings } from '../strings';
import { ACCENTS, THEME_MODES } from '../theme/themes';
import { useTheme } from '../theme/useTheme';

export function SettingsPage(): ReactElement {
  const { user, signOutUser } = useAuth();
  const { mode, accent, setMode, setAccent } = useTheme();
  const { catalog, source, meta, loading } = useCatalog();

  return (
    <div className="stack">
      <h1 className="page-title">{strings.settings.title}</h1>

      <div className="card">
        <h2 className="section-title" style={{ marginTop: 0 }}>{strings.settings.appearance}</h2>
        <div className="field" style={{ marginTop: 12 }}>
          <label>{strings.settings.themeMode}</label>
          <div className="segmented" role="group" aria-label={strings.settings.themeMode}>
            {THEME_MODES.map((m) => (
              <button
                key={m}
                className="btn secondary small"
                type="button"
                aria-pressed={mode === m}
                onClick={() => setMode(m)}
              >
                {strings.settings.modes[m]}
              </button>
            ))}
          </div>
        </div>
        <div className="field" style={{ marginTop: 12 }}>
          <label>{strings.settings.themeAccent}</label>
          <div className="swatch-row" role="group" aria-label={strings.settings.themeAccent}>
            {ACCENTS.map((a) => (
              <button
                key={a.id}
                className={`swatch ${a.id}`}
                type="button"
                title={a.label}
                aria-label={a.label}
                aria-pressed={accent === a.id}
                onClick={() => setAccent(a.id)}
              />
            ))}
          </div>
        </div>
      </div>

      <div className="card">
        <h2 className="section-title" style={{ marginTop: 0 }}>{strings.settings.dataTitle}</h2>
        <p className="muted">{strings.settings.methodologyBody}</p>
        <p className="muted">
          {strings.settings.dataAsOf} {catalog.dataAsOf}. {strings.settings.refreshCadence}
        </p>
        {!loading && (
          <p className="muted">
            {source === 'live' ? strings.settings.sourceLive : strings.settings.sourceBundled}
            {source === 'live' && meta?.updatedAt ? ` · ${strings.settings.syncedAt} ${meta.updatedAt.slice(0, 10)}` : ''}
          </p>
        )}
        <h3 className="section-title">{strings.settings.perCardTitle}</h3>
        <ul className="plain-list">
          {catalog.cards.map((card) => (
            <li key={card.id}>
              {card.name} — {card.dataAsOf}
            </li>
          ))}
        </ul>
        <p className="muted">{strings.settings.viewTerms}</p>
      </div>

      <div className="card">
        <h2 className="section-title" style={{ marginTop: 0 }}>{strings.settings.account}</h2>
        {user?.email && (
          <p className="muted">
            {strings.auth.signedInAs} {user.email}
          </p>
        )}
        <button className="btn secondary" type="button" onClick={() => void signOutUser()}>
          {strings.auth.signOut}
        </button>
      </div>
    </div>
  );
}
