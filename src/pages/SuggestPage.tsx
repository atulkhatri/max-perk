import { useMemo, type ReactElement } from 'react';
import { formatCAD } from '../format';
import { useCatalog } from '../data/catalogStore';
import { DEFAULT_SPEND_PROFILE, SUGGEST_THRESHOLD_CAD, suggestNewCards } from '../ranking/rank';
import { routePath } from '../router';
import { strings } from '../strings';
import { useWallet } from '../wallet/useWallet';

export function SuggestPage(): ReactElement {
  const { cardIds, loading } = useWallet();
  const { catalog, loading: catalogLoading } = useCatalog();
  const suggestions = useMemo(() => suggestNewCards(catalog, cardIds), [catalog, cardIds]);

  if (loading || catalogLoading) return <p className="muted">{strings.common.loading}</p>;

  if (cardIds.length === 0) {
    return (
      <div className="stack">
        <h1 className="page-title">{strings.suggest.title}</h1>
        <div className="card">
          <div className="empty">
            <h2>{strings.check.noWalletTitle}</h2>
            <p>{strings.check.noWalletBody}</p>
            <a className="btn small" style={{ textDecoration: 'none', display: 'inline-block' }} href={routePath('wallet')}>
              {strings.check.goToWallet}
            </a>
          </div>
        </div>
      </div>
    );
  }

  if (suggestions.length === 0) {
    return (
      <div className="stack">
        <h1 className="page-title">{strings.suggest.title}</h1>
        <p className="page-subtitle">{strings.suggest.subtitle}</p>
        <div className="card">
          <div className="empty">
            <h2>{strings.suggest.noSuggestionTitle}</h2>
            <p>{strings.suggest.noSuggestionBody}</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="stack">
      <h1 className="page-title">{strings.suggest.title}</h1>
      <p className="page-subtitle">{strings.suggest.subtitle}</p>
      {suggestions.map((s) => (
        <div className="card" key={s.card.id}>
          <div className="rank-card-name">{s.card.name}</div>
          <div className="rank-card-sub">
            {s.card.issuer} · {s.card.network} ·{' '}
            {s.card.annualFeeCAD === 0 ? strings.common.free : `${formatCAD(s.card.annualFeeCAD)}${strings.wallet.feePerYear}`}
          </div>
          <div className="stat-duo">
            <div className="stat">
              <div className="label">{strings.suggest.incrementalValue}{strings.suggest.perYear}</div>
              <div className="value gold">+{formatCAD(s.incrementalCAD, 0)}</div>
            </div>
            <div className="stat">
              <div className="label">{strings.check.valueLabel}{strings.suggest.perYear}</div>
              <div className="value">{formatCAD(s.annualValueCAD, 0)}</div>
            </div>
          </div>
        </div>
      ))}
      <div className="card">
        <h2 className="section-title" style={{ marginTop: 0 }}>{strings.check.assumptionsTitle}</h2>
        <ul className="assumption-list">
          <li>
            Suggestions use a default monthly spend profile:{' '}
            {DEFAULT_SPEND_PROFILE.map((p) => `${strings.categories[p.category]} ${formatCAD(p.monthlyCAD, 0)}`).join(' · ')}.
          </li>
          <li>A card is suggested only when it beats your best owned card by at least {formatCAD(SUGGEST_THRESHOLD_CAD, 0)}{strings.suggest.perYear}.</li>
        </ul>
      </div>
    </div>
  );
}
