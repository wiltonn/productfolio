import { useQuery } from '@tanstack/react-query';
import { api } from '../api/client';

export interface Period {
  id: string;
  type: 'QUARTER' | 'MONTH' | 'WEEK';
  startDate: string;
  endDate: string;
  label: string;
  year: number;
  ordinal: number;
  parentId: string | null;
  createdAt: string;
}

interface PeriodListResponse {
  data: Period[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export const periodKeys = {
  all: ['periods'] as const,
  lists: () => [...periodKeys.all, 'list'] as const,
  list: (filters?: { type?: string }) => [...periodKeys.lists(), filters] as const,
};

export function useQuarterPeriods() {
  return useQuery({
    queryKey: periodKeys.list({ type: 'QUARTER' }),
    queryFn: () => api.get<PeriodListResponse>('/periods?type=QUARTER&limit=100'),
    staleTime: 5 * 60 * 1000, // quarters rarely change
  });
}

/**
 * Given an array of periods and a start/end quarter label (e.g. "2026-Q1", "2026-Q4"),
 * returns the period IDs for all quarters in that range (inclusive).
 */
export function getQuarterPeriodIds(
  periods: Period[],
  startLabel: string,
  endLabel: string
): string[] {
  // Parse labels to comparable values
  const parseLabel = (label: string) => {
    const [year, q] = label.split('-Q').map(Number);
    return year * 4 + q;
  };

  const startVal = parseLabel(startLabel);
  const endVal = parseLabel(endLabel);

  return periods
    .filter((p) => {
      const val = parseLabel(p.label);
      return val >= startVal && val <= endVal;
    })
    .sort((a, b) => {
      const aVal = parseLabel(a.label);
      const bVal = parseLabel(b.label);
      return aVal - bVal;
    })
    .map((p) => p.id);
}

/**
 * Given an array of period IDs and the full period list, derive a quarterRange string
 * like "2026-Q1:2026-Q4".
 */
export function deriveQuarterRange(
  periodIds: string[],
  periods: Period[]
): string {
  if (periodIds.length === 0) return '';

  const matched = periods
    .filter((p) => periodIds.includes(p.id))
    .sort((a, b) => {
      const aVal = a.year * 4 + a.ordinal;
      const bVal = b.year * 4 + b.ordinal;
      return aVal - bVal;
    });

  if (matched.length === 0) return '';

  const first = matched[0];
  const last = matched[matched.length - 1];
  return `${first.label}:${last.label}`;
}
