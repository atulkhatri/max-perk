import type { ReactElement } from 'react';
import { formatCAD, formatCpp, formatMultiplier, formatPoints } from '../format';
import type { RankedCard } from '../ranking/rank';
import { strings } from '../strings';

export function RankedCardView({ row, isWinner }: { row: RankedCard; isWinner: boolean }): ReactElement {
  const { card } = row;
  return (
    <article className={isWinner ? 'card winner' : 'card'}>
      <div className="rank-card-top">
        <div>
          <div className="rank-card-name">{card.name}</div>
          <div className="rank-card-sub">
            {card.issuer} · {card.network} · {formatMultiplier(row.earnRate)} ({formatCpp(row.cpp)} {strings.redemption.perPoint})
          </div>
        </div>
        {isWinner && <span className="badge">{strings.check.winnerBadge}</span>}
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

      <div className="row" style={{ marginTop: 10, flexWrap: 'wrap' }}>
        {!row.owned && <span className="badge ghost">{strings.check.storeCardBadge} · {strings.check.notOwnedNote}</span>}
        {row.appliedOfferLabels.map((label) => (
          <span className="badge ghost" key={label}>{label}</span>
        ))}
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

      {row.coverageNotes.length > 0 && (
        <ul className="plain-list">
          {row.coverageNotes.map((note) => (
            <li key={note}>{note}</li>
          ))}
        </ul>
      )}

      {row.assumptions.length > 0 && (
        <details style={{ marginTop: 8 }}>
          <summary className="muted">{strings.check.assumptionsTitle}</summary>
          <ul className="assumption-list">
            {row.assumptions.map((note) => (
              <li key={note.text}>
                {note.text}
                {note.sourceUrl && (
                  <a className="source-link" href={note.sourceUrl} target="_blank" rel="noreferrer">
                    {strings.check.sourceLink}
                  </a>
                )}
              </li>
            ))}
          </ul>
        </details>
      )}
    </article>
  );
}
