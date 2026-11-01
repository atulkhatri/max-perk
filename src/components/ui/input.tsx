import type * as React from 'react';
import { cn } from '../../lib/utils';

function Input({
  className,
  type,
  ref,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement> & { ref?: React.Ref<HTMLInputElement> }): React.JSX.Element {
  return (
    <input
      ref={ref}
      type={type}
      className={cn(
        'flex h-11 w-full rounded-md border border-input bg-card px-3 py-2 text-sm text-card-foreground shadow-xs transition-colors placeholder:text-muted-foreground hover:border-muted-foreground focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring disabled:cursor-not-allowed disabled:opacity-50',
        className,
      )}
      {...props}
    />
  );
}

export { Input };
