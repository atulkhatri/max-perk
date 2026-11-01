import type { ReactElement } from 'react';
import { CreditCard, Settings, Sparkles, Wallet } from 'lucide-react';

export function CheckIcon(): ReactElement {
  return <CreditCard className="size-[22px]" strokeWidth={1.8} aria-hidden="true" />;
}

export function WalletIcon(): ReactElement {
  return <Wallet className="size-[22px]" strokeWidth={1.8} aria-hidden="true" />;
}

export function SuggestIcon(): ReactElement {
  return <Sparkles className="size-[22px]" strokeWidth={1.8} aria-hidden="true" />;
}

export function SettingsIcon(): ReactElement {
  return <Settings className="size-[22px]" strokeWidth={1.8} aria-hidden="true" />;
}

export function LogoMark(): ReactElement {
  return (
    <svg width="30" height="30" viewBox="0 0 512 512" aria-hidden="true">
      <rect x="16" y="16" width="480" height="480" rx="112" fill="#ffffff" stroke="#d4d4d8" strokeWidth="16" />
      <rect x="96" y="160" width="320" height="200" rx="28" fill="#18181b" />
      <rect x="96" y="216" width="320" height="40" fill="#a1a1aa" />
      <circle cx="348" cy="304" r="28" fill="#ffffff" />
    </svg>
  );
}
