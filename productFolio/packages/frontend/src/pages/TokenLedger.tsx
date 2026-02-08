import { useMemo } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useScenario } from '../hooks/useScenarios';
import { useTokenLedger, useDeriveTokenDemand } from '../hooks/useTokenLedger';
import { useFeatureFlag } from '../hooks/useFeatureFlags';
import type { TokenLedgerRow } from '../hooks/useTokenLedger';

// ============================================================================
// Delta Cell
// ============================================================================

function DeltaCell({ value }: { value: number }) {
  const isPositive = value >= 0;
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-mono font-medium ${
        isPositive
          ? 'bg-emerald-50 text-emerald-700'
          : 'bg-red-50 text-red-700'
      }`}
    >
      {isPositive ? '+' : ''}
      {value.toLocaleString()}
    </span>
  );
}

// ============================================================================
// Ledger Table
// ============================================================================

function LedgerTable({ rows }: { rows: TokenLedgerRow[] }) {
  const sorted = useMemo(
    () => [...rows].sort((a, b) => a.poolName.localeCompare(b.poolName)),
    [rows],
  );

  if (sorted.length === 0) {
    return (
      <div className="bg-white border rounded-lg p-8 text-center">
        <p className="text-sm text-surface-400">
          No token data available. Use "Derive Demand" to populate from scope items.
        </p>
      </div>
    );
  }

  return (
    <div className="bg-white border rounded-lg overflow-hidden">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b bg-surface-50">
            <th className="text-left py-3 px-4 font-medium text-surface-700">
              Skill Pool
            </th>
            <th className="text-right py-3 px-4 font-medium text-surface-700">
              Supply
            </th>
            <th className="text-right py-3 px-4 font-medium text-surface-700">
              Demand (P50)
            </th>
            <th className="text-right py-3 px-4 font-medium text-surface-700">
              Demand (P90)
            </th>
            <th className="text-right py-3 px-4 font-medium text-surface-700">
              Delta (P50)
            </th>
            <th className="text-right py-3 px-4 font-medium text-surface-700">
              Delta (P90)
            </th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((row) => (
            <tr key={row.poolId} className="border-b border-surface-100 hover:bg-surface-50">
              <td className="py-3 px-4 text-surface-900 font-medium">
                {row.poolName}
              </td>
              <td className="py-3 px-4 text-right font-mono text-surface-800">
                {row.supply.toLocaleString()}
              </td>
              <td className="py-3 px-4 text-right font-mono text-surface-800">
                {row.demandP50.toLocaleString()}
              </td>
              <td className="py-3 px-4 text-right font-mono text-surface-800">
                {row.demandP90.toLocaleString()}
              </td>
              <td className="py-3 px-4 text-right">
                <DeltaCell value={row.deltaP50} />
              </td>
              <td className="py-3 px-4 text-right">
                <DeltaCell value={row.deltaP90} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ============================================================================
// Binding Constraints
// ============================================================================

function BindingConstraints({ constraints }: { constraints: TokenLedgerRow[] }) {
  if (constraints.length === 0) {
    return (
      <div className="bg-white border rounded-lg p-4">
        <h3 className="text-sm font-medium text-surface-700 mb-2">
          Binding Constraints
        </h3>
        <p className="text-sm text-surface-400">
          No binding constraints -- all pools have sufficient supply.
        </p>
      </div>
    );
  }

  const sorted = [...constraints].sort((a, b) => a.deltaP50 - b.deltaP50);
  const maxDeficit = Math.abs(sorted[0]?.deltaP50 ?? 1);

  return (
    <div className="bg-white border rounded-lg p-4">
      <h3 className="text-sm font-medium text-surface-700 mb-3">
        Binding Constraints ({constraints.length} pool{constraints.length !== 1 ? 's' : ''} over budget)
      </h3>
      <div className="space-y-3">
        {sorted.map((row) => {
          const deficit = Math.abs(row.deltaP50);
          const pct = maxDeficit > 0 ? (deficit / maxDeficit) * 100 : 0;

          return (
            <div key={row.poolId} className="space-y-1">
              <div className="flex items-center justify-between text-sm">
                <span className="font-medium text-surface-800">{row.poolName}</span>
                <span className="font-mono text-red-600">
                  {row.deltaP50.toLocaleString()} tokens
                </span>
              </div>
              <div className="w-full bg-surface-100 rounded-full h-2">
                <div
                  className="h-2 rounded-full bg-red-400"
                  style={{ width: `${pct}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ============================================================================
// Main Page
// ============================================================================

export function TokenLedger() {
  const { id } = useParams<{ id: string }>();
  const scenarioId = id || '';

  const { data: scenario, isLoading: scenarioLoading } = useScenario(scenarioId);
  const { data: ledger, isLoading: ledgerLoading } = useTokenLedger(scenarioId);
  const deriveDemand = useDeriveTokenDemand();
  const { enabled: tokenFlowEnabled, isLoading: flagLoading } = useFeatureFlag('token_planning_v1');

  // Feature flag guard
  if (!flagLoading && !tokenFlowEnabled) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <h2 className="text-lg font-semibold text-surface-900 mb-2">
            Feature Not Enabled
          </h2>
          <p className="text-sm text-surface-500">
            The Token Flow feature is not enabled. Contact an administrator to
            enable the{' '}
            <code className="font-mono text-xs bg-surface-100 px-1 py-0.5 rounded">
              token_planning_v1
            </code>{' '}
            feature flag.
          </p>
        </div>
      </div>
    );
  }

  // Mode guard
  if (!scenarioLoading && scenario && scenario.planningMode !== 'TOKEN') {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <h2 className="text-lg font-semibold text-surface-900 mb-2">
            Legacy Planning Mode
          </h2>
          <p className="text-sm text-surface-500 mb-4">
            This scenario uses Legacy planning mode. Switch to Token Flow mode in
            the scenario settings to access the Token Ledger.
          </p>
          <Link to={`/scenarios/${scenarioId}`} className="btn-primary">
            Go to Scenario
          </Link>
        </div>
      </div>
    );
  }

  const isLoading = scenarioLoading || ledgerLoading;

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
          <span className="text-sm font-medium">Loading token ledger...</span>
        </div>
      </div>
    );
  }

  const rows = ledger?.rows ?? [];
  const constraints = ledger?.bindingConstraints ?? [];
  const totalSupply = ledger?.totalSupply ?? 0;
  const totalDemandP50 = ledger?.totalDemandP50 ?? 0;
  const totalDemandP90 = ledger?.totalDemandP90 ?? 0;
  const netPosition = totalSupply - totalDemandP50;

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="px-6 py-4 border-b bg-white">
        <div className="flex items-center gap-2 text-sm text-surface-500 mb-1">
          <Link to="/scenarios" className="hover:text-accent-600">
            Scenarios
          </Link>
          <span>/</span>
          <Link to={`/scenarios/${scenarioId}`} className="hover:text-accent-600">
            {scenario?.name ?? 'Scenario'}
          </Link>
          <span>/</span>
          <span className="text-surface-700">Token Ledger</span>
        </div>
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold text-surface-900">
              Token Ledger
            </h1>
            <p className="text-sm text-surface-500 mt-0.5">
              {scenario?.name}
              {scenario?.periodLabel ? ` -- ${scenario.periodLabel}` : ''}
            </p>
          </div>
          <button
            onClick={() => deriveDemand.mutate(scenarioId)}
            disabled={deriveDemand.isPending}
            className="btn-primary"
          >
            {deriveDemand.isPending ? 'Deriving...' : 'Derive Demand'}
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-6 py-4 space-y-6">
        {/* Summary cards */}
        <div className="grid grid-cols-4 gap-4">
          <div className="bg-white border rounded-lg p-4">
            <p className="text-xs text-surface-500 mb-1">Total Supply</p>
            <p className="text-lg font-bold font-mono text-surface-900">
              {totalSupply.toLocaleString()}
            </p>
          </div>
          <div className="bg-white border rounded-lg p-4">
            <p className="text-xs text-surface-500 mb-1">Total Demand (P50)</p>
            <p className="text-lg font-bold font-mono text-surface-900">
              {totalDemandP50.toLocaleString()}
            </p>
          </div>
          <div className="bg-white border rounded-lg p-4">
            <p className="text-xs text-surface-500 mb-1">Total Demand (P90)</p>
            <p className="text-lg font-bold font-mono text-surface-900">
              {totalDemandP90.toLocaleString()}
            </p>
          </div>
          <div className="bg-white border rounded-lg p-4">
            <p className="text-xs text-surface-500 mb-1">Net Position (P50)</p>
            <p
              className={`text-lg font-bold font-mono ${
                netPosition >= 0 ? 'text-emerald-600' : 'text-red-600'
              }`}
            >
              {netPosition >= 0 ? '+' : ''}
              {netPosition.toLocaleString()}
            </p>
          </div>
        </div>

        {/* Ledger table */}
        <LedgerTable rows={rows} />

        {/* Binding constraints */}
        <BindingConstraints constraints={constraints} />
      </div>
    </div>
  );
}
