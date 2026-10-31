import { useMemo, useState, type ReactElement } from 'react';
import { formatCAD, formatCpp } from '../format';
import { useCatalog, useCatalogMaps } from '../data/catalogStore';
import { rankForPurchase, resolvePurchaseMerchant } from '../ranking/rank';
import type { EarnCategory, MerchantSeed, PurchaseContext } from '../data/types';
import { routePath } from '../router';
import { strings } from '../strings';
import { useWallet } from '../wallet/useWallet';
import { RankedCardView } from '../components/RankedCard';
import { StoreCombobox } from '../components/StoreCombobox';

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
  const [storeQuery, setStoreQuery] = useState('Loblaws');
  const [merchantId, setMerchantId] = useState<string | undefined>('loblaws');
  const [purchaseType, setPurchaseType] = useState<PurchaseTypeKey>('grocery');
  const [spend, setSpend] = useState('');
  const [submitted, setSubmitted] = useState<{ merchant: MerchantSeed; spend?: number } | null>(null);

  const matchedMerchant = useMemo(() => {
    const q = storeQuery.trim().toLowerCase();
    if (!q) return undefined;
    const selected = merchantId ? merchantsById.get(merchantId) : undefined;
    if (selected && selected.name.toLowerCase() === q) return selected;
    return catalog.merchants.find((m) => m.name.toLowerCase() === q);
  }, [storeQuery, merchantId, catalog, merchantsById]);

  const result = useMemo(
    () => (submitted ? rankForPurchase(catalog, cardIds, submitted.merchant, submitted.spend) : null),
    [submitted, cardIds, catalog],
  );

  if (loading || catalogLoading) return <p className="muted">{strings.common.loading}</p>;

  if (cardIds.length === 0) {
    return (
      <div className="stack">
        <h1 className="page-title">{strings.check.title}</h1>
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
    setSubmitted({
      merchant,
      spend: Number.isFinite(parsed) && parsed > 0 ? parsed : undefined,
    });
  };

  const winner = result?.ranked[0];
  const resultCategoryLabel = result
    ? result.merchant.context !== 'general'
      ? strings.categories[result.merchant.context]
      : strings.categories[result.merchant.earn]
    : '';
  const winnerProgram = winner ? programsById.get(winner.card.programId) : undefined;
  const loyalty = result?.merchant.loyaltyId ? loyaltyById.get(result.merchant.loyaltyId) : undefined;
  const showLoyalty = loyalty && result && !loyaltyUsed.includes(loyalty.id);
  const matchingOffers = result
    ? catalog.bankOffers.filter((o) => !o.categories || o.categories.includes(result.merchant.earn))
    : [];

  return (
    <div className="stack">
      <h1 className="page-title">{strings.check.title}</h1>

      <form className="stack" onSubmit={onSubmit}>
        <div className="field">
          <label htmlFor="check-store">{strings.check.storeLabel}</label>
          <StoreCombobox
            id="check-store"
            value={storeQuery}
            placeholder={strings.check.storePlaceholder}
            merchants={catalog.merchants}
            onTextChange={onStoreTextChange}
            onPick={onPickMerchant}
          />
          {matchedMerchant?.note && <span className="help">{matchedMerchant.note}</span>}
          {!matchedMerchant && storeQuery.trim() !== '' && (
            <span className="help">{strings.check.storeNoMatch}</span>
          )}
        </div>
        <div className="field">
          <label htmlFor="check-category">{strings.check.categoryLabel}</label>
          <select
            id="check-category"
            value={purchaseType}
            onChange={(e) => setPurchaseType(e.target.value as PurchaseTypeKey)}
          >
            <optgroup label={strings.check.categoryGroup}>
              {EARN_TYPES.map((key) => (
                <option key={key} value={key}>
                  {strings.categories[key]}
                </option>
              ))}
            </optgroup>
            <optgroup label={strings.check.specialGroup}>
              {CONTEXT_TYPES.map((key) => (
                <option key={key} value={key}>
                  {strings.categories[key]}
                </option>
              ))}
            </optgroup>
          </select>
        </div>
        <div className="field">
          <label htmlFor="check-spend">{strings.check.spendLabel}</label>
          <input
            id="check-spend"
            type="number"
            min="0"
            step="0.01"
            inputMode="decimal"
            placeholder={strings.check.spendPlaceholder}
            value={spend}
            onChange={(e) => setSpend(e.target.value)}
          />
          <span className="help">{strings.check.spendHelp}</span>
        </div>
        <button className="btn" type="submit">{strings.check.button}</button>
      </form>

      {result && winner && (
        <>
          <h2 className="section-title">
            {strings.check.resultsTitle} — {result.merchant.name} · {resultCategoryLabel} ({formatCAD(result.spendUsed)})
            {result.mode === 'coverage' ? ` · ${strings.check.bestForCoverage}` : ''}
          </h2>
          {showLoyalty && loyalty && (
            <div className="card tip-callout">
              <div className="tip-head">
                <span className="badge">{strings.check.tipBadge}</span>
                <span className="tip-title">{strings.loyalty.title}: {loyalty.name}</span>
              </div>
              <p className="muted">{loyalty.headline}</p>
              <p className="muted">{loyalty.stackNote}</p>
              <div className="row">
                <a href={loyalty.joinUrl} target="_blank" rel="noreferrer">{strings.loyalty.join}</a>
                <button
                  className="btn secondary small"
                  type="button"
                  onClick={() => void toggleLoyaltyUsed(loyalty.id)}
                >
                  {strings.loyalty.alreadyUse}
                </button>
              </div>
            </div>
          )}
          {result.ranked.map((row, index) => (
            <RankedCardView key={row.card.id} row={row} isWinner={index === 0} />
          ))}

          <div className="card">
            <h2 className="section-title" style={{ marginTop: 0 }}>{strings.check.assumptionsTitle}</h2>
            <ul className="assumption-list">
              {result.assumptions.map((note) => (
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
          </div>

          {winnerProgram && (
            <div className="card">
              <h2 className="section-title" style={{ marginTop: 0 }}>
                {strings.redemption.title} — {winnerProgram.name}
              </h2>
              <ul className="plain-list">
                {winnerProgram.redemption.map((path) => (
                  <li key={path.label}>
                    {path.label} — {formatCpp(path.cpp)} {strings.redemption.perPoint}
                    {path.note ? ` (${path.note})` : ''}
                  </li>
                ))}
              </ul>
              <p className="muted">{winnerProgram.methodology}</p>
            </div>
          )}

          {result.mode === 'coverage' && winner.coverageNotes.length > 0 && (
            <div className="card">
              <h2 className="section-title" style={{ marginTop: 0 }}>{strings.reminders.title}</h2>
              <ul className="plain-list">
                {winner.coverageNotes.map((note) => (
                  <li key={note}>{note}</li>
                ))}
              </ul>
              <p className="muted">{strings.benefits.fullTerms}</p>
            </div>
          )}

          {matchingOffers.length > 0 && (
            <div className="card">
              <h2 className="section-title" style={{ marginTop: 0 }}>{strings.offers.title}</h2>
              <ul className="plain-list">
                {matchingOffers.map((offer) => (
                  <li key={offer.id}>
                    <strong>{offer.label}.</strong> {offer.detail} {offer.conditions}
                  </li>
                ))}
              </ul>
              <p className="muted">{strings.offers.illustrativeNote}</p>
            </div>
          )}
        </>
      )}
    </div>
  );
}
