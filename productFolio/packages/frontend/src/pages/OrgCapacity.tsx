import { useState, useMemo } from 'react';
import { useOrgTree } from '../hooks/useOrgTree';
import { useScenarios } from '../hooks/useScenarios';
import { useFeatureFlag } from '../hooks/useFeatureFlags';
import { useOrgCapacity } from '../hooks/useOrgCapacity';
import { TreeNodeItem } from '../components/OrgTreeSelector';
import type {
  GapAnalysisEntry,
  Shortage,
  Overallocation,
} from '../hooks/useOrgCapacity';

// ============================================================================
// Summary Card
// ============================================================================

function SummaryCard({
  label,
  value,
  color = 'text-surface-900',
}: {
  label: string;
  value: string | number;
  color?: string;
}) {
  return (
    <div className="bg-white rounded-lg border p-4">
      <p className={`text-2xl font-bold ${color}`}>{value}</p>
      <p className="text-sm text-surface-500">{label}</p>
    </div>
  );
}

// ============================================================================
// Gap Heatmap Table
// ============================================================================

function gapCellColor(utilizationPct: number): string {
  if (utilizationPct <= 0) return 'bg-surface-50 text-surface-400';
  if (utilizationPct <= 80) return 'bg-emerald-50 text-emerald-700';
  if (utilizationPct <= 100) return 'bg-amber-50 text-amber-700';
  return 'bg-red-50 text-red-700';
}

function GapHeatmap({
  gapAnalysis,
  periods,
}: {
  gapAnalysis: GapAnalysisEntry[];
  periods: Array<{ periodId: string; periodLabel: string }>;
}) {
  const skills = useMemo(() => {
    const set = new Set<string>();
    gapAnalysis.forEach((g) => set.add(g.skill));
    return Array.from(set).sort();
  }, [gapAnalysis]);

  const gapMap = useMemo(() => {
    const map = new Map<string, GapAnalysisEntry>();
    gapAnalysis.forEach((g) => map.set(`${g.skill}::${g.periodId}`, g));
    return map;
  }, [gapAnalysis]);

  if (skills.length === 0) {
    return (
      <p className="text-sm text-surface-400 py-4">
        No skill-level data available.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b">
            <th className="text-left py-2 pr-4 font-medium text-surface-700">
              Skill
            </th>
            {periods.map((p) => (
              <th
                key={p.periodId}
                className="text-center py-2 px-3 font-medium text-surface-700"
              >
                {p.periodLabel}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {skills.map((skill) => (
            <tr key={skill} className="border-b border-surface-100">
              <td className="py-2 pr-4 font-medium text-surface-800">
                {skill}
              </td>
              {periods.map((p) => {
                const entry = gapMap.get(`${skill}::${p.periodId}`);
                if (!entry) {
                  return (
                    <td
                      key={p.periodId}
                      className="text-center py-2 px-3 text-surface-300"
                    >
                      -
                    </td>
                  );
                }
                return (
                  <td key={p.periodId} className="text-center py-2 px-1">
                    <span
                      className={`inline-block px-2 py-1 rounded text-xs font-mono font-semibold ${gapCellColor(entry.utilizationPercentage)}`}
                      title={`Demand: ${Math.round(entry.demandHours)}h | Capacity: ${Math.round(entry.capacityHours)}h | Gap: ${Math.round(entry.gap)}h`}
                    >
                      {Math.round(entry.utilizationPercentage)}%
                    </span>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ============================================================================
// Shortage List
// ============================================================================

const severityColors: Record<string, string> = {
  low: 'bg-blue-50 text-blue-700',
  medium: 'bg-amber-50 text-amber-700',
  high: 'bg-orange-50 text-orange-700',
  critical: 'bg-red-50 text-red-700',
};

function ShortageList({ shortages }: { shortages: Shortage[] }) {
  const [expanded, setExpanded] = useState(true);

  if (shortages.length === 0) return null;

  return (
    <div>
      <button
        className="flex items-center gap-2 text-sm font-medium text-surface-700 mb-2"
        onClick={() => setExpanded(!expanded)}
      >
        <span>{expanded ? '▾' : '▸'}</span>
        Shortages ({shortages.length})
      </button>
      {expanded && (
        <div className="space-y-2">
          {shortages.map((s, i) => (
            <div
              key={`${s.skill}-${s.periodId}-${i}`}
              className="flex items-center gap-3 p-3 bg-surface-50 rounded text-sm"
            >
              <span
                className={`px-2 py-0.5 rounded text-xs font-medium ${severityColors[s.severity] ?? ''}`}
              >
                {s.severity.toUpperCase()}
              </span>
              <span className="font-medium text-surface-800">{s.skill}</span>
              <span className="text-surface-500">{s.periodLabel}</span>
              <span className="text-red-600 font-mono ml-auto">
                -{Math.round(s.shortageHours)}h
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Overallocation List
// ============================================================================

function OverallocationList({
  overallocations,
}: {
  overallocations: Overallocation[];
}) {
  const [expanded, setExpanded] = useState(true);

  if (overallocations.length === 0) return null;

  return (
    <div>
      <button
        className="flex items-center gap-2 text-sm font-medium text-surface-700 mb-2"
        onClick={() => setExpanded(!expanded)}
      >
        <span>{expanded ? '▾' : '▸'}</span>
        Overallocations ({overallocations.length})
      </button>
      {expanded && (
        <div className="space-y-2">
          {overallocations.map((o, i) => (
            <div
              key={`${o.employeeId}-${o.periodId}-${i}`}
              className="flex items-center gap-3 p-3 bg-surface-50 rounded text-sm"
            >
              <span className="px-2 py-0.5 rounded text-xs font-medium bg-red-50 text-red-700">
                {Math.round(o.totalAllocationPercentage)}%
              </span>
              <span className="font-medium text-surface-800">
                {o.employeeName}
              </span>
              <span className="text-surface-500">{o.periodLabel}</span>
              <span className="text-red-600 font-mono ml-auto">
                +{Math.round(o.overallocationPercentage)}% over
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Capacity Detail Panel
// ============================================================================

function CapacityPanel({
  nodeId,
  scenarioId,
}: {
  nodeId: string;
  scenarioId: string;
}) {
  const { data, isLoading, error } = useOrgCapacity(nodeId, scenarioId);

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
          <span className="text-sm font-medium">Calculating capacity...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6 text-center text-red-600 text-sm">
        Failed to load capacity data: {error instanceof Error ? error.message : 'Unknown error'}
      </div>
    );
  }

  if (!data) {
    return (
      <div className="flex items-center justify-center h-64 text-sm text-surface-400">
        No capacity data for this node.
      </div>
    );
  }

  const { summary, gapAnalysis, periods, issues } = data;

  const gapColor =
    summary.overallGap >= 0 ? 'text-emerald-600' : 'text-red-600';
  const utilColor =
    summary.overallUtilization <= 80
      ? 'text-emerald-600'
      : summary.overallUtilization <= 100
        ? 'text-amber-600'
        : 'text-red-600';

  return (
    <div className="p-6 space-y-6 overflow-y-auto">
      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        <SummaryCard
          label="Total Demand"
          value={`${Math.round(summary.totalDemandHours)}h`}
        />
        <SummaryCard
          label="Total Capacity"
          value={`${Math.round(summary.totalCapacityHours)}h`}
        />
        <SummaryCard
          label="Gap"
          value={`${Math.round(summary.overallGap)}h`}
          color={gapColor}
        />
        <SummaryCard
          label="Utilization"
          value={`${Math.round(summary.overallUtilization)}%`}
          color={utilColor}
        />
        <SummaryCard
          label="Shortages"
          value={summary.totalShortages}
          color={summary.totalShortages > 0 ? 'text-red-600' : 'text-surface-900'}
        />
        <SummaryCard
          label="Overallocations"
          value={summary.totalOverallocations}
          color={
            summary.totalOverallocations > 0 ? 'text-red-600' : 'text-surface-900'
          }
        />
      </div>

      {/* Stats row */}
      <div className="flex items-center gap-6 text-xs text-surface-500">
        <span>{summary.employeeCount} employees</span>
        <span>{summary.initiativeCount} initiatives</span>
        <span>{summary.skillCount} skills</span>
        <span>{summary.periodCount} periods</span>
        {summary.rampCostHours > 0 && (
          <span className="text-amber-600">
            Ramp cost: {Math.round(summary.rampCostHours)}h
          </span>
        )}
      </div>

      {/* Gap Analysis Heatmap */}
      <div>
        <h3 className="text-sm font-medium text-surface-700 mb-3">
          Capacity vs Demand by Skill
        </h3>
        <GapHeatmap gapAnalysis={gapAnalysis} periods={periods} />
      </div>

      {/* Issues */}
      {(issues.shortages.length > 0 || issues.overallocations.length > 0) && (
        <div className="space-y-4">
          <h3 className="text-sm font-medium text-surface-700">Issues</h3>
          <ShortageList shortages={issues.shortages} />
          <OverallocationList overallocations={issues.overallocations} />
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Main Page
// ============================================================================

export function OrgCapacity() {
  const { enabled: featureEnabled, isLoading: flagLoading } =
    useFeatureFlag('org_capacity_view');
  const { data: tree, isLoading: treeLoading } = useOrgTree();
  const { data: scenariosData } = useScenarios();
  const scenarios = scenariosData?.data ?? [];

  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [selectedScenarioId, setSelectedScenarioId] = useState<string>('');

  // Auto-select first scenario if none selected
  if (!selectedScenarioId && scenarios.length > 0) {
    setSelectedScenarioId(scenarios[0].id);
  }

  // Feature flag guard
  if (!flagLoading && !featureEnabled) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <h2 className="text-lg font-semibold text-surface-900 mb-2">
            Feature Not Enabled
          </h2>
          <p className="text-sm text-surface-500">
            The Org Capacity view is not enabled. Contact an administrator to
            enable the <code className="font-mono text-xs bg-surface-100 px-1 py-0.5 rounded">org_capacity_view</code> feature flag.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="px-6 py-4 border-b bg-white">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold text-surface-900">
              Org Capacity
            </h1>
            <p className="text-sm text-surface-500 mt-1">
              View capacity and demand analysis scoped to organizational units
            </p>
          </div>
          <div className="flex items-center gap-3">
            <label
              htmlFor="scenario-select"
              className="text-sm font-medium text-surface-700"
            >
              Scenario
            </label>
            <select
              id="scenario-select"
              className="border rounded px-3 py-2 text-sm min-w-[200px]"
              value={selectedScenarioId}
              onChange={(e) => setSelectedScenarioId(e.target.value)}
            >
              <option value="">Select scenario...</option>
              {scenarios.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} ({s.periodLabel})
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Main content: tree + detail */}
      <div className="flex-1 flex min-h-0 px-6 py-4 gap-4">
        {/* Tree panel */}
        <div className="w-1/3 bg-white rounded-lg border overflow-y-auto">
          {treeLoading ? (
            <div className="p-4 text-sm text-surface-400">Loading tree...</div>
          ) : !tree || tree.length === 0 ? (
            <div className="p-4 text-sm text-surface-400">
              No org structure available.
            </div>
          ) : (
            <div className="py-2">
              {tree.map((root) => (
                <TreeNodeItem
                  key={root.id}
                  node={root}
                  selectedId={selectedNodeId}
                  onSelect={setSelectedNodeId}
                />
              ))}
            </div>
          )}
        </div>

        {/* Detail panel */}
        <div className="flex-1 bg-white rounded-lg border overflow-hidden">
          {!selectedNodeId ? (
            <div className="flex items-center justify-center h-full text-sm text-surface-400">
              Select an org node from the tree
            </div>
          ) : !selectedScenarioId ? (
            <div className="flex items-center justify-center h-full text-sm text-surface-400">
              Select a scenario to view capacity
            </div>
          ) : (
            <CapacityPanel
              nodeId={selectedNodeId}
              scenarioId={selectedScenarioId}
            />
          )}
        </div>
      </div>
    </div>
  );
}
