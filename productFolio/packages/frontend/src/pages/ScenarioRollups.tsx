import { useState, useMemo } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useScenario } from '../hooks/useScenarios';
import {
  usePortfolioAreaRollup,
  useOrgNodeRollup,
  useBusinessOwnerRollup,
} from '../hooks/useRollups';
import { useFeatureFlag } from '../hooks/useFeatureFlags';
import type { RollupResponse, RollupGroupRow } from '../types/rollup.types';

// ============================================================================
// Format Helpers
// ============================================================================

function formatCurrency(value: number): string {
  if (value >= 1_000_000) {
    return `$${(value / 1_000_000).toFixed(1)}M`;
  }
  if (value >= 1_000) {
    return `$${(value / 1_000).toFixed(1)}K`;
  }
  return `$${value.toFixed(0)}`;
}

function formatHours(value: number): string {
  return value.toLocaleString();
}

function formatDate(value: string | null): string {
  if (!value) return '--';
  try {
    return new Date(value).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  } catch {
    return value;
  }
}

// ============================================================================
// Tab definitions
// ============================================================================

type TabKey = 'portfolio-areas' | 'org-nodes' | 'business-owners';

const TABS: Array<{ key: TabKey; label: string }> = [
  { key: 'portfolio-areas', label: 'Portfolio Areas' },
  { key: 'org-nodes', label: 'Org Nodes' },
  { key: 'business-owners', label: 'Business Owners' },
];

// ============================================================================
// Rollup Table
// ============================================================================

function RollupTable({
  groups,
  unattributed,
  totals,
  planningMode,
}: {
  groups: RollupGroupRow[];
  unattributed: RollupGroupRow;
  totals: RollupResponse['totals'];
  planningMode: 'LEGACY' | 'TOKEN';
}) {
  const sorted = useMemo(
    () => [...groups].sort((a, b) => a.groupName.localeCompare(b.groupName)),
    [groups],
  );

  const isToken = planningMode === 'TOKEN';
  const showUnattributed = unattributed.initiativeCount > 0;

  if (sorted.length === 0 && !showUnattributed) {
    return (
      <div className="bg-white border rounded-lg p-8 text-center">
        <p className="text-sm text-surface-400">
          No rollup data available for this lens. Ensure initiatives have
          allocations in this scenario.
        </p>
      </div>
    );
  }

  return (
    <div className="bg-white border rounded-lg overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-surface-50">
              <th className="text-left py-3 px-4 font-medium text-surface-700">
                Group Name
              </th>
              <th className="text-right py-3 px-4 font-medium text-surface-700">
                Initiatives (#)
              </th>
              <th className="text-right py-3 px-4 font-medium text-surface-700">
                Hours
              </th>
              <th className="text-right py-3 px-4 font-medium text-surface-700">
                Est. Cost ($)
              </th>
              {isToken && (
                <>
                  <th className="text-right py-3 px-4 font-medium text-surface-700">
                    Tokens P50
                  </th>
                  <th className="text-right py-3 px-4 font-medium text-surface-700">
                    Tokens P90
                  </th>
                </>
              )}
              <th className="text-right py-3 px-4 font-medium text-surface-700">
                Earliest Start
              </th>
              <th className="text-right py-3 px-4 font-medium text-surface-700">
                Latest End
              </th>
              <th className="text-right py-3 px-4 font-medium text-surface-700">
                Periods (#)
              </th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((row) => (
              <tr
                key={row.groupId}
                className="border-b border-surface-100 hover:bg-surface-50"
              >
                <td className="py-3 px-4 text-surface-900 font-medium">
                  {row.groupName}
                </td>
                <td className="py-3 px-4 text-right font-mono text-surface-800">
                  {row.initiativeCount}
                </td>
                <td className="py-3 px-4 text-right font-mono text-surface-800">
                  {formatHours(row.budget.totalHours)}
                </td>
                <td className="py-3 px-4 text-right font-mono text-surface-800">
                  {formatCurrency(row.budget.totalEstimatedCost)}
                </td>
                {isToken && (
                  <>
                    <td className="py-3 px-4 text-right font-mono text-surface-800">
                      {row.scope ? row.scope.totalTokensP50.toLocaleString() : '--'}
                    </td>
                    <td className="py-3 px-4 text-right font-mono text-surface-800">
                      {row.scope?.totalTokensP90 != null
                        ? row.scope.totalTokensP90.toLocaleString()
                        : '--'}
                    </td>
                  </>
                )}
                <td className="py-3 px-4 text-right text-surface-800">
                  {formatDate(row.timeline.earliestStart)}
                </td>
                <td className="py-3 px-4 text-right text-surface-800">
                  {formatDate(row.timeline.latestEnd)}
                </td>
                <td className="py-3 px-4 text-right font-mono text-surface-800">
                  {row.timeline.periodCount}
                </td>
              </tr>
            ))}

            {/* Unattributed row */}
            {showUnattributed && (
              <tr className="border-b border-surface-100 bg-amber-50/50">
                <td className="py-3 px-4 text-amber-800 font-medium italic">
                  Unattributed
                </td>
                <td className="py-3 px-4 text-right font-mono text-amber-800">
                  {unattributed.initiativeCount}
                </td>
                <td className="py-3 px-4 text-right font-mono text-amber-800">
                  {formatHours(unattributed.budget.totalHours)}
                </td>
                <td className="py-3 px-4 text-right font-mono text-amber-800">
                  {formatCurrency(unattributed.budget.totalEstimatedCost)}
                </td>
                {isToken && (
                  <>
                    <td className="py-3 px-4 text-right font-mono text-amber-800">
                      {unattributed.scope
                        ? unattributed.scope.totalTokensP50.toLocaleString()
                        : '--'}
                    </td>
                    <td className="py-3 px-4 text-right font-mono text-amber-800">
                      {unattributed.scope?.totalTokensP90 != null
                        ? unattributed.scope.totalTokensP90.toLocaleString()
                        : '--'}
                    </td>
                  </>
                )}
                <td className="py-3 px-4 text-right text-amber-800">
                  {formatDate(unattributed.timeline.earliestStart)}
                </td>
                <td className="py-3 px-4 text-right text-amber-800">
                  {formatDate(unattributed.timeline.latestEnd)}
                </td>
                <td className="py-3 px-4 text-right font-mono text-amber-800">
                  {unattributed.timeline.periodCount}
                </td>
              </tr>
            )}
          </tbody>

          {/* Totals footer */}
          <tfoot>
            <tr className="bg-surface-100 font-semibold">
              <td className="py-3 px-4 text-surface-900">Totals</td>
              <td className="py-3 px-4 text-right font-mono text-surface-900">
                {sorted.reduce((sum, r) => sum + r.initiativeCount, 0) +
                  (showUnattributed ? unattributed.initiativeCount : 0)}
              </td>
              <td className="py-3 px-4 text-right font-mono text-surface-900">
                {formatHours(totals.budget.totalHours)}
              </td>
              <td className="py-3 px-4 text-right font-mono text-surface-900">
                {formatCurrency(totals.budget.totalEstimatedCost)}
              </td>
              {isToken && (
                <>
                  <td className="py-3 px-4 text-right font-mono text-surface-900">
                    {totals.scope
                      ? totals.scope.totalTokensP50.toLocaleString()
                      : '--'}
                  </td>
                  <td className="py-3 px-4 text-right font-mono text-surface-900">
                    {totals.scope?.totalTokensP90 != null
                      ? totals.scope.totalTokensP90.toLocaleString()
                      : '--'}
                  </td>
                </>
              )}
              <td className="py-3 px-4 text-right text-surface-900">
                {formatDate(totals.timeline.earliestStart)}
              </td>
              <td className="py-3 px-4 text-right text-surface-900">
                {formatDate(totals.timeline.latestEnd)}
              </td>
              <td className="py-3 px-4 text-right font-mono text-surface-900">
                {totals.timeline.periodCount}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}

// ============================================================================
// Warnings Banner
// ============================================================================

function WarningsBanner({ warnings }: { warnings: string[] }) {
  if (warnings.length === 0) return null;

  return (
    <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
      <div className="flex items-start gap-2">
        <svg
          className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z"
          />
        </svg>
        <div>
          <h4 className="text-sm font-medium text-amber-800">
            Data Warnings
          </h4>
          <ul className="mt-1 text-sm text-amber-700 list-disc list-inside space-y-0.5">
            {warnings.map((w, i) => (
              <li key={i}>{w}</li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// Main Page
// ============================================================================

export function ScenarioRollups() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const scenarioId = id || '';

  const { data: scenario, isLoading: scenarioLoading } = useScenario(scenarioId);
  const { enabled: flagEnabled, isLoading: flagLoading } = useFeatureFlag('triple_constraint_rollups_v1');

  const [activeTab, setActiveTab] = useState<TabKey>('portfolio-areas');

  const portfolioQuery = usePortfolioAreaRollup(scenarioId);
  const orgNodeQuery = useOrgNodeRollup(scenarioId);
  const ownerQuery = useBusinessOwnerRollup(scenarioId);

  // Select active query based on tab
  const activeQuery =
    activeTab === 'portfolio-areas'
      ? portfolioQuery
      : activeTab === 'org-nodes'
        ? orgNodeQuery
        : ownerQuery;

  const data = activeQuery.data;

  // Feature flag guard
  if (!flagLoading && !flagEnabled) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <h2 className="text-lg font-semibold text-surface-900 mb-2">
            Feature Not Enabled
          </h2>
          <p className="text-sm text-surface-500">
            The Triple Constraint Rollups feature is not enabled. Contact an
            administrator to enable the{' '}
            <code className="font-mono text-xs bg-surface-100 px-1 py-0.5 rounded">
              triple_constraint_rollups_v1
            </code>{' '}
            feature flag.
          </p>
          <button
            onClick={() => navigate('/scenarios')}
            className="mt-4 btn-primary"
          >
            Back to Scenarios
          </button>
        </div>
      </div>
    );
  }

  const isLoading = scenarioLoading || activeQuery.isLoading;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="flex items-center gap-3 text-surface-500">
          <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24" fill="none">
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
          <span className="text-sm font-medium">Loading rollups...</span>
        </div>
      </div>
    );
  }

  const planningMode = data?.planningMode ?? scenario?.planningMode ?? 'LEGACY';

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="px-6 py-4 border-b bg-white">
        <div className="flex items-center gap-2 text-sm text-surface-500 mb-1">
          <Link to="/scenarios" className="hover:text-accent-600">
            Scenarios
          </Link>
          <span>/</span>
          <Link
            to={`/scenarios/${scenarioId}`}
            className="hover:text-accent-600"
          >
            {scenario?.name ?? 'Scenario'}
          </Link>
          <span>/</span>
          <span className="text-surface-700">Rollups</span>
        </div>
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold text-surface-900">
              Triple Constraint Rollups
            </h1>
            <p className="text-sm text-surface-500 mt-0.5">
              {scenario?.name}
              {data?.periodLabel ? ` -- ${data.periodLabel}` : ''}
              {planningMode === 'TOKEN' && (
                <span className="ml-2 inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-accent-50 text-accent-700">
                  Token Flow
                </span>
              )}
            </p>
          </div>
          <Link
            to={`/scenarios/${scenarioId}`}
            className="btn-secondary"
          >
            Back to Planner
          </Link>
        </div>
      </div>

      {/* Tabs */}
      <div className="px-6 pt-4 bg-white border-b">
        <div className="flex gap-1">
          {TABS.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`px-4 py-2 text-sm font-medium rounded-t-md border-b-2 transition-colors ${
                activeTab === tab.key
                  ? 'border-accent-500 text-accent-700 bg-accent-50/50'
                  : 'border-transparent text-surface-500 hover:text-surface-700 hover:border-surface-300'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
        {/* Warnings */}
        {data?.warnings && <WarningsBanner warnings={data.warnings} />}

        {/* Computed at timestamp */}
        {data?.computedAt && (
          <p className="text-xs text-surface-400">
            Computed at{' '}
            {new Date(data.computedAt).toLocaleString('en-US', {
              dateStyle: 'medium',
              timeStyle: 'short',
            })}
          </p>
        )}

        {/* Rollup table */}
        {data ? (
          <RollupTable
            groups={data.groups}
            unattributed={data.unattributed}
            totals={data.totals}
            planningMode={planningMode as 'LEGACY' | 'TOKEN'}
          />
        ) : (
          <div className="bg-white border rounded-lg p-8 text-center">
            <p className="text-sm text-surface-400">
              No rollup data returned. Ensure initiatives have allocations in
              this scenario.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
