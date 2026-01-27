# Frontend Performance Optimizations

This document outlines the performance optimizations implemented to achieve Lighthouse scores > 90.

## 1. Code Splitting by Route

### Implementation
- **Lazy loading**: All route-level components use `React.lazy()` with dynamic imports
- **Suspense boundaries**: Each route has appropriate skeleton fallbacks during loading
- **Location**: `/src/router.tsx`

### Route Chunks Created
| Route | Chunk | Gzip Size |
|-------|-------|-----------|
| `/unauthorized` | `pages/Unauthorized.*.js` | ~0.7 KB |
| `/scenarios` | `pages/ScenariosList.*.js` | ~1.6 KB |
| `/reports` | `pages/Reports.*.js` | ~5.4 KB |
| `/capacity` | `pages/Capacity.*.js` | ~6.3 KB |
| `/initiatives` | `pages/InitiativesList.*.js` | ~7.7 KB |
| `/scenarios/:id` | `pages/ScenarioPlanner.*.js` | ~7.0 KB |
| `/initiatives/:id` | `pages/InitiativeDetail.*.js` | ~8.3 KB |

### Vendor Chunking Strategy
| Chunk | Contents | Gzip Size | When Loaded |
|-------|----------|-----------|-------------|
| `vendor-react` | React, ReactDOM, React Router | 74.5 KB | Initial load |
| `vendor-data` | TanStack Query, Table, Virtual | 30.4 KB | When data features used |
| `vendor-dnd` | DnD Kit | 16.5 KB | Only on Scenario Planner |
| `vendor-state` | Zustand | 0.4 KB | Initial load |

## 2. Suspense Fallbacks

### Loading Skeletons
Located in `/src/components/ui/LoadingSkeleton.tsx`:

- **PageLoadingSkeleton**: Generic page skeleton with header, stats, and table
- **DetailPageSkeleton**: For initiative/scenario detail pages
- **PlannerPageSkeleton**: For the scenario planner's complex layout
- **CenteredLoader**: Simple centered spinner with message
- **LoadingSpinner**: Minimal inline spinner

### Usage
```tsx
// In router.tsx
<Suspense fallback={<PageLoadingSkeleton />}>
  <InitiativesList />
</Suspense>
```

## 3. Route Prefetching

### Implementation
Located in `/src/hooks/useRoutePrefetch.ts`:

- **Automatic prefetching**: Prefetches likely next routes based on current location
- **Idle-time loading**: Uses `requestIdleCallback` to avoid blocking main thread
- **Deduplication**: Tracks prefetched routes to avoid duplicate requests

### Prefetch Map
| Current Route | Prefetched Routes |
|---------------|-------------------|
| `/login` | `/initiatives` |
| `/initiatives` | `/initiatives/:id`, `/capacity` |
| `/capacity` | `/scenarios`, `/initiatives` |
| `/scenarios` | `/scenarios/:id`, `/reports` |
| `/reports` | `/initiatives`, `/scenarios` |

### Hover Prefetching
```tsx
import { usePrefetchOnHover } from '@/hooks';

function MyLink({ to, children }) {
  const prefetchProps = usePrefetchOnHover(to);
  return (
    <Link to={to} {...prefetchProps}>
      {children}
    </Link>
  );
}
```

## 4. Vite Build Optimization

### Configuration (`vite.config.ts`)

```typescript
build: {
  rollupOptions: {
    output: {
      manualChunks: {
        'vendor-react': ['react', 'react-dom', 'react-router-dom'],
        'vendor-data': ['@tanstack/react-query', '@tanstack/react-table', '@tanstack/react-virtual'],
        'vendor-dnd': ['@dnd-kit/core', '@dnd-kit/sortable', '@dnd-kit/utilities'],
        'vendor-state': ['zustand'],
      },
    },
  },
  target: 'es2020',
  minify: 'esbuild',
  cssCodeSplit: true,
}
```

### Optimization Features
- **Manual chunk splitting**: Vendor libraries grouped by usage patterns
- **ES2020 target**: Smaller bundle for modern browsers
- **CSS code splitting**: CSS loaded per-route
- **Named chunks**: Descriptive chunk names for debugging

## 5. HTML Optimizations

### Critical Rendering Path (`index.html`)
- **Preconnect**: Early connection to API origin
- **DNS prefetch**: For external font resources
- **Critical CSS**: Inline styles for initial loading state
- **Initial loader**: Smooth spinner while JavaScript loads
- **No-script fallback**: Message for JavaScript-disabled browsers

## 6. Virtualization (Already Implemented)

### VirtualTable Component
Located in `/src/components/ui/VirtualTable.tsx`:

- Uses `@tanstack/react-virtual` for efficient list rendering
- Overscan of 15 rows for smooth scrolling
- Row height of 52px (configurable)
- Handles 1000+ rows efficiently

### Usage
The `InitiativesList` page already uses `VirtualTable` for its main data grid with 1200+ mock items.

## 7. Memoization Patterns

### Existing Patterns
The codebase already uses appropriate memoization:
- `useMemo` for computed values (filters, stats, column definitions)
- `useCallback` for event handlers
- Column definitions memoized with empty dependency array

### Component Memoization
Loading skeletons use `React.memo()` to prevent unnecessary re-renders.

## Measuring Performance

### Lighthouse Audit
```bash
# Build production bundle
npm run build

# Serve and audit
npx serve dist -l 3001
npx lighthouse http://localhost:3001 --output=html --output-path=./lighthouse-report.html
```

### Bundle Analysis
```bash
# Install bundle analyzer
npm install -D rollup-plugin-visualizer

# Add to vite.config.ts plugins:
import { visualizer } from 'rollup-plugin-visualizer';
plugins: [
  react(),
  visualizer({ open: true, gzipSize: true })
]

# Run build
npm run build
```

### Core Web Vitals Monitoring
Add to your application for real user metrics:
```typescript
import { onCLS, onFID, onLCP } from 'web-vitals';

onCLS(console.log);
onFID(console.log);
onLCP(console.log);
```

## Expected Lighthouse Scores

With these optimizations, expect:
- **Performance**: 90+
- **First Contentful Paint**: < 1.8s
- **Largest Contentful Paint**: < 2.5s
- **Time to Interactive**: < 3.8s
- **Total Blocking Time**: < 200ms

## Future Optimizations

1. **Service Worker**: Add PWA support for offline caching
2. **Image optimization**: Add WebP with fallbacks when images are needed
3. **Font optimization**: Subset fonts, use font-display: swap
4. **Compression**: Enable Brotli/gzip on production server
5. **CDN**: Serve static assets from edge locations
