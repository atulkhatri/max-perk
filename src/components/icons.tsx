import type { ReactElement } from 'react';

function Base({ children }: { children: ReactElement }): ReactElement {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {children}
    </svg>
  );
}

export function CheckIcon(): ReactElement {
  return (
    <Base>
      <g>
        <rect x="2.5" y="5" width="19" height="14" rx="2.5" />
        <line x1="2.5" y1="10" x2="21.5" y2="10" />
        <path d="M6.5 15h4" />
      </g>
    </Base>
  );
}

export function WalletIcon(): ReactElement {
  return (
    <Base>
      <g>
        <path d="M3 7.5A2.5 2.5 0 0 1 5.5 5h11A3.5 3.5 0 0 1 20 8.5V9" />
        <rect x="3" y="7" width="18" height="12" rx="2.5" />
        <circle cx="17" cy="13.5" r="1.2" fill="currentColor" stroke="none" />
      </g>
    </Base>
  );
}

export function SuggestIcon(): ReactElement {
  return (
    <Base>
      <g>
        <circle cx="12" cy="12" r="8.5" />
        <path d="M12 8.5v7M8.5 12h7" />
      </g>
    </Base>
  );
}

export function SettingsIcon(): ReactElement {
  return (
    <Base>
      <g>
        <circle cx="12" cy="12" r="3" />
        <path d="M12 2.8v2.7M12 18.5v2.7M2.8 12h2.7M18.5 12h2.7M5.5 5.5l1.9 1.9M16.6 16.6l1.9 1.9M18.5 5.5l-1.9 1.9M7.4 16.6l-1.9 1.9" />
      </g>
    </Base>
  );
}

export function LogoMark(): ReactElement {
  return (
    <svg width="30" height="30" viewBox="0 0 512 512" aria-hidden="true">
      <rect x="16" y="16" width="480" height="480" rx="112" fill="var(--accent)" />
      <rect x="96" y="160" width="320" height="200" rx="28" fill="var(--surface)" />
      <rect x="96" y="216" width="320" height="40" fill="var(--gold)" />
      <circle cx="348" cy="304" r="28" fill="var(--accent)" />
    </svg>
  );
}
