import { useEffect, useMemo, useState, type ReactElement } from 'react';
import { formatCAD } from '../format';
import { useCatalog } from '../data/catalogStore';
import type { CardSeed, EarnCategory } from '../data/types';
import { activeSpendProfile, annualValue, SUGGEST_THRESHOLD_CAD, suggestNewCards } from '../ranking/rank';
import { routePath } from '../router';
import { strings } from '../strings';
import { SPEND_PROFILE_CATEGORIES } from '../wallet/repository';
import { useWallet } from '../wallet/useWallet';
import { Button } from '../components/ui/button';
import { Card } from '../components/ui/card';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { StatementsBanner } from '../components/StatementsBanner';

function SpendProfileCard({
  spendProfile,
  onCommit,
  onReset,
}: {
  spendProfile: Partial<Record<EarnCategory, number>> | undefined;
  onCommit: (profile: Partial<Record<EarnCategory, number>>) => void;
  onReset: () => void;
}): ReactElement {
  const active = activeSpendProfile(spendProfile);
  const [draft, setDraft] = useState<Record<string, string>>(() =>
    Object.fromEntries(active.map((p) => [p.category, String(p.monthlyCAD)])),
  );
  // Refresh the draft when the stored profile changes elsewhere (reset, sync).
  useEffect(() => {
    setDraft(Object.fromEntries(activeSpendProfile(spendProfile).map((p) => [p.category, String(p.monthlyCAD)])));
  }, [JSON.stringify(spendProfile)]);

  // Explicit Save: one write for the whole profile, changed fields only.
  const save = (): void => {
    const next: Partial<Record<EarnCategory, number>> = { ...(spendProfile ?? {}) };
    const fixed: Record<string, string> = {};
    let changed = false;
    for (const category of SPEND_PROFILE_CATEGORIES) {
      const raw = (draft[category] ?? '').trim();
      const current = spendProfile?.[category];
      if (raw === '') {
        if (current !== undefined) {
          delete next[category];
          changed = true;
        }
        continue;
      }
      const value = Number(raw);
      if (!Number.isFinite(value) || value < 0) {
        // Revert invalid input to the stored value.
        fixed[category] = String(current ?? activeSpendProfile().find((p) => p.category === category)?.monthlyCAD ?? 0);
        continue;
      }
      if (current !== value) {
        next[category] = value;
        changed = true;
      }
    }
    if (Object.keys(fixed).length > 0) setDraft((d) => ({ ...d, ...fixed }));
    if (changed) onCommit(next);
  };

  return (
    <Card className="p-[18px]">
      <h2 className="text-[17px] font-bold">{strings.suggest.spendTitle}</h2>
      <p className="mt-1 text-sm text-muted-foreground">{strings.suggest.spendSubtitle}</p>
      <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
        {SPEND_PROFILE_CATEGORIES.map((category) => (
          <div key={category} className="flex flex-col gap-1.5">
            <Label htmlFor={`spend-${category}`}>{strings.categories[category]}</Label>
            <Input
              id={`spend-${category}`}
              type="number"
              inputMode="decimal"
              min={0}
              value={draft[category] ?? ''}
              onChange={(e) => setDraft((d) => ({ ...d, [category]: e.target.value }))}
            />
          </div>
        ))}
      </div>
      <div className="mt-3 flex gap-2.5">
        <Button size="sm" type="button" onClick={save}>
          {strings.suggest.spendSave}
        </Button>
        <Button variant="secondary" size="sm" type="button" onClick={onReset}>
          {strings.suggest.spendReset}
        </Button>
      </div>
    </Card>
  );
}

export function SuggestPage(): ReactElement {
  const { cardIds, loading, spendProfile, setSpendProfile } = useWallet();
  const { catalog, loading: catalogLoading } = useCatalog();
  const suggestions = useMemo(
    () => suggestNewCards(catalog, cardIds, SUGGEST_THRESHOLD_CAD, spendProfile),
    [catalog, cardIds, spendProfile],
  );
  const profile = useMemo(() => activeSpendProfile(spendProfile), [spendProfile]);
  const bestOwned = useMemo(() => {
    let best: { card: CardSeed; value: number } | null = null;
    for (const card of catalog.cards) {
      if (!cardIds.includes(card.id)) continue;
      const value = annualValue(catalog, card, profile);
      if (!best || value > best.value) best = { card, value };
    }
    return best;
  }, [catalog, cardIds, profile]);

  const feeNote = (annualValueCAD: number, annualFeeCAD: number): string =>
    annualFeeCAD === 0
      ? strings.suggest.noAnnualFee
      : strings.suggest.afterFeeNote
          .replace('{value}', formatCAD(annualValueCAD - annualFeeCAD, 0))
          .replace('{fee}', formatCAD(annualFeeCAD, 0));

  if (loading || catalogLoading)
    return <p className="text-sm text-muted-foreground">{strings.common.loading}</p>;

  if (cardIds.length === 0) {
    return (
      <div className="flex flex-col gap-3.5">
        <h1 className="font-display mt-0.5 text-[32px] leading-[1.1] font-bold tracking-tight">
          {strings.suggest.title}
        </h1>
        <Card className="p-[18px]">
          <h2 className="text-[17px] font-bold">{strings.check.noWalletTitle}</h2>
          <p className="mt-1 mb-3 text-sm text-muted-foreground">{strings.check.noWalletBody}</p>
          <Button size="sm" asChild>
            <a href={routePath('wallet')} className="no-underline">
              {strings.check.goToWallet}
            </a>
          </Button>
        </Card>
      </div>
    );
  }

  const spendCard = (
    <SpendProfileCard
      spendProfile={spendProfile}
      onCommit={(next) => void setSpendProfile(next)}
      onReset={() => void setSpendProfile(undefined)}
    />
  );

  if (suggestions.length === 0) {
    return (
      <div className="flex flex-col gap-3.5">
        <h1 className="font-display mt-0.5 text-[32px] leading-[1.1] font-bold tracking-tight">
          {strings.suggest.title}
        </h1>
        <p className="text-sm text-muted-foreground">{strings.suggest.subtitle}</p>
        {spendCard}
        <Card className="p-[18px]">
          <h2 className="text-[17px] font-bold">{strings.suggest.noSuggestionTitle}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{strings.suggest.noSuggestionBody}</p>
          {bestOwned && (
            <p className="mt-2 text-[13px] font-semibold">
              {strings.suggest.bestLeads
                .replace('{card}', bestOwned.card.name)
                .replace('{value}', `${formatCAD(bestOwned.value, 0)}${strings.suggest.perYear}`)}
            </p>
          )}
        </Card>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <h1 className="font-display mt-0.5 text-[32px] leading-[1.1] font-bold tracking-tight">
        {strings.suggest.title}
      </h1>
      <p className="-mt-2 text-sm text-muted-foreground">{strings.suggest.subtitle}</p>
      <StatementsBanner />
      {spendCard}
      {bestOwned && (
        <Card className="border-transparent bg-winner p-4 text-winner-foreground shadow-md">
          <div className="flex items-center justify-between gap-2.5">
            <div>
              <div className="text-[13px] font-bold tracking-wide uppercase opacity-80">
                {strings.suggest.closestTitle}
              </div>
              <div className="mt-0.5 text-[16px] font-bold tracking-tight">
                {bestOwned.card.name} · {formatCAD(bestOwned.value, 0)}
                {strings.suggest.perYear}
              </div>
              <div className="mt-0.5 text-[13px] opacity-80">{feeNote(bestOwned.value, bestOwned.card.annualFeeCAD)}</div>
            </div>
            <span className="flex-none rounded-full bg-winner-foreground px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap text-winner">
              {strings.suggest.ownedBadge}
            </span>
          </div>
        </Card>
      )}
      {suggestions.map((s) => (
        <Card key={s.card.id} className="p-[18px]">
          <div className="text-[16px] font-bold tracking-tight">{s.card.name}</div>
          <div className="mt-0.5 text-[13px] text-muted-foreground">
            {s.card.issuer} · {s.card.network} ·{' '}
            {s.card.annualFeeCAD === 0 ? strings.common.free : `${formatCAD(s.card.annualFeeCAD)}${strings.wallet.feePerYear}`}
          </div>
          <div className="mt-3 grid grid-cols-2 border-t border-border pt-2.5">
            <div className="py-0.5 pr-3">
              <div className="text-xs font-semibold text-muted-foreground">
                {strings.suggest.incrementalValue}
                {strings.suggest.perYear}
              </div>
              <div className="font-display text-[28px] leading-[1.2] tracking-tight tabular-nums">
                +{formatCAD(s.incrementalCAD, 0)}
              </div>
            </div>
            <div className="border-l border-border py-0.5 pl-3">
              <div className="text-xs font-semibold text-muted-foreground">
                {strings.check.valueLabel}
                {strings.suggest.perYear}
              </div>
              <div className="font-display text-[28px] leading-[1.2] tracking-tight tabular-nums">
                {formatCAD(s.annualValueCAD, 0)}
              </div>
            </div>
          </div>
          <div className="mt-2 border-t border-border pt-2 text-[13px] text-muted-foreground">
            {feeNote(s.annualValueCAD, s.card.annualFeeCAD)}
          </div>
        </Card>
      ))}
    </div>
  );
}
