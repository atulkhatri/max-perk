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
      <rect x="16" y="16" width="480" height="480" rx="112" fill="#221e1a" />
      <g fill="none" stroke="#f7f2e9" strokeWidth="34" strokeLinecap="round" strokeLinejoin="round">
        <path d="M 320 168 H 184 a 52 52 0 0 0 -52 52 V 348 a 52 52 0 0 0 52 52 H 360 a 44 44 0 0 0 44 -44 V 208" />
        <path d="M 320 236 H 148" />
      </g>
      <rect x="330" y="296" width="80" height="72" rx="24" fill="#f7f2e9" />
      <rect x="354" y="316" width="32" height="32" rx="10" fill="#221e1a" />
      <path
        d="M 376 46 C 382 86 398 102 438 108 C 398 114 382 130 376 170 C 370 130 354 114 314 108 C 354 102 370 86 376 46 Z"
        fill="#fbbf24"
      />
    </svg>
  );
}
