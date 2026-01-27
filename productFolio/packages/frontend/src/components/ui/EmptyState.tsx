import { ReactNode } from 'react';

export interface EmptyStateProps {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: {
    label: string;
    onClick: () => void;
    variant?: 'primary' | 'secondary';
  };
  size?: 'sm' | 'md' | 'lg';
}

const sizeClasses = {
  sm: {
    container: 'py-8',
    icon: 'w-10 h-10',
    title: 'text-base',
    description: 'text-sm',
  },
  md: {
    container: 'py-12',
    icon: 'w-16 h-16',
    title: 'text-lg',
    description: 'text-base',
  },
  lg: {
    container: 'py-16',
    icon: 'w-20 h-20',
    title: 'text-xl',
    description: 'text-lg',
  },
};

export function EmptyState({
  icon,
  title,
  description,
  action,
  size = 'md',
}: EmptyStateProps) {
  const sizes = sizeClasses[size];

  const defaultIcon = (
    <svg
      className={`${sizes.icon} text-surface-300`}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={1.5}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5M10 11.25h4M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z"
      />
    </svg>
  );

  return (
    <div className={`flex flex-col items-center justify-center text-center ${sizes.container}`}>
      <div className="mb-4 opacity-60">{icon || defaultIcon}</div>
      <h3 className={`font-display font-semibold text-surface-900 mb-2 ${sizes.title}`}>
        {title}
      </h3>
      {description && (
        <p className={`text-surface-500 max-w-md mb-6 ${sizes.description}`}>
          {description}
        </p>
      )}
      {action && (
        <button
          onClick={action.onClick}
          className={action.variant === 'secondary' ? 'btn-secondary' : 'btn-primary'}
        >
          {action.label}
        </button>
      )}
    </div>
  );
}

// Predefined empty state variants for common use cases
export function EmptyInitiatives({ onCreate }: { onCreate?: () => void }) {
  return (
    <EmptyState
      icon={
        <svg
          className="w-16 h-16 text-surface-300"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={1.5}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M3.75 12h16.5m-16.5 3.75h16.5M3.75 19.5h16.5M5.625 4.5h12.75a1.875 1.875 0 010 3.75H5.625a1.875 1.875 0 010-3.75z"
          />
        </svg>
      }
      title="No initiatives yet"
      description="Create your first initiative to start planning and tracking your portfolio."
      action={
        onCreate
          ? {
              label: 'Create Initiative',
              onClick: onCreate,
            }
          : undefined
      }
    />
  );
}

export function EmptyEmployees({ onAdd }: { onAdd?: () => void }) {
  return (
    <EmptyState
      icon={
        <svg
          className="w-16 h-16 text-surface-300"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={1.5}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z"
          />
        </svg>
      }
      title="No team members yet"
      description="Add employees to track skills, capacity, and resource allocation across initiatives."
      action={
        onAdd
          ? {
              label: 'Add Employee',
              onClick: onAdd,
            }
          : undefined
      }
    />
  );
}

export function EmptyScenarios({ onCreate }: { onCreate?: () => void }) {
  return (
    <EmptyState
      icon={
        <svg
          className="w-16 h-16 text-surface-300"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={1.5}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M3.75 3v11.25A2.25 2.25 0 006 16.5h2.25M3.75 3h-1.5m1.5 0h16.5m0 0h1.5m-1.5 0v11.25A2.25 2.25 0 0118 16.5h-2.25m-7.5 0h7.5m-7.5 0l-1 3m8.5-3l1 3m0 0l.5 1.5m-.5-1.5h-9.5m0 0l-.5 1.5M9 11.25v1.5M12 9v3.75m3-6v6"
          />
        </svg>
      }
      title="No scenarios yet"
      description="Create scenarios to explore different resource allocation strategies and compare outcomes."
      action={
        onCreate
          ? {
              label: 'Create Scenario',
              onClick: onCreate,
            }
          : undefined
      }
    />
  );
}

export function EmptyAllocations({ onCreate }: { onCreate?: () => void }) {
  return (
    <EmptyState
      icon={
        <svg
          className="w-16 h-16 text-surface-300"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={1.5}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5"
          />
        </svg>
      }
      title="No allocations yet"
      description="Allocate team members to initiatives to track resource utilization and capacity."
      action={
        onCreate
          ? {
              label: 'Add Allocation',
              onClick: onCreate,
            }
          : undefined
      }
      size="sm"
    />
  );
}

export function EmptyScopeItems({ onCreate }: { onCreate?: () => void }) {
  return (
    <EmptyState
      icon={
        <svg
          className="w-16 h-16 text-surface-300"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={1.5}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25zM6.75 12h.008v.008H6.75V12zm0 3h.008v.008H6.75V15zm0 3h.008v.008H6.75V18z"
          />
        </svg>
      }
      title="No scope items yet"
      description="Define work items with skill requirements and effort estimates to plan this initiative."
      action={
        onCreate
          ? {
              label: 'Add Scope Item',
              onClick: onCreate,
            }
          : undefined
      }
      size="sm"
    />
  );
}

export function EmptySearchResults({ onClear }: { onClear?: () => void }) {
  return (
    <EmptyState
      icon={
        <svg
          className="w-16 h-16 text-surface-300"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={1.5}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z"
          />
        </svg>
      }
      title="No results found"
      description="Try adjusting your search or filter criteria to find what you're looking for."
      action={
        onClear
          ? {
              label: 'Clear Filters',
              onClick: onClear,
              variant: 'secondary',
            }
          : undefined
      }
      size="sm"
    />
  );
}
