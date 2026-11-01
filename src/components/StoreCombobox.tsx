import { useId, useMemo, useRef, useState, type ReactElement } from 'react';
import type { MerchantSeed } from '../data/types';
import { strings } from '../strings';
import { cn } from '../lib/utils';
import { Input } from './ui/input';

const MAX_SUGGESTIONS = 8;

interface StoreComboboxProps {
  id: string;
  value: string;
  placeholder: string;
  merchants: MerchantSeed[];
  onTextChange: (text: string) => void;
  onPick: (merchant: MerchantSeed) => void;
}

/** Prefix matches first, then substring matches, capped for a small panel. */
function rankMatches(merchants: MerchantSeed[], query: string): MerchantSeed[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const starts: MerchantSeed[] = [];
  const contains: MerchantSeed[] = [];
  for (const merchant of merchants) {
    const name = merchant.name.toLowerCase();
    if (name.startsWith(q)) starts.push(merchant);
    else if (name.includes(q)) contains.push(merchant);
  }
  return [...starts, ...contains].slice(0, MAX_SUGGESTIONS);
}

/**
 * Free-form store field with predictive search over the tracked merchants.
 * A custom listbox (not a native datalist) so suggestions work on mobile
 * browsers too. Unknown stores stay valid: the check ranks by category.
 */
export function StoreCombobox({
  id,
  value,
  placeholder,
  merchants,
  onTextChange,
  onPick,
}: StoreComboboxProps): ReactElement {
  const listId = useId();
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const matches = useMemo(() => rankMatches(merchants, value), [merchants, value]);
  const showList = open && value.trim().length > 0;
  const active = matches[activeIndex];
  const activeId = showList && active ? `${listId}-opt-${activeIndex}` : undefined;

  const pick = (merchant: MerchantSeed): void => {
    onPick(merchant);
    setOpen(false);
    inputRef.current?.focus();
  };

  return (
    <div className="relative">
      <Input
        ref={inputRef}
        id={id}
        type="text"
        role="combobox"
        aria-expanded={showList}
        aria-controls={listId}
        aria-activedescendant={activeId}
        autoComplete="off"
        placeholder={placeholder}
        value={value}
        onChange={(event) => {
          onTextChange(event.target.value);
          setOpen(true);
          setActiveIndex(0);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onKeyDown={(event) => {
          if ((event.key === 'ArrowDown' || event.key === 'ArrowUp') && matches.length > 0) {
            event.preventDefault();
            setOpen(true);
            const step = event.key === 'ArrowDown' ? 1 : -1;
            setActiveIndex((index) => (index + step + matches.length) % matches.length);
          } else if (event.key === 'Enter' && open && active) {
            event.preventDefault();
            pick(active);
          } else if (event.key === 'Escape') {
            event.preventDefault();
            setOpen(false);
          }
        }}
      />
      {showList && (
        <ul
          role="listbox"
          id={listId}
          className="absolute top-[calc(100%+4px)] right-0 left-0 z-20 m-0 max-h-[248px] list-none overflow-y-auto rounded-md border border-border bg-popover p-1 text-popover-foreground shadow-md"
        >
          {matches.length === 0 ? (
            <li className="px-2.5 py-2 text-[13px] text-muted-foreground">{strings.check.noStoreMatches}</li>
          ) : (
            matches.map((merchant, index) => (
              <li
                key={merchant.id}
                id={`${listId}-opt-${index}`}
                role="option"
                aria-selected={index === activeIndex}
                className={cn(
                  'flex cursor-pointer items-baseline justify-between gap-3 rounded-sm px-2.5 py-2 text-sm',
                  index === activeIndex && 'bg-accent text-accent-foreground',
                )}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => pick(merchant)}
                onMouseEnter={() => setActiveIndex(index)}
              >
                <span>{merchant.name}</span>
                <span className="text-xs whitespace-nowrap text-muted-foreground">
                  {merchant.context !== 'general'
                    ? strings.categories[merchant.context]
                    : strings.categories[merchant.earn]}
                </span>
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
}
