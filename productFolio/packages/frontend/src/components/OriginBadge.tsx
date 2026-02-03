import type { InitiativeOrigin } from '../types';

const ORIGIN_CONFIG: Record<
  InitiativeOrigin,
  { label: string; bgClass: string; textClass: string }
> = {
  INTAKE_CONVERTED: {
    label: 'Intake',
    bgClass: 'bg-blue-50',
    textClass: 'text-blue-700',
  },
  DIRECT_PM: {
    label: 'Direct',
    bgClass: 'bg-amber-50',
    textClass: 'text-amber-700',
  },
  LEGACY: {
    label: 'Legacy',
    bgClass: 'bg-surface-100',
    textClass: 'text-surface-500',
  },
};

interface OriginBadgeProps {
  origin: InitiativeOrigin;
  className?: string;
}

export function OriginBadge({ origin, className = '' }: OriginBadgeProps) {
  const config = ORIGIN_CONFIG[origin] || ORIGIN_CONFIG.LEGACY;

  return (
    <span
      className={`inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium ${config.bgClass} ${config.textClass} ${className}`}
    >
      {config.label}
    </span>
  );
}
