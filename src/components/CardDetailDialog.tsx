import { useEffect, type ReactElement } from 'react';
import { formatCAD, formatCpp, formatMultiplier, formatPoints } from '../format';
import type { RankedCard } from '../ranking/rank';
import type { BankOfferSeed, ProgramSeed } from '../data/types';
import { strings } from '../strings';

function SourceLinks({ text, sourceUrl }: { text: string; sourceUrl?: string }): ReactElement {
  return (
    <>
      {text}
      {sourceUrl && (
        <a className="source-link" href={sourceUrl} target="_blank" rel="noreferrer">
          {strings.check.sourceLink}
        </a>
      )}
    </>
  );
}

/** Per-card detail sheet: everything below the fold, attributed to one card. */
export function CardDetailDialog({
  row,
  program,
  offers,
  onClose,
}: {
  row: RankedCard;
  program?: ProgramSeed;
  offers: BankOfferSeed[];
  onClose: () => void;
}): ReactElement {
  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="dialog-backdrop" onClick={onClose}>
      <div
        className="dialog-sheet card"
        role="dialog"
        aria-modal="true"
        aria-label={row.card.name}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="rank-card-top">
          <div>
            <div className="rank-card-name">{row.card.name}</div>
            <div className="rank-card-sub">
              {row.card.issuer} · {row.card.network} · {formatMultiplier(row.earnRate)} ({formatCpp(row.cpp)}{' '}
              {strings.redemption.perPoint})
            </div>
          </div>
          <button className="btn secondary small" type="button" onClick={onClose}>
            {strings.common.close}
          </button>
        </div>

        <div className="stat-duo">
          <div className="stat">
            <div className="label">{strings.check.pointsUnit}</div>
            <div className="value">{formatPoints(row.points)}</div>
          </div>
          <div className="stat">
            <div className="label">{strings.check.valueLabel}</div>
            <div className="value gold">{formatCAD(row.totalValueCAD)}</div>
          </div>
        </div>

        {row.tips.length > 0 && (
          <div className="tip-callout">
            {row.tips.map((tip) => (
              <div key={tip.label}>
                <div className="tip-head">
                  <span className="badge">{strings.check.tipBadge}</span>
                  <span className="tip-title">{tip.label}</span>
                </div>
                <p className="muted">{tip.detail}</p>
              </div>
            ))}
          </div>
        )}

        {row.assumptions.length > 0 && (
          <>
            <h2 className="section-title">{strings.check.whyThisValue}</h2>
            <ul className="assumption-list">
              {row.assumptions.map((note) => (
                <li key={note.text}>
                  <SourceLinks text={note.text} sourceUrl={note.sourceUrl} />
                </li>
              ))}
            </ul>
          </>
        )}

        <h2 className="section-title">{strings.offers.onThisCard}</h2>
        {offers.length === 0 ? (
          <p className="muted">{strings.check.noOffersOnCard}</p>
        ) : (
          <ul className="plain-list">
            {offers.map((offer) => (
              <li key={offer.id}>
                <strong>{offer.label}.</strong> {offer.detail} {offer.conditions}
              </li>
            ))}
          </ul>
        )}
        <p className="muted">{strings.offers.illustrativeNote}</p>

        {program && program.redemption.length > 0 && (
          <>
            <h2 className="section-title">
              {strings.redemption.title} — {row.card.name}
            </h2>
            <ul className="plain-list">
              {program.redemption.map((path) => (
                <li key={path.label}>
                  {path.label} — {formatCpp(path.cpp)} {strings.redemption.perPoint}
                  {path.note ? ` (${path.note})` : ''}
                </li>
              ))}
            </ul>
            <p className="muted">{program.methodology}</p>
          </>
        )}

        {row.coverageNotes.length > 0 && (
          <>
            <h2 className="section-title">{strings.benefits.title}</h2>
            <ul className="plain-list">
              {row.coverageNotes.map((note) => (
                <li key={note}>{note}</li>
              ))}
            </ul>
            <p className="muted">{strings.benefits.fullTerms}</p>
          </>
        )}
      </div>
    </div>
  );
}
