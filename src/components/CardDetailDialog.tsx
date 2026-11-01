import { useEffect, type ReactElement } from 'react';
import { formatCAD, formatCpp, formatMultiplier, formatPoints } from '../format';
import type { RankedCard } from '../ranking/rank';
import type { BankOfferSeed, ProgramSeed } from '../data/types';
import { strings } from '../strings';
import { Badge } from './ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from './ui/dialog';

function SourceLinks({ text, sourceUrl }: { text: string; sourceUrl?: string }): ReactElement {
  return (
    <>
      {text}
      {sourceUrl && (
        <a className="ml-1.5 text-xs" href={sourceUrl} target="_blank" rel="noreferrer">
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
    <Dialog
      open
      onOpenChange={(openState) => {
        if (!openState) onClose();
      }}
    >
      <DialogContent aria-label={row.card.name}>
        <div className="pr-8">
          <DialogTitle>{row.card.name}</DialogTitle>
          <DialogDescription>
            {row.card.issuer} · {row.card.network} · {formatMultiplier(row.earnRate)} ({formatCpp(row.cpp)}{' '}
            {strings.redemption.perPoint})
          </DialogDescription>
        </div>

        <div className="mt-3 grid grid-cols-2 border-t border-border pt-2.5">
          <div className="py-0.5 pr-3">
            <div className="text-xs font-semibold text-muted-foreground">{strings.check.pointsUnit}</div>
            <div className="font-display text-[28px] leading-[1.2] tracking-tight tabular-nums">
              {formatPoints(row.points)}
            </div>
          </div>
          <div className="border-l border-border py-0.5 pl-3">
            <div className="text-xs font-semibold text-muted-foreground">{strings.check.valueLabel}</div>
            <div className="font-display text-[28px] leading-[1.2] tracking-tight tabular-nums">
              {formatCAD(row.totalValueCAD)}
            </div>
          </div>
        </div>

        {row.tips.length > 0 && (
          <div className="mt-3 flex flex-col gap-2.5 border-t border-dashed border-border pt-2.5">
            {row.tips.map((tip) => (
              <div key={tip.label}>
                <div className="mb-0.5 flex items-center gap-2">
                  <Badge variant="secondary">{strings.check.tipBadge}</Badge>
                  <span className="text-[13.5px] font-bold">{tip.label}</span>
                </div>
                <p className="mt-0.5 text-[13px] text-muted-foreground">{tip.detail}</p>
              </div>
            ))}
          </div>
        )}

        {row.assumptions.length > 0 && (
          <>
            <h2 className="mt-2.5 text-[13px] font-bold tracking-wide text-muted-foreground uppercase">
              {strings.check.whyThisValue}
            </h2>
            <ul className="mt-2 mb-0 list-disc pl-5 text-[13px] text-muted-foreground">
              {row.assumptions.map((note) => (
                <li key={note.text} className="mt-1">
                  <SourceLinks text={note.text} sourceUrl={note.sourceUrl} />
                </li>
              ))}
            </ul>
          </>
        )}

        <h2 className="mt-2.5 text-[13px] font-bold tracking-wide text-muted-foreground uppercase">
          {strings.offers.onThisCard}
        </h2>
        {offers.length === 0 ? (
          <p className="text-[13px] text-muted-foreground">{strings.check.noOffersOnCard}</p>
        ) : (
          <ul className="mt-2 mb-0 list-disc pl-5 text-[13px] text-muted-foreground">
            {offers.map((offer) => (
              <li key={offer.id} className="mt-1">
                <strong>{offer.label}.</strong> {offer.detail} {offer.conditions}
              </li>
            ))}
          </ul>
        )}
        {program && program.redemption.length > 0 && (
          <>
            <h2 className="mt-2.5 text-[13px] font-bold tracking-wide text-muted-foreground uppercase">
              {strings.redemption.title} — {row.card.name}
            </h2>
            <ul className="mt-2 mb-0 list-disc pl-5 text-[13px] text-muted-foreground">
              {program.redemption.map((path) => (
                <li key={path.label} className="mt-1">
                  {path.label} — {formatCpp(path.cpp)} {strings.redemption.perPoint}
                  {path.note ? ` (${path.note})` : ''}
                </li>
              ))}
            </ul>
            <p className="text-[13px] text-muted-foreground">{program.methodology}</p>
          </>
        )}

        {row.coverageNotes.length > 0 && (
          <>
            <h2 className="mt-2.5 text-[13px] font-bold tracking-wide text-muted-foreground uppercase">
              {strings.benefits.title}
            </h2>
            <ul className="mt-2 mb-0 list-disc pl-5 text-[13px] text-muted-foreground">
              {row.coverageNotes.map((note) => (
                <li key={note} className="mt-1">
                  {note}
                </li>
              ))}
            </ul>
            <p className="text-[13px] text-muted-foreground">{strings.benefits.fullTerms}</p>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
