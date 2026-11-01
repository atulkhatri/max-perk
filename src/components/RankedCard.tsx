import type { ReactElement } from 'react';
import { ArrowRight } from 'lucide-react';
import { formatCAD, formatCpp, formatMultiplier, formatPoints } from '../format';
import type { RankedCard } from '../ranking/rank';
import { strings } from '../strings';
import { cn } from '../lib/utils';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { Card } from './ui/card';

export function RankedCardView({
  row,
  isWinner,
  rank,
  onDetails,
}: {
  row: RankedCard;
  isWinner: boolean;
  rank?: number;
  onDetails: () => void;
}): ReactElement {
  const { card } = row;
  return (
    <Card
      className={cn(
        'relative overflow-hidden p-[18px]',
        isWinner && 'border-transparent bg-winner text-winner-foreground shadow-md',
      )}
    >
      {rank !== undefined && (
        <span
          aria-hidden="true"
          className="font-display pointer-events-none absolute right-3 bottom-0.5 text-[44px] leading-none font-bold opacity-10"
        >
          #{String(rank).padStart(2, '0')}
        </span>
      )}
      <div className="flex items-start justify-between gap-2.5">
        <div>
          <div className="text-[17px] font-bold tracking-tight">{card.name}</div>
          <div className={cn('mt-0.5 text-[13px]', isWinner ? 'opacity-80' : 'text-muted-foreground')}>
            {card.issuer} · {card.network} · {formatMultiplier(row.earnRate)} ({formatCpp(row.cpp)} {strings.redemption.perPoint})
          </div>
        </div>
        {isWinner && (
          <Badge className="flex-none bg-primary-foreground text-primary hover:bg-primary-foreground">
            {strings.check.winnerBadge}
          </Badge>
        )}
      </div>

      <div
        className={cn('mt-3 grid grid-cols-2 border-t pt-2.5', isWinner ? 'border-primary-foreground/25' : 'border-border')}
      >
        <div className="py-0.5 pr-3">
          <div className={cn('text-xs font-semibold', isWinner ? 'opacity-80' : 'text-muted-foreground')}>
            {strings.check.pointsUnit}
          </div>
          <div className="font-display text-[28px] leading-[1.2] tracking-tight tabular-nums">
            {formatPoints(row.points)}
          </div>
        </div>
        <div className={cn('border-l py-0.5 pl-3', isWinner ? 'border-primary-foreground/25' : 'border-border')}>
          <div className={cn('text-xs font-semibold', isWinner ? 'opacity-80' : 'text-muted-foreground')}>
            {strings.check.valueLabel}
          </div>
          <div className="font-display text-[28px] leading-[1.2] tracking-tight tabular-nums">
            {formatCAD(row.totalValueCAD)}
          </div>
        </div>
      </div>

      <div className="mt-2.5 flex flex-wrap items-center gap-2">
        {!row.owned && (
          <Badge variant="outline">
            {strings.check.storeCardBadge} · {strings.check.notOwnedNote}
          </Badge>
        )}
        {row.appliedOfferLabels.map((label) => (
          <Badge variant="outline" key={label}>
            {label}
          </Badge>
        ))}
        <Button
          variant="secondary"
          size="sm"
          type="button"
          onClick={onDetails}
          className={cn(
            'border-[1.5px] font-bold',
            isWinner
              ? 'border-current bg-transparent text-winner-foreground hover:bg-white/10 hover:text-winner-foreground'
              : 'border-muted-foreground',
          )}
        >
          {strings.check.detailsButton}
          <ArrowRight />
        </Button>
      </div>

      {row.tips.length > 0 && (
        <div
          className={cn(
            'mt-3 flex flex-col gap-2.5 border-t border-dashed pt-2.5',
            isWinner ? 'border-primary-foreground/25' : 'border-border',
          )}
        >
          {row.tips.map((tip) => (
            <div key={tip.label}>
              <div className="mb-0.5 flex items-center gap-2">
                <Badge variant="secondary">{strings.check.tipBadge}</Badge>
                <span className="text-[13.5px] font-bold">{tip.label}</span>
              </div>
              <p className={cn('mt-0.5 text-[13px]', isWinner ? 'opacity-80' : 'text-muted-foreground')}>
                {tip.detail}
              </p>
            </div>
          ))}
        </div>
      )}

      {row.coverageNotes.length > 0 && (
        <ul className={cn('mt-2 mb-0 list-disc pl-5 text-[13px]', isWinner ? 'opacity-80' : 'text-muted-foreground')}>
          {row.coverageNotes.map((note) => (
            <li key={note} className="mt-1">
              {note}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
