import { memo } from 'react';

/**
 * Page-level loading skeleton for route transitions.
 * Used as Suspense fallback for lazy-loaded route components.
 */
export const PageLoadingSkeleton = memo(function PageLoadingSkeleton() {
  return (
    <div className="animate-pulse">
      {/* Header skeleton */}
      <div className="mb-6">
        <div className="h-8 w-48 bg-surface-200 rounded-lg mb-2" />
        <div className="h-4 w-72 bg-surface-100 rounded" />
      </div>

      {/* Stats cards skeleton */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="bg-white rounded-lg border border-surface-200 p-4">
            <div className="h-3 w-20 bg-surface-100 rounded mb-3" />
            <div className="h-7 w-16 bg-surface-200 rounded" />
          </div>
        ))}
      </div>

      {/* Table skeleton */}
      <div className="bg-white rounded-lg border border-surface-200 overflow-hidden">
        {/* Filter bar */}
        <div className="px-4 py-3 border-b border-surface-200 bg-surface-50/50">
          <div className="flex items-center gap-3">
            <div className="h-9 w-72 bg-surface-200 rounded-lg" />
            <div className="h-9 w-36 bg-surface-100 rounded-lg" />
            <div className="h-9 w-28 bg-surface-100 rounded-lg" />
          </div>
        </div>

        {/* Table header */}
        <div className="px-4 py-3 border-b border-surface-200 bg-surface-50">
          <div className="flex items-center gap-4">
            <div className="h-4 w-8 bg-surface-200 rounded" />
            <div className="h-4 w-40 bg-surface-200 rounded" />
            <div className="h-4 w-20 bg-surface-100 rounded" />
            <div className="h-4 w-32 bg-surface-100 rounded" />
            <div className="h-4 w-24 bg-surface-100 rounded" />
          </div>
        </div>

        {/* Table rows */}
        {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
          <div
            key={i}
            className="px-4 py-3 border-b border-surface-100 flex items-center gap-4"
            style={{ opacity: 1 - i * 0.08 }}
          >
            <div className="h-4 w-4 bg-surface-100 rounded" />
            <div className="h-5 w-48 bg-surface-200 rounded" />
            <div className="h-5 w-20 bg-surface-100 rounded-full" />
            <div className="h-5 w-28 bg-surface-100 rounded" />
            <div className="h-5 w-20 bg-surface-100 rounded" />
          </div>
        ))}
      </div>
    </div>
  );
});

/**
 * Minimal spinner for small inline loading states.
 */
export const LoadingSpinner = memo(function LoadingSpinner({
  size = 'md',
  className = '',
}: {
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}) {
  const sizes = {
    sm: 'h-4 w-4',
    md: 'h-5 w-5',
    lg: 'h-6 w-6',
  };

  return (
    <svg
      className={`animate-spin ${sizes[size]} ${className}`}
      fill="none"
      viewBox="0 0 24 24"
    >
      <circle
        className="opacity-25"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="3"
      />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
      />
    </svg>
  );
});

/**
 * Centered loading state for full-page or container loading.
 */
export const CenteredLoader = memo(function CenteredLoader({
  message = 'Loading...',
}: {
  message?: string;
}) {
  return (
    <div className="flex items-center justify-center h-64">
      <div className="flex items-center gap-3 text-surface-500">
        <LoadingSpinner />
        <span className="text-sm font-medium">{message}</span>
      </div>
    </div>
  );
});

/**
 * Detail page skeleton for initiative/scenario detail pages.
 */
export const DetailPageSkeleton = memo(function DetailPageSkeleton() {
  return (
    <div className="animate-pulse">
      {/* Back link */}
      <div className="mb-6">
        <div className="h-4 w-32 bg-surface-100 rounded" />
      </div>

      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center gap-4 mb-2">
          <div className="h-8 w-64 bg-surface-200 rounded-lg" />
          <div className="h-6 w-24 bg-surface-100 rounded-full" />
        </div>
        <div className="flex items-center gap-4">
          <div className="h-4 w-36 bg-surface-100 rounded" />
          <div className="h-4 w-28 bg-surface-100 rounded" />
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-6 border-b border-surface-200 mb-6">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="h-4 w-20 bg-surface-100 rounded mb-3" />
        ))}
      </div>

      {/* Content grid */}
      <div className="grid grid-cols-3 gap-6">
        <div className="col-span-2 space-y-6">
          <div className="bg-white rounded-lg border border-surface-200 p-6">
            <div className="h-4 w-28 bg-surface-200 rounded mb-4" />
            <div className="space-y-2">
              <div className="h-4 w-full bg-surface-100 rounded" />
              <div className="h-4 w-5/6 bg-surface-100 rounded" />
              <div className="h-4 w-4/6 bg-surface-100 rounded" />
            </div>
          </div>
        </div>
        <div className="space-y-6">
          <div className="bg-white rounded-lg border border-surface-200 p-6">
            <div className="h-4 w-24 bg-surface-200 rounded mb-4" />
            <div className="h-10 w-20 bg-surface-100 rounded mb-4 mx-auto" />
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="flex justify-between">
                  <div className="h-3 w-16 bg-surface-100 rounded" />
                  <div className="h-3 w-12 bg-surface-100 rounded" />
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
});

/**
 * Planner page skeleton for scenario planner.
 */
export const PlannerPageSkeleton = memo(function PlannerPageSkeleton() {
  return (
    <div className="animate-pulse h-[calc(100vh-160px)]">
      {/* Header */}
      <div className="flex items-center justify-between mb-4 px-4 py-3 bg-white rounded-lg border border-surface-200">
        <div className="flex items-center gap-4">
          <div className="h-4 w-20 bg-surface-100 rounded" />
          <div className="h-6 w-48 bg-surface-200 rounded" />
        </div>
        <div className="flex items-center gap-3">
          <div className="h-8 w-24 bg-surface-100 rounded-lg" />
          <div className="h-8 w-24 bg-surface-100 rounded-lg" />
          <div className="h-8 w-24 bg-surface-100 rounded-lg" />
        </div>
      </div>

      {/* Main panels */}
      <div className="flex gap-4 h-full">
        {/* Left panel */}
        <div className="w-96 bg-white rounded-lg border border-surface-200 p-4">
          <div className="h-5 w-32 bg-surface-200 rounded mb-4" />
          <div className="h-9 w-full bg-surface-100 rounded-lg mb-4" />
          <div className="space-y-3">
            {[1, 2, 3, 4, 5].map((i) => (
              <div
                key={i}
                className="p-3 bg-surface-50 rounded-lg"
                style={{ opacity: 1 - i * 0.15 }}
              >
                <div className="h-4 w-40 bg-surface-200 rounded mb-2" />
                <div className="flex gap-2">
                  <div className="h-3 w-16 bg-surface-100 rounded" />
                  <div className="h-3 w-12 bg-surface-100 rounded" />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Right panel */}
        <div className="flex-1 bg-white rounded-lg border border-surface-200 p-4">
          <div className="flex gap-4 mb-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-8 w-24 bg-surface-100 rounded-lg" />
            ))}
          </div>
          <div className="h-64 bg-surface-50 rounded-lg" />
        </div>
      </div>
    </div>
  );
});
