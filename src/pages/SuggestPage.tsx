import { useMemo, type ReactElement } from 'react';
import { formatCAD } from '../format';
import { useCatalog } from '../data/catalogStore';
import { DEFAULT_SPEND_PROFILE, SUGGEST_THRESHOLD_CAD, suggestNewCards } from '../ranking/rank';
import { routePath } from '../router';
import { strings } from '../strings';
import { useWallet } from '../wallet/useWallet';
import { Button } from '../components/ui/button';
import { Card, CardContent } from '../components/ui/card';

export function SuggestPage(): ReactElement {
  const { cardIds, loading } = useWallet();
  const { catalog, loading: catalogLoading } = useCatalog();
  const suggestions = useMemo(() => suggestNewCards(catalog, cardIds), [catalog, cardIds]);

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

  if (suggestions.length === 0) {
    return (
      <div className="flex flex-col gap-3.5">
        <h1 className="font-display mt-0.5 text-[32px] leading-[1.1] font-bold tracking-tight">
          {strings.suggest.title}
        </h1>
        <p className="text-sm text-muted-foreground">{strings.suggest.subtitle}</p>
        <Card className="p-[18px]">
          <h2 className="text-[17px] font-bold">{strings.suggest.noSuggestionTitle}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{strings.suggest.noSuggestionBody}</p>
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
        </Card>
      ))}
      <Card className="p-[18px]">
        <CardContent className="p-0">
          <h2 className="text-[13px] font-bold tracking-wide text-muted-foreground uppercase">
            {strings.check.assumptionsTitle}
          </h2>
          <ul className="mt-2 mb-0 list-disc pl-5 text-[13px] text-muted-foreground">
            <li className="mt-1">
              Suggestions use a default monthly spend profile:{' '}
              {DEFAULT_SPEND_PROFILE.map((p) => `${strings.categories[p.category]} ${formatCAD(p.monthlyCAD, 0)}`).join(' · ')}.
            </li>
            <li className="mt-1">
              A card is suggested only when it beats your best owned card by at least {formatCAD(SUGGEST_THRESHOLD_CAD, 0)}
              {strings.suggest.perYear}.
            </li>
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
