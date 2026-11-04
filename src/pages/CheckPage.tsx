import { useMemo, useState, type ReactElement } from 'react';
import { formatCAD } from '../format';
import { useCatalog, useCatalogMaps } from '../data/catalogStore';
import { CardDetailDialog } from '../components/CardDetailDialog';
import { rankForPurchase, resolvePurchaseMerchant } from '../ranking/rank';
import type { EarnCategory, MerchantSeed, PurchaseContext } from '../data/types';
import { routePath } from '../router';
import { strings } from '../strings';
import { useWallet } from '../wallet/useWallet';
import { AskPickSection, type ParsedLeg } from '../askpick/AskPickSection';
import { useAskPickEnabled } from '../askpick/useAskPickEnabled';
import { RankedCardView } from '../components/RankedCard';
import { StoreCombobox } from '../components/StoreCombobox';
import { Badge } from '../components/ui/badge';
import { Button } from '../components/ui/button';
import { Card } from '../components/ui/card';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '../components/ui/select';

type PurchaseTypeKey = EarnCategory | Exclude<PurchaseContext, 'general'>;

const EARN_TYPES: EarnCategory[] = [
  'grocery',
  'dining',
  'gas',
  'travel',
  'drugstore',
  'transit',
  'recurring',
  'foreign',
  'other',
];
const CONTEXT_TYPES: Exclude<PurchaseContext, 'general'>[] = ['electronics', 'carRental', 'hotels'];
const CONTEXT_EARN: Record<Exclude<PurchaseContext, 'general'>, EarnCategory> = {
  electronics: 'other',
  carRental: 'travel',
  hotels: 'travel',
};

function purchaseTypeForMerchant(merchant: MerchantSeed): PurchaseTypeKey {
  return merchant.context !== 'general' ? merchant.context : merchant.earn;
}

function selectionFor(purchaseType: PurchaseTypeKey): { earn: EarnCategory; context: PurchaseContext } {
  if (purchaseType === 'electronics' || purchaseType === 'carRental' || purchaseType === 'hotels') {
    return { earn: CONTEXT_EARN[purchaseType], context: purchaseType };
  }
  return { earn: purchaseType, context: 'general' };
}

export function CheckPage(): ReactElement {
  const { cardIds, loyaltyUsed, loading, toggleLoyaltyUsed } = useWallet();
  const { catalog, loading: catalogLoading } = useCatalog();
  const { loyaltyById, merchantsById, programsById } = useCatalogMaps(catalog);
  const [storeQuery, setStoreQuery] = useState('');
  const [merchantId, setMerchantId] = useState<string | undefined>(undefined);
  const [purchaseType, setPurchaseType] = useState<PurchaseTypeKey>('other');
  const [spend, setSpend] = useState('');
  const [basket, setBasket] = useState<{ merchant: MerchantSeed; spend?: number }[] | null>(null);
  const [interpretation, setInterpretation] = useState<string | null>(null);
  const [askFallback, setAskFallback] = useState(false);
  const [detailId, setDetailId] = useState<string | undefined>(undefined);
  const askPickEnabled = useAskPickEnabled();

  const matchedMerchant = useMemo(() => {
    const q = storeQuery.trim().toLowerCase();
    if (!q) return undefined;
    const selected = merchantId ? merchantsById.get(merchantId) : undefined;
    if (selected && selected.name.toLowerCase() === q) return selected;
    return catalog.merchants.find((m) => m.name.toLowerCase() === q);
  }, [storeQuery, merchantId, catalog, merchantsById]);

  const results = useMemo(
    () =>
      basket?.map((leg) => ({
        leg,
        result: rankForPurchase(catalog, cardIds, leg.merchant, leg.spend),
      })) ?? null,
    [basket, cardIds, catalog],
  );

  // Multi-leg baskets name one card: the owned card with the highest summed
  // deterministic total across legs. Each leg keeps its own winner too.
  const basketWinner = useMemo(() => {
    if (!results || results.length < 2) return null;
    const totals = new Map<string, number>();
    for (const { result } of results) {
      for (const row of result.ranked) {
        if (!cardIds.includes(row.card.id)) continue;
        totals.set(row.card.id, (totals.get(row.card.id) ?? 0) + row.totalValueCAD);
      }
    }
    let best: { cardId: string; total: number } | null = null;
    for (const [cardId, total] of totals) {
      if (!best || total > best.total) best = { cardId, total };
    }
    return best;
  }, [results, cardIds]);

  const basketWinnerCard = basketWinner ? catalog.cards.find((c) => c.id === basketWinner.cardId) : undefined;

  function legLabel(merchant: MerchantSeed, spend?: number): string {
    const category =
      merchant.context !== 'general' ? strings.categories[merchant.context] : strings.categories[merchant.earn];
    const base = merchant.name === category ? category : `${merchant.name} · ${category}`;
    return spend !== undefined ? `${base} · ${formatCAD(spend)}` : base;
  }

  function handleInterpret(legs: ParsedLeg[], note: string): void {
    const mapped = legs.map((leg) => {
      const tracked = leg.merchantId ? catalog.merchants.find((m) => m.id === leg.merchantId) : undefined;
      const merchant =
        tracked ||
        resolvePurchaseMerchant(catalog, {
          earn: leg.earn as EarnCategory,
          context: leg.context as PurchaseContext,
          customName:
            (leg.storeName && leg.storeName.trim()) || strings.categories[leg.earn as EarnCategory],
        });
      return { merchant, spend: leg.spendCAD };
    });
    setDetailId(undefined);
    setAskFallback(false);
    setInterpretation(note);
    setBasket(mapped);
  }

  if (loading || catalogLoading) return <p className="text-sm text-muted-foreground">{strings.common.loading}</p>;

  if (cardIds.length === 0) {
    return (
      <div className="flex flex-col gap-3.5">
        <h1 className="font-display text-[32px] leading-[1.1] font-bold tracking-tight">{strings.check.title}</h1>
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

  const onStoreTextChange = (text: string): void => {
    setStoreQuery(text);
    setMerchantId((current) => {
      if (!current) return current;
      const selected = merchantsById.get(current);
      return selected && selected.name.toLowerCase() === text.trim().toLowerCase() ? current : undefined;
    });
  };

  const onPickMerchant = (merchant: MerchantSeed): void => {
    setStoreQuery(merchant.name);
    setMerchantId(merchant.id);
    setPurchaseType(purchaseTypeForMerchant(merchant));
  };

  const onSubmit = (event: React.FormEvent): void => {
    event.preventDefault();
    const { earn, context } = selectionFor(purchaseType);
    const merchant = resolvePurchaseMerchant(catalog, {
      merchantId: matchedMerchant?.id,
      earn,
      context,
      customName: storeQuery.trim() || strings.categories[earn],
    });
    const parsed = parseFloat(spend);
    setDetailId(undefined);
    setInterpretation(null);
    setAskFallback(false);
    setBasket([
      {
        merchant,
        spend: Number.isFinite(parsed) && parsed > 0 ? parsed : undefined,
      },
    ]);
  };

  const firstResult = results?.[0]?.result ?? null;
  const winner = firstResult?.ranked[0];
  const detailRow = results?.flatMap(({ result }) => result.ranked).find((r) => r.card.id === detailId);
  const detailProgram = detailRow ? programsById.get(detailRow.card.programId) : undefined;
  const detailOffers = detailRow
    ? catalog.bankOffers.filter((o) => detailRow.appliedOfferIds.includes(o.id))
    : [];

  return (
    <div className="flex flex-col gap-4">
      <h1 className="font-display mt-0.5 text-[32px] leading-[1.1] font-bold tracking-tight">
        {strings.check.title}
      </h1>

      {askPickEnabled && (
        <AskPickSection
          onInterpret={handleInterpret}
          onManualFallback={() => setAskFallback(true)}
        />
      )}

      {askPickEnabled && (
        <div className="flex items-center gap-3" aria-hidden="true">
          <span className="h-px flex-1 bg-border" />
          <span className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
            {strings.check.manualDivider}
          </span>
          <span className="h-px flex-1 bg-border" />
        </div>
      )}

      {askFallback && (
        <p role="status" className="text-[13px] text-muted-foreground">
          {strings.askPick.manualFallback}
        </p>
      )}

      <Card className="p-5 shadow-md">
        <form className="flex flex-col gap-4" onSubmit={onSubmit}>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="check-store">{strings.check.storeLabel}</Label>
            <StoreCombobox
              id="check-store"
              value={storeQuery}
              placeholder={strings.check.storePlaceholder}
              merchants={catalog.merchants}
              onTextChange={onStoreTextChange}
              onPick={onPickMerchant}
            />
            {matchedMerchant?.note && (
              <span className="text-xs text-muted-foreground">{matchedMerchant.note}</span>
            )}
            {!matchedMerchant && storeQuery.trim() !== '' && (
              <span className="text-xs text-muted-foreground">{strings.check.storeNoMatch}</span>
            )}
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="check-category">{strings.check.categoryLabel}</Label>
            <Select value={purchaseType} onValueChange={(v) => setPurchaseType(v as PurchaseTypeKey)}>
              <SelectTrigger id="check-category">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectLabel>{strings.check.categoryGroup}</SelectLabel>
                  {EARN_TYPES.map((key) => (
                    <SelectItem key={key} value={key}>
                      {strings.categories[key]}
                    </SelectItem>
                  ))}
                </SelectGroup>
                <SelectGroup>
                  <SelectLabel>{strings.check.specialGroup}</SelectLabel>
                  {CONTEXT_TYPES.map((key) => (
                    <SelectItem key={key} value={key}>
                      {strings.categories[key]}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="check-spend">{strings.check.spendLabel}</Label>
            <Input
              id="check-spend"
              type="number"
              min="0"
              step="0.01"
              inputMode="decimal"
              placeholder={strings.check.spendPlaceholder}
              value={spend}
              onChange={(e) => setSpend(e.target.value)}
            />
            <span className="text-xs text-muted-foreground">{strings.check.spendHelp}</span>
          </div>
          <Button size="lg" type="submit">
            {strings.check.button}
          </Button>
        </form>
      </Card>

      {results && winner && (
        <div className="flex min-w-0 flex-col gap-4">
          {interpretation && (
            <div className="flex flex-col gap-0.5 px-1 pt-1 lg:pt-0">
              <div className="text-[13px] text-muted-foreground">
                {strings.askPick.understanding}: {interpretation}
              </div>
              <div className="text-[13px] text-muted-foreground">{strings.askPick.editHint}</div>
            </div>
          )}
          {basketWinner && basketWinnerCard && (
            <Card className="border-transparent bg-winner p-4 text-winner-foreground shadow-md">
              <div className="text-[13px] font-semibold opacity-80">{strings.askPick.basketWinner}</div>
              <div className="text-[17px] font-bold tracking-tight">
                {basketWinnerCard.name} · {formatCAD(basketWinner.total)}
              </div>
            </Card>
          )}
          {results.map(({ leg, result: legResult }, legIndex) => {
            const legLoyalty = legResult.merchant.loyaltyId
              ? loyaltyById.get(legResult.merchant.loyaltyId)
              : undefined;
            const showLegLoyalty = !!legLoyalty && !loyaltyUsed.includes(legLoyalty.id);
            return (
              <div key={`${leg.merchant.id}-${legIndex}`} className="flex min-w-0 flex-col gap-4">
                <div className="flex flex-col gap-0.5 px-1 pt-1 lg:pt-0">
                  <div className="text-xs font-extrabold tracking-[0.08em] text-primary uppercase">
                    {strings.check.resultsTitle}
                    {results.length > 1 ? ` · ${legIndex + 1}/${results.length}` : ''}
                  </div>
                  <div className="font-display text-[21px] leading-[1.25] font-bold tracking-tight">
                    {legLabel(leg.merchant, leg.spend)}
                    {legResult.mode === 'coverage' ? ` · ${strings.check.bestForCoverage}` : ''}
                  </div>
                  {!legResult.spendEntered && (
                    <div className="text-[13px] text-muted-foreground">{strings.check.exampleValuesNote}</div>
                  )}
                  {legResult.assumptions
                    .filter(
                      (note) =>
                        !note.text.includes('example purchase') &&
                        !note.text.includes('store list yet') &&
                        !note.text.includes('typical best redemptions'),
                    )
                    .map((note) => (
                      <div key={note.text} className="text-[13px] text-muted-foreground">
                        {note.text}
                        {note.sourceUrl && (
                          <a className="ml-1.5 text-xs" href={note.sourceUrl} target="_blank" rel="noreferrer">
                            {strings.check.sourceLink}
                          </a>
                        )}
                      </div>
                    ))}
                </div>
                {showLegLoyalty && legLoyalty && (
                  <Card className="p-[18px]">
                    <div className="mb-1 flex items-center gap-2">
                      <Badge>{strings.check.tipBadge}</Badge>
                      <span className="text-[13.5px] font-bold">
                        {strings.loyalty.title}: {legLoyalty.name}
                      </span>
                    </div>
                    <p className="mt-1 text-[13px] text-muted-foreground">{legLoyalty.headline}</p>
                    <p className="mt-1 text-[13px] text-muted-foreground">{legLoyalty.stackNote}</p>
                    <div className="mt-2 flex items-center gap-2.5">
                      <a href={legLoyalty.joinUrl} target="_blank" rel="noreferrer">
                        {strings.loyalty.join}
                      </a>
                      <Button
                        variant="secondary"
                        size="sm"
                        type="button"
                        onClick={() => void toggleLoyaltyUsed(legLoyalty.id)}
                      >
                        {strings.loyalty.alreadyUse}
                      </Button>
                    </div>
                  </Card>
                )}
                <div className="flex flex-col gap-3.5">
                  {legResult.ranked.map((row, index) => (
                    <RankedCardView
                      key={row.card.id}
                      row={row}
                      isWinner={index === 0}
                      rank={index + 1}
                      onDetails={() => setDetailId(row.card.id)}
                    />
                  ))}
                </div>
                {legIndex < results.length - 1 && (
                  <div className="flex items-center gap-3" aria-hidden="true">
                    <span className="h-px flex-1 bg-border" />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {detailRow && (
        <CardDetailDialog
          row={detailRow}
          program={detailProgram}
          offers={detailOffers}
          onClose={() => setDetailId(undefined)}
        />
      )}
    </div>
  );
}
