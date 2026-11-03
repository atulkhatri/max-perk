import { useMemo, useState, type ReactElement } from 'react';
import { BadgeCheck, Minus, Plus } from 'lucide-react';
import { formatCAD } from '../format';
import { useCatalog } from '../data/catalogStore';
import { strings } from '../strings';
import { useWallet } from '../wallet/useWallet';
import { Button } from '../components/ui/button';
import { Card } from '../components/ui/card';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';

export function WalletPage(): ReactElement {
  const { cardIds, loading, addCard, removeCard } = useWallet();
  const { catalog, loading: catalogLoading } = useCatalog();
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
  }, [query, catalog]);

  const owned = filtered.filter((c) => cardIds.includes(c.id));
  const others = filtered.filter((c) => !cardIds.includes(c.id));

  if (loading || catalogLoading)
    return <p className="text-sm text-muted-foreground">{strings.common.loading}</p>;

  const feeLabel = (fee: number): string =>
    fee === 0 ? strings.common.free : `${formatCAD(fee)}${strings.wallet.feePerYear}`;

  return (
    <div className="flex flex-col gap-4">
      <h1 className="font-display mt-0.5 text-[32px] leading-[1.1] font-bold tracking-tight">
        {strings.wallet.title}
      </h1>
      <p className="-mt-2 text-sm text-muted-foreground">{strings.wallet.subtitle}</p>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="wallet-search">
          {strings.wallet.addTitle}{' '}
          <span className="font-normal text-muted-foreground">{strings.wallet.searchNote}</span>
        </Label>
        <Input
          id="wallet-search"
          type="text"
          autoComplete="off"
          placeholder={strings.wallet.searchPlaceholder}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      {cardIds.length === 0 && (
        <Card className="p-[18px]">
          <h2 className="text-[17px] font-bold">{strings.wallet.emptyTitle}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{strings.wallet.emptyBody}</p>
        </Card>
      )}

      {owned.length > 0 && (
        <>
          <h2 className="mt-2.5 text-[13px] font-bold tracking-wide text-muted-foreground uppercase">
            {strings.wallet.title} ({owned.length})
          </h2>
          {owned.map((card) => (
            <Card key={card.id} className="border-transparent bg-winner p-4 text-winner-foreground shadow-md">
              <div className="flex items-center justify-between gap-2.5">
                <div>
                  <div className="flex items-center gap-1.5 text-[16px] font-bold tracking-tight">
                    <BadgeCheck className="size-4 flex-none" aria-hidden="true" />
                    {card.name}
                  </div>
                  <div className="mt-0.5 text-[13px] opacity-80">
                    {card.issuer} · {card.network} · {feeLabel(card.annualFeeCAD)}
                  </div>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  type="button"
                  onClick={() => void removeCard(card.id)}
                  className="border-winner-foreground/40 bg-transparent text-winner-foreground hover:bg-winner-foreground/10 hover:text-winner-foreground"
                >
                  <Minus />
                  {strings.wallet.remove}
                </Button>
              </div>
            </Card>
          ))}
        </>
      )}

      {others.length > 0 && (
        <>
          <h2 className="mt-2.5 text-[13px] font-bold tracking-wide text-muted-foreground uppercase">
            {strings.wallet.addTitle}
          </h2>
          {others.map((card) => (
            <Card key={card.id} className="p-4">
              <div className="flex items-center justify-between gap-2.5">
                <div>
                  <div className="text-[16px] font-bold tracking-tight">{card.name}</div>
                  <div className="mt-0.5 text-[13px] text-muted-foreground">
                    {card.issuer} · {card.network} · {feeLabel(card.annualFeeCAD)}
                  </div>
                </div>
                <Button variant="secondary" size="sm" type="button" onClick={() => void addCard(card.id)}>
                  <Plus />
                  {strings.wallet.add}
                </Button>
              </div>
            </Card>
          ))}
        </>
      )}
    </div>
  );
}
