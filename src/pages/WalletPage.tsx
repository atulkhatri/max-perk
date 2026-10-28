import { useMemo, useState, type ReactElement } from 'react';
import { formatCAD } from '../format';
import { catalog } from '../data/seeds/catalog';
import { strings } from '../strings';
import { useWallet } from '../wallet/useWallet';

export function WalletPage(): ReactElement {
  const { cardIds, loading, addCard, removeCard } = useWallet();
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return catalog.cards;
    return catalog.cards.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        c.issuer.toLowerCase().includes(q) ||
        c.network.toLowerCase().includes(q),
    );
  }, [query]);

  const owned = filtered.filter((c) => cardIds.includes(c.id));
  const others = filtered.filter((c) => !cardIds.includes(c.id));

  if (loading) return <p className="muted">{strings.common.loading}</p>;

  const feeLabel = (fee: number): string =>
    fee === 0 ? strings.common.free : `${formatCAD(fee)}${strings.wallet.feePerYear}`;

  return (
    <div className="stack">
      <h1 className="page-title">{strings.wallet.title}</h1>
      <p className="page-subtitle">{strings.wallet.subtitle}</p>

      <div className="field">
        <label htmlFor="wallet-search">{strings.wallet.addTitle}</label>
        <input
          id="wallet-search"
          type="text"
          autoComplete="off"
          placeholder={strings.wallet.searchPlaceholder}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      {cardIds.length === 0 && (
        <div className="card">
          <div className="empty">
            <h2>{strings.wallet.emptyTitle}</h2>
            <p>{strings.wallet.emptyBody}</p>
          </div>
        </div>
      )}

      {owned.length > 0 && (
        <>
          <h2 className="section-title">
            {strings.wallet.title} ({owned.length})
          </h2>
          {owned.map((card) => (
            <div className="card" key={card.id}>
              <div className="spread">
                <div>
                  <div className="rank-card-name">{card.name}</div>
                  <div className="rank-card-sub">
                    {card.issuer} · {card.network} · {feeLabel(card.annualFeeCAD)}
                  </div>
                </div>
                <button className="btn secondary small" type="button" onClick={() => void removeCard(card.id)}>
                  {strings.wallet.remove}
                </button>
              </div>
            </div>
          ))}
        </>
      )}

      {others.length > 0 && (
        <>
          <h2 className="section-title">{strings.wallet.addTitle}</h2>
          {others.map((card) => (
            <div className="card" key={card.id}>
              <div className="spread">
                <div>
                  <div className="rank-card-name">{card.name}</div>
                  <div className="rank-card-sub">
                    {card.issuer} · {card.network} · {feeLabel(card.annualFeeCAD)}
                  </div>
                </div>
                <button className="btn secondary small" type="button" onClick={() => void addCard(card.id)}>
                  {strings.wallet.add}
                </button>
              </div>
            </div>
          ))}
        </>
      )}
    </div>
  );
}
