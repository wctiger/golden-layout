import type { ReactNode } from 'react';

const common = {
  width: 10,
  height: 10,
  viewBox: '0 0 10 10',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.2,
  'aria-hidden': true,
} as const;

export function CloseIcon(): ReactNode {
  return (
    <svg {...common}>
      <path d="M1.5 1.5l7 7M8.5 1.5l-7 7" />
    </svg>
  );
}

export function MaximizeIcon(): ReactNode {
  return (
    <svg {...common}>
      <rect x="1.5" y="1.5" width="7" height="7" />
    </svg>
  );
}

export function MinimizeIcon(): ReactNode {
  return (
    <svg {...common}>
      <path d="M1.5 8.5h7" />
    </svg>
  );
}

export function DropdownIcon(): ReactNode {
  return (
    <svg {...common}>
      <path d="M1.5 3.5l3.5 3.5 3.5-3.5" />
    </svg>
  );
}
