import { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Select, StatusBadge, DeliveryHealthBadge, ProgressBar } from '../components/ui';
import { useInitiatives } from '../hooks/useInitiatives';
import { getQuarterOptions, getCurrentQuarter } from '../types';
import type { Initiative, DeliveryHealth } from '../types';

const healthFilterOptions = [
  { value: '', label: 'All Health' },
  { value: 'ON_TRACK', label: 'On Track' },
  { value: 'AT_RISK', label: 'At Risk' },
  { value: 'DELAYED', label: 'Delayed' },
];

const healthConfig: Record<string, { color: string; label: string }> = {
  ON_TRACK: { color: 'bg-emerald-500', label: 'On Track' },
  AT_RISK: { color: 'bg-amber-500', label: 'At Risk' },
  DELAYED: { color: 'bg-red-500', label: 'Delayed' },
};

function getProgressStatus(health: DeliveryHealth | null): 'default' | 'success' | 'warning' | 'danger' {
  if (!health) return 'default';
  if (health === 'ON_TRACK') return 'success';
  if (health === 'AT_RISK') return 'warning';
  return 'danger';
}

function estimateProgress(initiative: Initiative): number {
  // Simple heuristic based on status milestone
  switch (initiative.status) {
    case 'PROPOSED': return 5;
    case 'SCOPING': return 15;
    case 'RESOURCING': return 30;
    case 'IN_EXECUTION': return 60;
    case 'COMPLETE': return 100;
    case 'ON_HOLD': return 50;
    case 'CANCELLED': return 0;
    default: return 0;
  }
}

export function DeliveryForecast() {
  const [quarterFilter, setQuarterFilter] = useState(getCurrentQuarter());
  const [healthFilter, setHealthFilter] = useState('');

  const quarterOptions = getQuarterOptions(1, 3);

  const filters = useMemo(() => ({
    targetQuarter: quarterFilter || undefined,
    deliveryHealth: (healthFilter as DeliveryHealth) || undefined,
    limit: 100,
  }), [quarterFilter, healthFilter]);

  const { data: apiData, isLoading } = useInitiatives(filters);
  const initiatives = apiData?.data ?? [];

  // Group by quarter
  const grouped = useMemo(() => {
    const groups: Record<string, Initiative[]> = {};
    for (const init of initiatives) {
      const key = init.targetQuarter || 'Unassigned';
      if (!groups[key]) groups[key] = [];
      groups[key].push(init);
    }
    // Sort keys: quarters first (sorted), then Unassigned last
    return Object.entries(groups).sort(([a], [b]) => {
      if (a === 'Unassigned') return 1;
      if (b === 'Unassigned') return -1;
      return a.localeCompare(b);
    });
  }, [initiatives]);

  return (
    <div className="animate-fade-in">
      {/* Header */}
      <div className="page-header flex items-center justify-between">
        <div>
          <h1 className="page-title">Delivery Forecast</h1>
          <p className="page-subtitle">Track initiative delivery health and progress by quarter</p>
        </div>
        <div className="flex items-center gap-4 text-xs">
          {Object.entries(healthConfig).map(([key, config]) => (
            <div key={key} className="flex items-center gap-1.5">
              <span className={`w-2 h-2 rounded-full ${config.color}`} />
              <span className="text-surface-500">{config.label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 mb-6">
        <Select
          options={quarterOptions}
          value={quarterFilter}
          onChange={setQuarterFilter}
          placeholder="Quarter"
          className="w-36"
        />
        <Select
          options={healthFilterOptions}
          value={healthFilter}
          onChange={setHealthFilter}
          placeholder="Health"
          className="w-36"
          allowClear={false}
        />
        {(quarterFilter || healthFilter) && (
          <button
            onClick={() => { setQuarterFilter(''); setHealthFilter(''); }}
            className="text-sm text-surface-500 hover:text-surface-700 transition-colors"
          >
            Clear filters
          </button>
        )}
      </div>

      {/* Content */}
      {isLoading ? (
        <div className="flex items-center justify-center h-64">
          <div className="flex items-center gap-3 text-surface-500">
            <svg className="animate-spin h-5 w-5" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
            </svg>
            <span className="text-sm font-medium">Loading forecast...</span>
          </div>
        </div>
      ) : initiatives.length === 0 ? (
        <div className="card p-12 text-center">
          <svg className="w-12 h-12 mx-auto mb-4 text-surface-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" />
          </svg>
          <p className="text-surface-500 text-sm">No initiatives match the current filters</p>
        </div>
      ) : (
        <div className="delivery-timeline space-y-6">
          {grouped.map(([quarter, items]) => (
            <div key={quarter} className="timeline-quarter card overflow-hidden">
              <div className="timeline-quarter-header px-6 py-4 bg-surface-50 border-b border-surface-200 flex items-center justify-between">
                <span className="font-mono font-semibold text-surface-900">{quarter}</span>
                <span className="text-xs text-surface-400">{items.length} initiative{items.length !== 1 ? 's' : ''}</span>
              </div>
              <div className="timeline-items divide-y divide-surface-100">
                {items.map((item, i) => {
                  const progress = estimateProgress(item);
                  return (
                    <div
                      key={item.id}
                      className="timeline-item px-6 py-4 hover:bg-surface-50 transition-colors animate-fade-in"
                      style={{ animationDelay: `${i * 50}ms` }}
                    >
                      <div className="flex items-center gap-3 mb-2">
                        <Link
                          to={`/initiatives/${item.id}`}
                          className="font-medium text-surface-900 hover:text-accent-600 transition-colors truncate"
                        >
                          {item.title}
                        </Link>
                        <StatusBadge status={item.status} size="sm" />
                        {item.deliveryHealth && (
                          <DeliveryHealthBadge health={item.deliveryHealth} size="sm" />
                        )}
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="flex-1">
                          <ProgressBar
                            value={progress}
                            size="sm"
                            status={getProgressStatus(item.deliveryHealth)}
                          />
                        </div>
                        <span className="text-xs font-mono text-surface-500 tabular-nums whitespace-nowrap w-8 text-right">
                          {progress}%
                        </span>
                        {item.updatedAt && (
                          <span className="text-xs text-surface-400 whitespace-nowrap">
                            Updated {new Date(item.updatedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
