import type { CSSProperties, ReactElement, ReactNode } from 'react';
import { ResponsiveContainer, Tooltip } from 'recharts';
import { cn } from '../../lib/utils';

export interface ChartConfig {
  [key: string]: { label: string; color: string };
}

/** shadcn-style chart shell: theme vars from config, fixed-height viewport. */
export function ChartContainer({
  config,
  className,
  children,
}: {
  config: ChartConfig;
  className?: string;
  children: ReactNode;
}): ReactElement {
  const vars = Object.fromEntries(
    Object.entries(config).map(([key, value]) => [`--color-${key}`, value.color]),
  ) as CSSProperties;
  return (
    <div data-slot="chart" className={cn('h-[240px] w-full', className)} style={vars}>
      <ResponsiveContainer width="100%" height="100%">
        {children}
      </ResponsiveContainer>
    </div>
  );
}

interface TooltipRow {
  name?: string;
  value?: number | string;
  color?: string;
  payload?: { fill?: string };
}

/** Muted tooltip matching card surfaces; works for pie and bar payloads. */
export function ChartTooltipContent({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: TooltipRow[];
  label?: string;
}): ReactElement | null {
  if (!active || !payload || payload.length === 0) return null;
  return (
    <div className="rounded-md border border-border bg-card px-3 py-2 text-card-foreground shadow-md">
      {label != null && label !== '' && <div className="mb-1 text-[13px] font-bold">{label}</div>}
      {payload.map((row, i) => (
        <div key={i} className="flex items-center gap-2 text-[13px]">
          <span
            className="size-2.5 flex-none rounded-full"
            style={{ backgroundColor: row.payload?.fill ?? row.color ?? 'var(--muted-foreground)' }}
          />
          <span className="text-muted-foreground">{row.name}</span>
          <span className="ml-auto font-bold tabular-nums">{row.value}</span>
        </div>
      ))}
    </div>
  );
}

export { Tooltip as ChartTooltip };
