import { useState, useMemo } from 'react';
import { useFeatureFlag } from '../hooks/useFeatureFlags';
import { useScenarios } from '../hooks/useScenarios';
import { useInitiatives } from '../hooks';
import {
  useRunScopeBasedForecast,
  useRunEmpiricalForecast,
  useDataQuality,
  useForecastRuns,
} from '../hooks/useForecast';
import type {
  ScopeBasedForecastResult,
  EmpiricalForecastResult,
  DataQualityResult,
  ForecastRun,
  PercentileResult,
} from '../hooks/useForecast';

// ============================================================================
// Warnings List
// ============================================================================

function WarningsList({ warnings }: { warnings: string[] }) {
  if (warnings.length === 0) return null;

  return (
    <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
      <h4 className="text-sm font-medium text-amber-800 mb-2">
        Warnings ({warnings.length})
      </h4>
      <ul className="space-y-1">
        {warnings.map((w, i) => (
          <li key={i} className="text-sm text-amber-700 flex items-start gap-2">
            <span className="mt-0.5 shrink-0">!</span>
            <span>{w}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ============================================================================
// Data Quality Panel
// ============================================================================

const confidenceColors: Record<string, string> = {
  low: 'bg-red-100 text-red-700',
  moderate: 'bg-amber-100 text-amber-700',
  good: 'bg-emerald-100 text-emerald-700',
};

function DataQualityPanel({ data }: { data: DataQualityResult }) {
  return (
    <div className="bg-white border rounded-lg p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-medium text-surface-700">Data Quality</h4>
        <div className="flex items-center gap-2">
          <span className="text-lg font-bold text-surface-900">
            {data.score}/100
          </span>
          <span
            className={`px-2 py-0.5 rounded text-xs font-medium ${confidenceColors[data.confidence] ?? ''}`}
          >
            {data.confidence}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 text-sm">
        <div>
          <span className="text-surface-500">Estimate coverage</span>
          <span className="ml-2 font-mono text-surface-800">
            {Math.round(data.details.estimateCoverage * 100)}%
          </span>
          <span className="text-surface-400 ml-1">
            ({data.details.scopeItemsWithEstimates}/{data.details.totalScopeItems})
          </span>
        </div>
        <div>
          <span className="text-surface-500">Distribution coverage</span>
          <span className="ml-2 font-mono text-surface-800">
            {Math.round(data.details.distributionCoverage * 100)}%
          </span>
          <span className="text-surface-400 ml-1">
            ({data.details.scopeItemsWithDistributions}/{data.details.totalScopeItems})
          </span>
        </div>
        <div>
          <span className="text-surface-500">Historical completions</span>
          <span className="ml-2 font-mono text-surface-800">
            {data.details.historicalCompletions}
          </span>
        </div>
        <div>
          <span className="text-surface-500">Mode B viable</span>
          <span
            className={`ml-2 font-medium ${data.details.modeBViable ? 'text-emerald-600' : 'text-red-600'}`}
          >
            {data.details.modeBViable ? 'Yes' : 'No'}
          </span>
        </div>
      </div>

      {data.issues.length > 0 && (
        <div className="border-t pt-3">
          <ul className="space-y-1">
            {data.issues.map((issue, i) => (
              <li key={i} className="text-xs text-amber-600 flex items-start gap-1">
                <span className="mt-0.5 shrink-0">!</span>
                <span>{issue}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Percentile Badge
// ============================================================================

function PercentileBadge({ p }: { p: PercentileResult }) {
  return (
    <div className="bg-surface-50 rounded px-3 py-2 text-center">
      <p className="text-xs text-surface-500">P{p.level}</p>
      <p className="text-lg font-bold text-surface-900 font-mono">
        {Math.round(p.value * 10) / 10}
      </p>
    </div>
  );
}

// ============================================================================
// Scope-Based Results (Mode A)
// ============================================================================

function ScopeBasedResults({ result }: { result: ScopeBasedForecastResult }) {
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4 text-xs text-surface-500">
        <span>{result.simulationCount.toLocaleString()} simulations</span>
        <span>{result.durationMs}ms</span>
      </div>

      {result.warnings.length > 0 && (
        <WarningsList warnings={result.warnings} />
      )}

      {result.initiativeForecasts.map((forecast) => (
        <div
          key={forecast.initiativeId}
          className="bg-white border rounded-lg p-4 space-y-4"
        >
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-medium text-surface-800">
              {forecast.initiativeTitle}
            </h4>
            <span className="text-xs text-surface-400">
              {forecast.scopeItemCount} scope items
              {!forecast.hasEstimates && (
                <span className="ml-2 text-amber-500">Missing estimates</span>
              )}
            </span>
          </div>

          {/* Percentile cards */}
          <div className="grid grid-cols-4 gap-3">
            {forecast.percentiles.map((p) => (
              <PercentileBadge key={p.level} p={p} />
            ))}
          </div>

          {/* Completion CDF table */}
          {forecast.completionCdf.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-2 pr-4 font-medium text-surface-700">
                      Period
                    </th>
                    <th className="text-right py-2 px-4 font-medium text-surface-700">
                      Probability
                    </th>
                    <th className="text-left py-2 px-4 font-medium text-surface-700 w-1/2">
                      Distribution
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {forecast.completionCdf.map((entry) => {
                    const pct = Math.round(entry.cumulativeProbability * 100);
                    return (
                      <tr
                        key={entry.periodId}
                        className="border-b border-surface-100"
                      >
                        <td className="py-2 pr-4 text-surface-800">
                          {entry.periodLabel}
                        </td>
                        <td className="py-2 px-4 text-right font-mono text-surface-800">
                          {pct}%
                        </td>
                        <td className="py-2 px-4">
                          <div className="w-full bg-surface-100 rounded-full h-2">
                            <div
                              className={`h-2 rounded-full ${
                                pct >= 85
                                  ? 'bg-emerald-500'
                                  : pct >= 50
                                    ? 'bg-amber-500'
                                    : 'bg-surface-300'
                              }`}
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

// ============================================================================
// Empirical Results (Mode B)
// ============================================================================

function EmpiricalResults({ result }: { result: EmpiricalForecastResult }) {
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4 text-xs text-surface-500">
        <span>{result.simulationCount.toLocaleString()} simulations</span>
        <span>{result.historicalDataPoints} historical data points</span>
        <span>{result.durationMs}ms</span>
        {result.lowConfidence && (
          <span className="text-red-500 font-medium">Low confidence</span>
        )}
      </div>

      {result.warnings.length > 0 && (
        <WarningsList warnings={result.warnings} />
      )}

      {result.initiativeForecasts.map((forecast) => (
        <div
          key={forecast.initiativeId}
          className="bg-white border rounded-lg p-4 space-y-4"
        >
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-medium text-surface-800">
              {forecast.initiativeTitle}
            </h4>
            <div className="flex items-center gap-3 text-xs text-surface-400">
              <span>Status: {forecast.currentStatus}</span>
              <span>Elapsed: {forecast.elapsedDays} days</span>
            </div>
          </div>

          {/* Forecasted total days */}
          <div>
            <p className="text-xs text-surface-500 mb-2">
              Total cycle time (days)
            </p>
            <div className="grid grid-cols-4 gap-3">
              {forecast.percentiles.map((p) => (
                <PercentileBadge key={p.level} p={p} />
              ))}
            </div>
          </div>

          {/* Estimated remaining days */}
          <div>
            <p className="text-xs text-surface-500 mb-2">
              Estimated remaining (days)
            </p>
            <div className="grid grid-cols-4 gap-3">
              {forecast.estimatedCompletionDays.map((p) => (
                <PercentileBadge key={p.level} p={p} />
              ))}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

// ============================================================================
// Initiative Selector
// ============================================================================

function InitiativeSelector({
  selectedIds,
  onChange,
  scenarioId,
}: {
  selectedIds: string[];
  onChange: (ids: string[]) => void;
  scenarioId?: string;
}) {
  const { data } = useInitiatives({
    page: 1,
    limit: 200,
  });
  const initiatives = data?.data ?? [];

  const toggleInitiative = (id: string) => {
    if (selectedIds.includes(id)) {
      onChange(selectedIds.filter((i) => i !== id));
    } else {
      onChange([...selectedIds, id]);
    }
  };

  const selectAll = () => {
    onChange(initiatives.map((i) => i.id));
  };

  const clearAll = () => {
    onChange([]);
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <label className="text-sm font-medium text-surface-700">
          Initiatives ({selectedIds.length} selected)
        </label>
        <div className="flex gap-2">
          <button
            type="button"
            className="text-xs font-medium text-accent-600 hover:text-accent-700"
            onClick={selectAll}
          >
            Select all
          </button>
          <button
            type="button"
            className="text-xs text-surface-500 hover:text-surface-700"
            onClick={clearAll}
          >
            Clear
          </button>
        </div>
      </div>
      <div className="border rounded max-h-48 overflow-y-auto">
        {initiatives.length === 0 ? (
          <p className="p-3 text-sm text-surface-400">No initiatives found</p>
        ) : (
          initiatives.map((init) => (
            <label
              key={init.id}
              className="flex items-center gap-2 px-3 py-2 hover:bg-surface-50 cursor-pointer text-sm"
            >
              <input
                type="checkbox"
                checked={selectedIds.includes(init.id)}
                onChange={() => toggleInitiative(init.id)}
                className="rounded border-surface-300"
              />
              <span className="text-surface-800 truncate">{init.title}</span>
              <span className="text-xs text-surface-400 ml-auto shrink-0">
                {init.status}
              </span>
            </label>
          ))
        )}
      </div>
    </div>
  );
}

// ============================================================================
// Simulation Controls
// ============================================================================

function SimulationControls({
  simulationCount,
  onSimulationCountChange,
  confidenceLevels,
  onConfidenceLevelsChange,
}: {
  simulationCount: number;
  onSimulationCountChange: (n: number) => void;
  confidenceLevels: number[];
  onConfidenceLevelsChange: (levels: number[]) => void;
}) {
  const allLevels = [50, 75, 85, 95];

  const toggleLevel = (level: number) => {
    if (confidenceLevels.includes(level)) {
      onConfidenceLevelsChange(confidenceLevels.filter((l) => l !== level));
    } else {
      onConfidenceLevelsChange([...confidenceLevels, level].sort((a, b) => a - b));
    }
  };

  return (
    <div className="flex items-center gap-6">
      <div className="flex items-center gap-2">
        <label className="text-sm text-surface-600">Simulations</label>
        <input
          type="number"
          min={100}
          max={10000}
          step={100}
          value={simulationCount}
          onChange={(e) => onSimulationCountChange(Number(e.target.value))}
          className="w-24 border rounded px-2 py-1 text-sm font-mono"
        />
      </div>
      <div className="flex items-center gap-2">
        <span className="text-sm text-surface-600">Percentiles</span>
        {allLevels.map((level) => (
          <label
            key={level}
            className="flex items-center gap-1 text-sm cursor-pointer"
          >
            <input
              type="checkbox"
              checked={confidenceLevels.includes(level)}
              onChange={() => toggleLevel(level)}
              className="rounded border-surface-300"
            />
            <span className="text-surface-700">P{level}</span>
          </label>
        ))}
      </div>
    </div>
  );
}

// ============================================================================
// Mode A Tab
// ============================================================================

function ModeATab() {
  const { data: scenariosData } = useScenarios();
  const scenarios = scenariosData?.data ?? [];

  const [scenarioId, setScenarioId] = useState('');
  const [selectedInitiativeIds, setSelectedInitiativeIds] = useState<string[]>([]);
  const [simulationCount, setSimulationCount] = useState(1000);
  const [confidenceLevels, setConfidenceLevels] = useState([50, 75, 85, 95]);

  const runForecast = useRunScopeBasedForecast();
  const { data: dataQuality } = useDataQuality(
    scenarioId || undefined,
    selectedInitiativeIds.length > 0 ? selectedInitiativeIds : undefined,
  );

  const canRun =
    scenarioId && selectedInitiativeIds.length > 0 && confidenceLevels.length > 0;

  const handleRun = () => {
    if (!canRun) return;
    runForecast.mutate({
      scenarioId,
      initiativeIds: selectedInitiativeIds,
      simulationCount,
      confidenceLevels,
    });
  };

  return (
    <div className="space-y-6">
      {/* Controls */}
      <div className="bg-white border rounded-lg p-4 space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-surface-700 mb-1">
              Scenario
            </label>
            <select
              className="w-full border rounded px-3 py-2 text-sm"
              value={scenarioId}
              onChange={(e) => setScenarioId(e.target.value)}
            >
              <option value="">Select scenario...</option>
              {scenarios.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} ({s.periodLabel})
                </option>
              ))}
            </select>
          </div>
          <div>
            <InitiativeSelector
              selectedIds={selectedInitiativeIds}
              onChange={setSelectedInitiativeIds}
              scenarioId={scenarioId || undefined}
            />
          </div>
        </div>

        <SimulationControls
          simulationCount={simulationCount}
          onSimulationCountChange={setSimulationCount}
          confidenceLevels={confidenceLevels}
          onConfidenceLevelsChange={setConfidenceLevels}
        />

        <div className="flex items-center gap-3">
          <button
            className="btn-primary"
            disabled={!canRun || runForecast.isPending}
            onClick={handleRun}
          >
            {runForecast.isPending ? 'Running...' : 'Run Scope-Based Forecast'}
          </button>
          {runForecast.isPending && (
            <span className="text-xs text-surface-500">
              This may take a few seconds...
            </span>
          )}
        </div>
      </div>

      {/* Data Quality */}
      {dataQuality && <DataQualityPanel data={dataQuality} />}

      {/* Results */}
      {runForecast.data && <ScopeBasedResults result={runForecast.data} />}
    </div>
  );
}

// ============================================================================
// Mode B Tab
// ============================================================================

function ModeBTab() {
  const [selectedInitiativeIds, setSelectedInitiativeIds] = useState<string[]>([]);
  const [simulationCount, setSimulationCount] = useState(1000);
  const [confidenceLevels, setConfidenceLevels] = useState([50, 75, 85, 95]);

  const runForecast = useRunEmpiricalForecast();

  const canRun = selectedInitiativeIds.length > 0 && confidenceLevels.length > 0;

  const handleRun = () => {
    if (!canRun) return;
    runForecast.mutate({
      initiativeIds: selectedInitiativeIds,
      simulationCount,
      confidenceLevels,
    });
  };

  return (
    <div className="space-y-6">
      {/* Controls */}
      <div className="bg-white border rounded-lg p-4 space-y-4">
        <InitiativeSelector
          selectedIds={selectedInitiativeIds}
          onChange={setSelectedInitiativeIds}
        />

        <SimulationControls
          simulationCount={simulationCount}
          onSimulationCountChange={setSimulationCount}
          confidenceLevels={confidenceLevels}
          onConfidenceLevelsChange={setConfidenceLevels}
        />

        <div className="flex items-center gap-3">
          <button
            className="btn-primary"
            disabled={!canRun || runForecast.isPending}
            onClick={handleRun}
          >
            {runForecast.isPending ? 'Running...' : 'Run Empirical Forecast'}
          </button>
          {runForecast.isPending && (
            <span className="text-xs text-surface-500">
              This may take a few seconds...
            </span>
          )}
        </div>
      </div>

      {/* Results */}
      {runForecast.data && <EmpiricalResults result={runForecast.data} />}
    </div>
  );
}

// ============================================================================
// Past Runs Table
// ============================================================================

function PastRunsTable() {
  const [modeFilter, setModeFilter] = useState<
    'SCOPE_BASED' | 'EMPIRICAL' | ''
  >('');
  const [page, setPage] = useState(1);

  const { data, isLoading } = useForecastRuns({
    page,
    limit: 10,
    mode: modeFilter || undefined,
  });

  const runs = data?.data ?? [];
  const totalPages = data?.totalPages ?? 1;

  return (
    <div className="bg-white border rounded-lg p-4">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-medium text-surface-700">
          Past Forecast Runs
        </h3>
        <select
          className="border rounded px-2 py-1 text-sm"
          value={modeFilter}
          onChange={(e) => {
            setModeFilter(e.target.value as typeof modeFilter);
            setPage(1);
          }}
        >
          <option value="">All modes</option>
          <option value="SCOPE_BASED">Scope-Based</option>
          <option value="EMPIRICAL">Empirical</option>
        </select>
      </div>

      {isLoading ? (
        <p className="text-sm text-surface-400 py-4">Loading runs...</p>
      ) : runs.length === 0 ? (
        <p className="text-sm text-surface-400 py-4">No forecast runs yet.</p>
      ) : (
        <>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b">
                <th className="text-left py-2 pr-4 font-medium text-surface-700">
                  Mode
                </th>
                <th className="text-left py-2 px-4 font-medium text-surface-700">
                  Simulations
                </th>
                <th className="text-left py-2 px-4 font-medium text-surface-700">
                  Duration
                </th>
                <th className="text-left py-2 px-4 font-medium text-surface-700">
                  Warnings
                </th>
                <th className="text-left py-2 pl-4 font-medium text-surface-700">
                  Date
                </th>
              </tr>
            </thead>
            <tbody>
              {runs.map((run: ForecastRun) => (
                <tr key={run.id} className="border-b border-surface-100">
                  <td className="py-2 pr-4">
                    <span
                      className={`px-2 py-0.5 rounded text-xs font-medium ${
                        run.mode === 'SCOPE_BASED'
                          ? 'bg-blue-50 text-blue-700'
                          : 'bg-purple-50 text-purple-700'
                      }`}
                    >
                      {run.mode === 'SCOPE_BASED' ? 'Scope' : 'Empirical'}
                    </span>
                  </td>
                  <td className="py-2 px-4 font-mono text-surface-800">
                    {run.simulationCount.toLocaleString()}
                  </td>
                  <td className="py-2 px-4 text-surface-600">
                    {run.durationMs != null ? `${run.durationMs}ms` : '-'}
                  </td>
                  <td className="py-2 px-4 text-surface-600">
                    {run.warnings && run.warnings.length > 0 ? (
                      <span className="text-amber-600">
                        {run.warnings.length}
                      </span>
                    ) : (
                      <span className="text-surface-400">0</span>
                    )}
                  </td>
                  <td className="py-2 pl-4 text-surface-600">
                    {new Date(run.computedAt).toLocaleDateString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between mt-4">
              <span className="text-xs text-surface-500">
                Page {page} of {totalPages}
              </span>
              <div className="flex gap-2">
                <button
                  className="px-3 py-1 text-xs border rounded hover:bg-surface-50 disabled:opacity-50"
                  disabled={page <= 1}
                  onClick={() => setPage(page - 1)}
                >
                  Previous
                </button>
                <button
                  className="px-3 py-1 text-xs border rounded hover:bg-surface-50 disabled:opacity-50"
                  disabled={page >= totalPages}
                  onClick={() => setPage(page + 1)}
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ============================================================================
// Main Page
// ============================================================================

type ForecastTab = 'scope-based' | 'empirical';

export function FlowForecast() {
  const { enabled: featureEnabled, isLoading: flagLoading } =
    useFeatureFlag('flow_forecast_v1');
  const { enabled: modeBEnabled } = useFeatureFlag('forecast_mode_b');

  const [activeTab, setActiveTab] = useState<ForecastTab>('scope-based');

  // Feature flag guard
  if (!flagLoading && !featureEnabled) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <h2 className="text-lg font-semibold text-surface-900 mb-2">
            Feature Not Enabled
          </h2>
          <p className="text-sm text-surface-500">
            The Flow Forecast feature is not enabled. Contact an administrator
            to enable the{' '}
            <code className="font-mono text-xs bg-surface-100 px-1 py-0.5 rounded">
              flow_forecast_v1
            </code>{' '}
            feature flag.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="px-6 py-4 border-b bg-white">
        <h1 className="text-xl font-semibold text-surface-900">
          Flow Forecast
        </h1>
        <p className="text-sm text-surface-500 mt-1">
          Monte Carlo simulation for initiative delivery forecasting
        </p>
      </div>

      {/* Tabs */}
      <div className="px-6 pt-4">
        <div className="flex border-b">
          <button
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px ${
              activeTab === 'scope-based'
                ? 'border-accent-500 text-accent-600'
                : 'border-transparent text-surface-500 hover:text-surface-700'
            }`}
            onClick={() => setActiveTab('scope-based')}
          >
            Scope-Based (Mode A)
          </button>
          {modeBEnabled && (
            <button
              className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px ${
                activeTab === 'empirical'
                  ? 'border-accent-500 text-accent-600'
                  : 'border-transparent text-surface-500 hover:text-surface-700'
              }`}
              onClick={() => setActiveTab('empirical')}
            >
              Empirical (Mode B)
            </button>
          )}
        </div>
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-y-auto px-6 py-4 space-y-6">
        {activeTab === 'scope-based' && <ModeATab />}
        {activeTab === 'empirical' && modeBEnabled && <ModeBTab />}

        {/* Past runs */}
        <PastRunsTable />
      </div>
    </div>
  );
}
