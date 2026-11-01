import { useEffect, useState, type ReactElement } from 'react';
import { cn } from '../../lib/utils';

export interface ToastInput {
  title: string;
  description?: string;
}

interface ToastItem extends ToastInput {
  id: number;
}

let emit: ((toast: ToastInput) => void) | null = null;

/** Show a brief confirmation. No provider needed; mount <Toaster/> once. */
export function toast(input: ToastInput): void {
  emit?.(input);
}

export function Toaster(): ReactElement | null {
  const [items, setItems] = useState<ToastItem[]>([]);

  useEffect(() => {
    let nextId = 1;
    emit = (input) => {
      const id = nextId++;
      setItems((current) => [...current.slice(-2), { ...input, id }]);
      setTimeout(() => {
        setItems((current) => current.filter((item) => item.id !== id));
      }, 6000);
    };
    return () => {
      emit = null;
    };
  }, []);

  if (items.length === 0) return null;

  return (
    <div
      role="status"
      className="fixed bottom-[calc(70px+16px)] left-1/2 z-[70] flex w-full max-w-sm -translate-x-1/2 flex-col gap-2 px-5 lg:bottom-8"
    >
      {items.map((item) => (
        <div
          key={item.id}
          className={cn(
            'rounded-xl border border-border bg-card px-4 py-3 text-card-foreground shadow-md',
          )}
        >
          <div className="text-sm font-bold">{item.title}</div>
          {item.description && <div className="mt-0.5 text-[13px] text-muted-foreground">{item.description}</div>}
        </div>
      ))}
    </div>
  );
}
