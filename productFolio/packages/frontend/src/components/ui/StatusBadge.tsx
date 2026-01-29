import type { InitiativeStatus } from '../../types';

interface StatusBadgeProps {
  status: InitiativeStatus;
  size?: 'sm' | 'md';
}

const statusConfig: Record<InitiativeStatus, {
  label: string;
  bg: string;
  text: string;
  dot: string;
}> = {
  PROPOSED: {
    label: 'Proposed',
    bg: 'bg-surface-100',
    text: 'text-surface-600',
    dot: 'bg-surface-400',
  },
  SCOPING: {
    label: 'Scoping',
    bg: 'bg-amber-50',
    text: 'text-amber-700',
    dot: 'bg-amber-500',
  },
  RESOURCING: {
    label: 'Resourcing',
    bg: 'bg-sky-50',
    text: 'text-sky-700',
    dot: 'bg-sky-500',
  },
  IN_EXECUTION: {
    label: 'In Execution',
    bg: 'bg-emerald-50',
    text: 'text-emerald-700',
    dot: 'bg-emerald-500',
  },
  COMPLETE: {
    label: 'Complete',
    bg: 'bg-violet-50',
    text: 'text-violet-700',
    dot: 'bg-violet-500',
  },
  ON_HOLD: {
    label: 'On Hold',
    bg: 'bg-orange-50',
    text: 'text-orange-700',
    dot: 'bg-orange-500',
  },
  CANCELLED: {
    label: 'Cancelled',
    bg: 'bg-red-50',
    text: 'text-red-600',
    dot: 'bg-red-400',
  },
};

export function StatusBadge({ status, size = 'md' }: StatusBadgeProps) {
  const config = statusConfig[status] || statusConfig.PROPOSED;

  return (
    <span
      className={`
        inline-flex items-center gap-1.5 font-medium rounded-full
        ${config.bg} ${config.text}
        ${size === 'sm' ? 'px-2 py-0.5 text-xs' : 'px-2.5 py-1 text-xs'}
      `}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${config.dot}`} />
      {config.label}
    </span>
  );
}
