import type { DeliveryHealth } from '../../types';

interface DeliveryHealthBadgeProps {
  health: DeliveryHealth;
  size?: 'sm' | 'md';
}

const healthConfig: Record<DeliveryHealth, {
  label: string;
  bg: string;
  text: string;
  dot: string;
}> = {
  ON_TRACK: {
    label: 'On Track',
    bg: 'bg-emerald-50',
    text: 'text-emerald-700',
    dot: 'bg-emerald-500',
  },
  AT_RISK: {
    label: 'At Risk',
    bg: 'bg-amber-50',
    text: 'text-amber-700',
    dot: 'bg-amber-500',
  },
  DELAYED: {
    label: 'Delayed',
    bg: 'bg-red-50',
    text: 'text-red-700',
    dot: 'bg-red-500',
  },
};

export function DeliveryHealthBadge({ health, size = 'md' }: DeliveryHealthBadgeProps) {
  const config = healthConfig[health];
  if (!config) return null;

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
