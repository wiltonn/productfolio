# Error States and Loading UI - Usage Examples

This document demonstrates how to use the comprehensive error states and loading UI components in the ProductFolio frontend.

## Components Overview

### 1. Empty States
Reusable components for displaying empty list states with optional illustrations and action buttons.

### 2. Error Boundaries
React error boundaries that catch JavaScript errors and display fallback UI with retry functionality.

### 3. Loading Skeletons
Skeleton components that match the shape of actual content for smooth loading experiences.

### 4. Offline Indicator
Automatic detection and display of offline/online status with banner notifications.

---

## Empty States

### Basic Usage

```tsx
import { EmptyState } from '@/components/ui';

function MyComponent() {
  return (
    <EmptyState
      title="No data available"
      description="Get started by creating your first item."
      action={{
        label: 'Create Item',
        onClick: handleCreate,
      }}
    />
  );
}
```

### Predefined Variants

```tsx
import {
  EmptyInitiatives,
  EmptyEmployees,
  EmptyScenarios,
  EmptyAllocations,
  EmptyScopeItems,
  EmptySearchResults,
} from '@/components/ui';

// In InitiativesList.tsx
function InitiativesList() {
  const { data } = useInitiatives();

  if (data?.length === 0) {
    return <EmptyInitiatives onCreate={handleCreate} />;
  }
  // ... rest of component
}

// For search results
function SearchableList() {
  const hasFilters = search || statusFilter.length > 0;

  if (filteredData.length === 0 && hasFilters) {
    return <EmptySearchResults onClear={clearFilters} />;
  }
  // ... rest of component
}
```

### Custom Icons

```tsx
<EmptyState
  icon={
    <svg className="w-16 h-16 text-surface-300">
      {/* Your custom SVG */}
    </svg>
  }
  title="Custom empty state"
  description="With your own illustration"
/>
```

---

## Error Boundaries

### Page-Level Error Boundary

Error boundaries are already wrapped around all routes in `router.tsx`. They automatically catch errors and display the default fallback UI.

### Custom Error Handling

```tsx
import { ErrorBoundary, CompactErrorFallback } from '@/components/ui';

function MySection() {
  return (
    <ErrorBoundary
      fallback={(error, reset) => (
        <CompactErrorFallback error={error} reset={reset} />
      )}
      onError={(error, errorInfo) => {
        // Log to error tracking service
        console.error('Error in MySection:', error, errorInfo);
      }}
    >
      <MyComponentThatMightError />
    </ErrorBoundary>
  );
}
```

### Using withErrorBoundary HOC

```tsx
import { withErrorBoundary } from '@/components/ui';

const SafeComponent = withErrorBoundary(MyComponent, {
  onError: (error, errorInfo) => {
    // Custom error logging
  },
});
```

---

## Loading Skeletons

### Table Skeleton

```tsx
import { SkeletonTable } from '@/components/ui';

function DataTable() {
  const { data, isLoading } = useQuery(...);

  if (isLoading) {
    return <SkeletonTable rows={5} columns={6} />;
  }

  return <Table data={data} />;
}
```

### Card Skeleton

```tsx
import { SkeletonCard } from '@/components/ui';

function CardList() {
  const { data, isLoading } = useQuery(...);

  if (isLoading) {
    return (
      <div className="grid grid-cols-3 gap-6">
        {Array.from({ length: 6 }).map((_, i) => (
          <SkeletonCard key={i} />
        ))}
      </div>
    );
  }

  return <div className="grid grid-cols-3 gap-6">{/* cards */}</div>;
}
```

### Detail Page Skeleton

```tsx
import { SkeletonDetailPage } from '@/components/ui';

function DetailPage() {
  const { data, isLoading } = useQuery(...);

  if (isLoading) {
    return <SkeletonDetailPage />;
  }

  return <div>{/* actual content */}</div>;
}
```

### Custom Skeleton Combinations

```tsx
import { Skeleton, SkeletonText, SkeletonAvatar } from '@/components/ui';

function CustomSkeleton() {
  return (
    <div className="flex items-center gap-4">
      <SkeletonAvatar size={48} />
      <div className="flex-1">
        <Skeleton height={20} width="60%" />
        <SkeletonText lines={2} lastLineWidth="80%" />
      </div>
    </div>
  );
}
```

### Predefined Page Skeletons

```tsx
import {
  SkeletonInitiativesList,
  SkeletonScenarioCard,
  SkeletonEmployeeRow,
} from '@/components/ui';

// For lists
if (isLoading) return <SkeletonInitiativesList count={10} />;

// For scenario cards
if (isLoading) {
  return (
    <div className="grid grid-cols-3 gap-6">
      {Array.from({ length: 6 }).map((_, i) => (
        <SkeletonScenarioCard key={i} />
      ))}
    </div>
  );
}

// For employee rows
if (isLoading) {
  return (
    <div>
      {Array.from({ length: 5 }).map((_, i) => (
        <SkeletonEmployeeRow key={i} />
      ))}
    </div>
  );
}
```

---

## Offline Indicator

The offline indicator is automatically integrated in `App.tsx` and requires no additional setup. It will:

- Show a banner when the connection is lost
- Auto-dismiss when back online
- Display a "Back online" message briefly after reconnecting

### Using the Online Status Hook

```tsx
import { useOnlineStatus } from '@/components/ui';

function MyComponent() {
  const isOnline = useOnlineStatus();

  return (
    <div>
      {!isOnline && (
        <div className="bg-warning text-white p-2 text-center">
          You are currently offline. Changes may not be saved.
        </div>
      )}
      {/* rest of component */}
    </div>
  );
}
```

---

## Complete Example: List Page

Here's a complete example combining all error states and loading UI:

```tsx
import {
  EmptyInitiatives,
  EmptySearchResults,
  ErrorBoundary,
  SkeletonInitiativesList,
  useOnlineStatus,
} from '@/components/ui';
import { useInitiatives } from '@/hooks/useInitiatives';

function InitiativesPage() {
  const [search, setSearch] = useState('');
  const [filters, setFilters] = useState({});
  const isOnline = useOnlineStatus();

  const { data, isLoading, error } = useInitiatives({ search, ...filters });

  const hasFilters = search || Object.keys(filters).length > 0;

  // Handle loading state
  if (isLoading) {
    return (
      <div className="animate-fade-in">
        <div className="page-header">
          <h1 className="page-title">Initiatives</h1>
        </div>
        <SkeletonInitiativesList count={8} />
      </div>
    );
  }

  // Handle error state (usually caught by ErrorBoundary, but good practice)
  if (error) {
    throw error; // Let ErrorBoundary handle it
  }

  // Handle empty state
  if (!data || data.length === 0) {
    if (hasFilters) {
      return (
        <div className="animate-fade-in">
          <div className="page-header">
            <h1 className="page-title">Initiatives</h1>
          </div>
          <EmptySearchResults
            onClear={() => {
              setSearch('');
              setFilters({});
            }}
          />
        </div>
      );
    }

    return (
      <div className="animate-fade-in">
        <div className="page-header">
          <h1 className="page-title">Initiatives</h1>
        </div>
        <EmptyInitiatives onCreate={handleCreate} />
      </div>
    );
  }

  // Show offline warning if needed
  const showOfflineWarning = !isOnline && data.some(item => item.isDirty);

  return (
    <ErrorBoundary>
      <div className="animate-fade-in">
        <div className="page-header">
          <h1 className="page-title">Initiatives</h1>
        </div>

        {showOfflineWarning && (
          <div className="bg-warning/10 border border-warning/20 rounded-lg p-4 mb-4">
            <p className="text-sm text-warning">
              You're offline. Unsaved changes will be lost.
            </p>
          </div>
        )}

        {/* Render actual list */}
        <DataTable data={data} />
      </div>
    </ErrorBoundary>
  );
}
```

---

## Best Practices

### 1. Loading States
- Always show loading skeletons that match the shape of your content
- Use `isLoading` from React Query for initial loads
- Use `isFetching` for background refreshes (don't show skeleton)

### 2. Empty States
- Provide helpful actions when possible
- Different messages for "truly empty" vs "no search results"
- Use appropriate illustrations for context

### 3. Error Boundaries
- Wrap each major page/section
- Provide custom fallbacks for critical sections
- Log errors to monitoring service in `onError`

### 4. Offline Handling
- The global indicator is enough for most cases
- Use `useOnlineStatus()` hook for component-specific offline logic
- Warn users before they lose unsaved data

### 5. Accessibility
- All empty states and errors are keyboard navigable
- Screen readers can access all content
- Focus management works correctly after errors

---

## Testing Tips

### Simulating Offline
```js
// In browser console
window.dispatchEvent(new Event('offline'));
window.dispatchEvent(new Event('online'));
```

### Triggering Errors
```tsx
// Add a button in dev mode to test error boundaries
<button onClick={() => { throw new Error('Test error'); }}>
  Test Error Boundary
</button>
```

### Testing Empty States
```tsx
// Mock empty responses in your tests
vi.mock('@/hooks/useInitiatives', () => ({
  useInitiatives: () => ({
    data: [],
    isLoading: false,
    error: null,
  }),
}));
```
