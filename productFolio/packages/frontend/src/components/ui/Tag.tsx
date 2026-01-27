interface TagProps {
  label: string;
  color?: string;
  onRemove?: () => void;
  size?: 'sm' | 'md';
}

// Deterministic color from string
function stringToColor(str: string): string {
  const colors = [
    { bg: 'bg-rose-100', text: 'text-rose-700' },
    { bg: 'bg-pink-100', text: 'text-pink-700' },
    { bg: 'bg-fuchsia-100', text: 'text-fuchsia-700' },
    { bg: 'bg-purple-100', text: 'text-purple-700' },
    { bg: 'bg-violet-100', text: 'text-violet-700' },
    { bg: 'bg-indigo-100', text: 'text-indigo-700' },
    { bg: 'bg-blue-100', text: 'text-blue-700' },
    { bg: 'bg-sky-100', text: 'text-sky-700' },
    { bg: 'bg-cyan-100', text: 'text-cyan-700' },
    { bg: 'bg-teal-100', text: 'text-teal-700' },
    { bg: 'bg-emerald-100', text: 'text-emerald-700' },
    { bg: 'bg-lime-100', text: 'text-lime-700' },
    { bg: 'bg-amber-100', text: 'text-amber-700' },
    { bg: 'bg-orange-100', text: 'text-orange-700' },
  ];

  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  return `${colors[Math.abs(hash) % colors.length].bg} ${colors[Math.abs(hash) % colors.length].text}`;
}

export function Tag({ label, color, onRemove, size = 'md' }: TagProps) {
  const colorClasses = color || stringToColor(label);

  return (
    <span
      className={`
        inline-flex items-center gap-1 font-medium rounded-md
        ${colorClasses}
        ${size === 'sm' ? 'px-1.5 py-0.5 text-[10px]' : 'px-2 py-0.5 text-xs'}
      `}
    >
      {label}
      {onRemove && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
          className="p-0.5 -mr-0.5 rounded hover:bg-black/10 transition-colors"
        >
          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      )}
    </span>
  );
}
