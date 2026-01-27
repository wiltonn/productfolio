import { useCallback, useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';

/**
 * Map of routes to their likely next routes for prefetching.
 * This enables intelligent prefetching based on user navigation patterns.
 */
const PREFETCH_MAP: Record<string, string[]> = {
  '/login': ['/initiatives'],
  '/initiatives': ['/initiatives/:id', '/capacity'],
  '/capacity': ['/scenarios', '/initiatives'],
  '/scenarios': ['/scenarios/:id', '/reports'],
  '/reports': ['/initiatives', '/scenarios'],
};

/**
 * Dynamic import functions for each route chunk.
 * These are called to trigger the browser to download the chunk.
 */
const routeImports: Record<string, () => Promise<unknown>> = {
  '/initiatives': () => import('../pages/InitiativesList'),
  '/initiatives/:id': () => import('../pages/InitiativeDetail'),
  '/capacity': () => import('../pages/Capacity'),
  '/scenarios': () => import('../pages/ScenariosList'),
  '/scenarios/:id': () => import('../pages/ScenarioPlanner'),
  '/reports': () => import('../pages/Reports'),
};

/**
 * Normalize a pathname to match prefetch map keys.
 * Converts specific IDs to :id patterns.
 */
function normalizePathname(pathname: string): string {
  // Match UUID patterns and replace with :id
  return pathname.replace(/\/[0-9a-f-]{36}/gi, '/:id');
}

/**
 * Hook that prefetches likely navigation targets based on current route.
 * Uses requestIdleCallback for non-blocking prefetch during idle time.
 *
 * @param delay - Delay in ms before starting prefetch (default: 2000ms)
 */
export function useRoutePrefetch(delay = 2000): void {
  const location = useLocation();
  const prefetchedRef = useRef<Set<string>>(new Set());

  const prefetchRoute = useCallback((route: string) => {
    // Skip if already prefetched
    if (prefetchedRef.current.has(route)) {
      return;
    }

    const importFn = routeImports[route];
    if (!importFn) {
      return;
    }

    // Mark as prefetched to avoid duplicate requests
    prefetchedRef.current.add(route);

    // Use requestIdleCallback if available, otherwise setTimeout
    const scheduleCallback =
      typeof window !== 'undefined' && 'requestIdleCallback' in window
        ? (window as unknown as { requestIdleCallback: (cb: () => void, opts?: { timeout: number }) => number }).requestIdleCallback
        : (cb: () => void) => setTimeout(cb, 100);

    scheduleCallback(
      () => {
        // Trigger the dynamic import to download the chunk
        importFn().catch(() => {
          // Silently fail - this is just a prefetch optimization
          // The route will load normally when navigated to
        });
      },
      { timeout: 5000 }
    );
  }, []);

  useEffect(() => {
    const normalizedPath = normalizePathname(location.pathname);
    const routesToPrefetch = PREFETCH_MAP[normalizedPath];

    if (!routesToPrefetch || routesToPrefetch.length === 0) {
      return;
    }

    // Delay prefetching to prioritize current page resources
    const timeoutId = setTimeout(() => {
      routesToPrefetch.forEach(prefetchRoute);
    }, delay);

    return () => {
      clearTimeout(timeoutId);
    };
  }, [location.pathname, delay, prefetchRoute]);
}

/**
 * Hook that prefetches a specific route on hover/focus.
 * Useful for links that are likely to be clicked.
 *
 * @returns Object with onMouseEnter and onFocus handlers
 */
export function usePrefetchOnHover(route: string): {
  onMouseEnter: () => void;
  onFocus: () => void;
} {
  const prefetchedRef = useRef(false);

  const prefetch = useCallback(() => {
    if (prefetchedRef.current) {
      return;
    }

    const normalizedRoute = normalizePathname(route);
    const importFn = routeImports[normalizedRoute];

    if (importFn) {
      prefetchedRef.current = true;
      importFn().catch(() => {
        // Silently fail
      });
    }
  }, [route]);

  return {
    onMouseEnter: prefetch,
    onFocus: prefetch,
  };
}
