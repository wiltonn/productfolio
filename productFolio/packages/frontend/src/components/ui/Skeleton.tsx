import { HTMLAttributes } from 'react';

interface SkeletonProps extends HTMLAttributes<HTMLDivElement> {
  variant?: 'text' | 'circular' | 'rectangular';
  width?: string | number;
  height?: string | number;
  animation?: 'pulse' | 'wave' | 'none';
}

export function Skeleton({
  variant = 'rectangular',
  width,
  height,
  animation = 'pulse',
  className = '',
  ...props
}: SkeletonProps) {
  const baseClasses = 'bg-surface-200';

  const variantClasses = {
    text: 'rounded',
    circular: 'rounded-full',
    rectangular: 'rounded-lg',
  };

  const animationClasses = {
    pulse: 'animate-pulse',
    wave: 'animate-shimmer bg-gradient-to-r from-surface-200 via-surface-100 to-surface-200 bg-[length:200%_100%]',
    none: '',
  };

  const style = {
    width: width ? (typeof width === 'number' ? `${width}px` : width) : undefined,
    height: height ? (typeof height === 'number' ? `${height}px` : height) : undefined,
  };

  return (
    <div
      className={`${baseClasses} ${variantClasses[variant]} ${animationClasses[animation]} ${className}`}
      style={style}
      {...props}
    />
  );
}

// Specialized skeleton components for common use cases
export function SkeletonText({
  lines = 1,
  lastLineWidth = '60%',
}: {
  lines?: number;
  lastLineWidth?: string;
}) {
  return (
    <div className="space-y-2">
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton
          key={i}
          variant="text"
          height={16}
          width={i === lines - 1 && lines > 1 ? lastLineWidth : '100%'}
        />
      ))}
    </div>
  );
}

export function SkeletonAvatar({ size = 40 }: { size?: number }) {
  return <Skeleton variant="circular" width={size} height={size} />;
}

export function SkeletonButton({ width = 100 }: { width?: number }) {
  return <Skeleton height={40} width={width} />;
}

// Table skeleton
export function SkeletonTable({
  rows = 5,
  columns = 4,
}: {
  rows?: number;
  columns?: number;
}) {
  return (
    <div className="space-y-0">
      {/* Header */}
      <div className="grid gap-4 p-4 bg-surface-50 border-b border-surface-200" style={{ gridTemplateColumns: `repeat(${columns}, 1fr)` }}>
        {Array.from({ length: columns }).map((_, i) => (
          <Skeleton key={`header-${i}`} height={20} width="80%" />
        ))}
      </div>
      {/* Rows */}
      {Array.from({ length: rows }).map((_, rowIndex) => (
        <div
          key={`row-${rowIndex}`}
          className="grid gap-4 p-4 border-b border-surface-100"
          style={{ gridTemplateColumns: `repeat(${columns}, 1fr)` }}
        >
          {Array.from({ length: columns }).map((_, colIndex) => (
            <Skeleton
              key={`cell-${rowIndex}-${colIndex}`}
              height={16}
              width={colIndex === 0 ? '90%' : '70%'}
            />
          ))}
        </div>
      ))}
    </div>
  );
}

// Card skeleton
export function SkeletonCard() {
  return (
    <div className="card p-6 space-y-4">
      <div className="flex items-start justify-between">
        <div className="flex-1 space-y-3">
          <Skeleton height={24} width="60%" />
          <SkeletonText lines={2} lastLineWidth="80%" />
        </div>
        <SkeletonAvatar size={48} />
      </div>
      <div className="pt-4 border-t border-surface-100">
        <div className="grid grid-cols-3 gap-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="space-y-2">
              <Skeleton height={12} width="40%" />
              <Skeleton height={20} width="60%" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// Form skeleton
export function SkeletonForm({
  fields = 4,
}: {
  fields?: number;
}) {
  return (
    <div className="space-y-6">
      {Array.from({ length: fields }).map((_, i) => (
        <div key={i} className="space-y-2">
          <Skeleton height={16} width="25%" />
          <Skeleton height={40} width="100%" />
        </div>
      ))}
      <div className="flex gap-3 pt-4">
        <SkeletonButton width={100} />
        <SkeletonButton width={80} />
      </div>
    </div>
  );
}

// Stats card skeleton
export function SkeletonStatsCard() {
  return (
    <div className="stat-card">
      <div className="flex items-start justify-between">
        <div className="space-y-3 flex-1">
          <Skeleton height={14} width="50%" />
          <Skeleton height={32} width="40%" />
        </div>
        <Skeleton variant="circular" width={40} height={40} />
      </div>
    </div>
  );
}

// Initiative list skeleton
export function SkeletonInitiativesList({ count = 5 }: { count?: number }) {
  return (
    <div className="space-y-0">
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className="flex items-center gap-4 p-4 border-b border-surface-100"
        >
          <Skeleton width={24} height={24} />
          <div className="flex-1 space-y-2">
            <Skeleton height={20} width="40%" />
            <Skeleton height={14} width="60%" />
          </div>
          <Skeleton width={100} height={24} />
          <div className="flex items-center gap-2">
            <SkeletonAvatar size={32} />
            <Skeleton width={100} height={16} />
          </div>
          <Skeleton width={80} height={16} />
          <div className="flex gap-1">
            <Skeleton width={60} height={20} />
            <Skeleton width={60} height={20} />
          </div>
          <Skeleton width={60} height={14} />
        </div>
      ))}
    </div>
  );
}

// Scenario card skeleton
export function SkeletonScenarioCard() {
  return (
    <div className="card p-6">
      <div className="flex items-start justify-between mb-4">
        <div className="flex-1 space-y-2">
          <Skeleton height={24} width="60%" />
          <Skeleton height={16} width="80%" />
        </div>
        <Skeleton variant="circular" width={20} height={20} />
      </div>
      <div className="pt-4 border-t border-surface-100 grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Skeleton height={12} width="40%" />
          <Skeleton height={24} width="30%" />
        </div>
        <div className="space-y-2">
          <Skeleton height={12} width="40%" />
          <div className="flex items-center gap-2">
            <Skeleton height={24} width="30%" />
            <Skeleton height={8} width="100%" />
          </div>
        </div>
      </div>
      <Skeleton height={12} width="40%" className="mt-4" />
    </div>
  );
}

// Employee row skeleton
export function SkeletonEmployeeRow() {
  return (
    <div className="flex items-center gap-4 p-4 border-b border-surface-100">
      <Skeleton width={24} height={24} />
      <div className="flex items-center gap-3 flex-1">
        <SkeletonAvatar size={36} />
        <div className="space-y-2">
          <Skeleton height={16} width={120} />
          <Skeleton height={12} width={160} />
        </div>
      </div>
      <Skeleton width={140} height={16} />
      <div className="flex gap-1">
        <Skeleton width={60} height={24} />
        <Skeleton width={60} height={24} />
        <Skeleton width={60} height={24} />
      </div>
      <Skeleton width={50} height={16} />
      <Skeleton width={80} height={24} />
    </div>
  );
}

// Detail page skeleton
export function SkeletonDetailPage() {
  return (
    <div className="animate-fade-in">
      {/* Header */}
      <div className="page-header">
        <div className="flex items-start justify-between">
          <div className="space-y-3 flex-1">
            <Skeleton height={32} width="40%" />
            <Skeleton height={20} width="60%" />
          </div>
          <div className="flex gap-3">
            <SkeletonButton width={100} />
            <SkeletonButton width={120} />
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        {Array.from({ length: 4 }).map((_, i) => (
          <SkeletonStatsCard key={i} />
        ))}
      </div>

      {/* Content sections */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <SkeletonCard />
          <SkeletonCard />
        </div>
        <div className="space-y-6">
          <SkeletonCard />
        </div>
      </div>
    </div>
  );
}
