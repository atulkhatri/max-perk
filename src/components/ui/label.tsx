import type * as React from 'react';
import { cn } from '../../lib/utils';

function Label({ className, ...props }: React.LabelHTMLAttributes<HTMLLabelElement>): React.JSX.Element {
  return (
    <label
      className={cn('text-[13px] font-semibold leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70', className)}
      {...props}
    />
  );
}

export { Label };
