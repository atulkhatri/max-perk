import { useEffect, useState, type ReactElement } from 'react';
import { Flag } from 'lucide-react';
import { useAuth } from '../auth/AuthContext';
import { submitCardReport } from '../cardReports/submitCardReport';
import { validateCardReport } from '../cardReports/validateCardReport';
import { db } from '../firebase';
import { formatCAD, formatCpp, formatMultiplier, formatPoints } from '../format';
import type { RankedCard } from '../ranking/rank';
import type { BankOfferSeed, ProgramSeed } from '../data/types';
import { strings } from '../strings';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from './ui/dialog';
import { toast } from './ui/toaster';

const DAY_MS = 24 * 60 * 60 * 1000;
const COOLDOWN_MS = 30 * 1000;
const REPORTS_KEY = 'card-report-sends';

function recentSends(now: number): number[] {
  try {
    const raw = localStorage.getItem(REPORTS_KEY);
    if (!raw) return [];
    const list = JSON.parse(raw) as unknown;
    if (!Array.isArray(list)) return [];
    return list.filter((t): t is number => typeof t === 'number' && now - t < DAY_MS);
  } catch {
    return [];
  }
}

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

/**
 * Card-data report: flag icon + Report label, confirmation first, then one
 * `cardReports` doc for curator review. Guests get a sign-in prompt.
 */
function CardReportSection({ cardId, cardName }: { cardId: string; cardName: string }): ReactElement {
  const { user, isGuest } = useAuth();
  const [confirming, setConfirming] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const t = strings.report;

  if (isGuest || !user) {
    return (
      <div className="mt-2 border-t border-border pt-3">
        <p className="text-[13px] text-muted-foreground">{t.signinPrompt}</p>
      </div>
    );
  }

  const submit = async (): Promise<void> => {
    const now = Date.now();
    const sends = recentSends(now);
    if (sends.length >= 10 || (sends.length > 0 && now - sends[sends.length - 1] < COOLDOWN_MS)) {
      setError(t.errRateLimited);
      return;
    }
    const checked = validateCardReport(
      cardId,
      { uid: user.uid, isAnonymous: user.isAnonymous, email: user.email },
    );
    if (!checked.ok) {
      setError(checked.message);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await submitCardReport(db, user.uid, checked.value);
      localStorage.setItem(REPORTS_KEY, JSON.stringify([...sends, now]));
      setConfirming(false);
      setDone(true);
      toast({ title: t.sentTitle, description: t.sentBody });
    } catch (err) {
      console.error('card report submit failed', err);
      setError(t.errSubmit);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mt-2 border-t border-border pt-3">
      {done ? (
        <p className="text-[13px] text-muted-foreground">{t.sentBody}</p>
      ) : confirming ? (
        <div className="flex flex-col gap-2.5">
          <p className="text-[13px] font-bold">{t.confirmTitle}</p>
          <p className="text-[13px] text-muted-foreground">{t.confirmBody.replace('{card}', cardName)}</p>
          {error && <p className="text-[13px] text-destructive">{error}</p>}
          <div className="flex gap-2.5">
            <Button size="sm" type="button" disabled={busy} onClick={() => void submit()}>
              {t.confirm}
            </Button>
            <Button
              variant="secondary"
              size="sm"
              type="button"
              disabled={busy}
              onClick={() => {
                setConfirming(false);
                setError(null);
              }}
            >
              {t.cancel}
            </Button>
          </div>
        </div>
      ) : (
        <Button variant="secondary" size="sm" type="button" onClick={() => setConfirming(true)}>
          <Flag />
          {t.button}
        </Button>
      )}
    </div>
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
          <div className="mt-3 flex flex-col gap-2.5 rounded-lg border border-border bg-muted p-3">
            {row.tips.map((tip) => (
              <div key={tip.label}>
                <div className="mb-0.5 flex items-center gap-2">
                  <Badge>{strings.check.tipBadge}</Badge>
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

        <CardReportSection cardId={row.card.id} cardName={row.card.name} />
      </DialogContent>
    </Dialog>
  );
}
