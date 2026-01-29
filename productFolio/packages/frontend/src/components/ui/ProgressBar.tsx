export function ProgressBar({
  value,
  max = 100,
  size = 'md',
  status = 'default',
  showValue = false,
}: {
  value: number;
  max?: number;
  size?: 'sm' | 'md' | 'lg';
  status?: 'default' | 'success' | 'warning' | 'danger';
  showValue?: boolean;
}) {
  const percentage = Math.min((value / max) * 100, 100);
  const heights = { sm: 'h-1', md: 'h-1.5', lg: 'h-2' };
  const colors = {
    default: 'bg-accent-500',
    success: 'bg-emerald-500',
    warning: 'bg-amber-500',
    danger: 'bg-red-500',
  };

  return (
    <div className="flex items-center gap-2">
      <div className={`flex-1 bg-surface-200 rounded-full overflow-hidden ${heights[size]}`}>
        <div
          className={`${heights[size]} ${colors[status]} rounded-full transition-all duration-500`}
          style={{ width: `${percentage}%` }}
        />
      </div>
      {showValue && (
        <span className="text-xs font-mono text-surface-500 tabular-nums w-8 text-right">
          {Math.round(percentage)}%
        </span>
      )}
    </div>
  );
}
