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
  tooltip: string;
}> = {
  PROPOSED: {
    label: 'Proposed',
    bg: 'bg-surface-100',
    text: 'text-surface-600',
    dot: 'bg-surface-400',
    tooltip: 'Idea stage. Add details, then move to Scoping to define skill demands and estimates.',
  },
  SCOPING: {
    label: 'Scoping',
    bg: 'bg-amber-50',
    text: 'text-amber-700',
    dot: 'bg-amber-500',
    tooltip: 'Define scope items with skill demands and P50/P90 estimates. Move to Resourcing when scope is finalized.',
  },
  RESOURCING: {
    label: 'Resourcing',
    bg: 'bg-sky-50',
    text: 'text-sky-700',
    dot: 'bg-sky-500',
    tooltip: 'Scope is locked. This initiative now appears in scenario demand calculations. Allocations are frozen.',
  },
  IN_EXECUTION: {
    label: 'In Execution',
    bg: 'bg-emerald-50',
    text: 'text-emerald-700',
    dot: 'bg-emerald-500',
    tooltip: 'Work is underway. Allocations remain frozen. Still contributes to scenario demand.',
  },
  COMPLETE: {
    label: 'Complete',
    bg: 'bg-violet-50',
    text: 'text-violet-700',
    dot: 'bg-violet-500',
    tooltip: 'Terminal state. No further status changes allowed.',
  },
  ON_HOLD: {
    label: 'On Hold',
    bg: 'bg-orange-50',
    text: 'text-orange-700',
    dot: 'bg-orange-500',
    tooltip: 'Paused. Can resume to any prior stage (Proposed, Scoping, Resourcing, or In Execution).',
  },
  CANCELLED: {
    label: 'Cancelled',
    bg: 'bg-red-50',
    text: 'text-red-600',
    dot: 'bg-red-400',
    tooltip: 'Terminal state. No further status changes allowed.',
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
      title={config.tooltip}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${config.dot}`} />
      {config.label}
    </span>
  );
}
