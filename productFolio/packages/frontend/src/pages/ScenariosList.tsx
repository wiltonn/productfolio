import { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useScenarios, useCreateScenario, useCloneScenario, useSetPrimary } from '../hooks/useScenarios';
import type { Scenario } from '../hooks/useScenarios';
import { useAdjacentQuarters, useQuarterPeriods } from '../hooks/usePeriods';
import type { Period } from '../hooks/usePeriods';
import { useOrgTree } from '../hooks/useOrgTree';
import { Modal } from '../components/ui';
import type { ScenarioStatus, OrgNode } from '../types';

// Flatten org tree into a list for the filter dropdown
function flattenOrgTree(nodes: OrgNode[], depth = 0): Array<{ id: string; name: string; depth: number }> {
  const result: Array<{ id: string; name: string; depth: number }> = [];
  for (const node of nodes) {
    result.push({ id: node.id, name: node.name, depth });
    if (node.children?.length) {
      result.push(...flattenOrgTree(node.children, depth + 1));
    }
  }
  return result;
}

// Helper to get current quarter
function getCurrentQuarter(): string {
  const now = new Date();
  const quarter = Math.ceil((now.getMonth() + 1) / 3);
  return `${now.getFullYear()}-Q${quarter}`;
}

// Status badge colors
const STATUS_COLORS: Record<ScenarioStatus, { bg: string; text: string; label: string; tooltip: string }> = {
  DRAFT: { bg: 'bg-surface-100', text: 'text-surface-600', label: 'Draft', tooltip: 'Fully editable. Add allocations, set priorities, and configure assumptions.' },
  REVIEW: { bg: 'bg-blue-100', text: 'text-blue-700', label: 'In Review', tooltip: 'Under stakeholder review. Allocations and priorities can still be adjusted.' },
  APPROVED: { bg: 'bg-green-100', text: 'text-green-700', label: 'Approved', tooltip: 'Allocations and priorities are frozen. Return to Review to make changes.' },
  LOCKED: { bg: 'bg-amber-100', text: 'text-amber-700', label: 'Locked', tooltip: 'Fully immutable. No changes allowed. Baseline scenarios capture a snapshot at this point.' },
};

function ScenarioStatusBadge({ status }: { status: ScenarioStatus }) {
  const config = STATUS_COLORS[status] || STATUS_COLORS.DRAFT;
  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded-full ${config.bg} ${config.text}`}
      title={config.tooltip}
    >
      {status === 'LOCKED' && (
        <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
          <path fillRule="evenodd" d="M10 1a4.5 4.5 0 00-4.5 4.5V9H5a2 2 0 00-2 2v6a2 2 0 002 2h10a2 2 0 002-2v-6a2 2 0 00-2-2h-.5V5.5A4.5 4.5 0 0010 1zm3 8V5.5a3 3 0 10-6 0V9h6z" clipRule="evenodd" />
        </svg>
      )}
      {config.label}
    </span>
  );
}

function PrimaryBadge() {
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-semibold rounded-full bg-amber-50 text-amber-700 border border-amber-200">
      <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
        <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
      </svg>
      Primary
    </span>
  );
}

function findPeriodByLabel(periods: Period[], label: string): Period | undefined {
  return periods.find((p) => p.label === label);
}

// Generate quarter options for next 8 quarters
function getQuarterOptions(): string[] {
  const options: string[] = [];
  const now = new Date();
  let year = now.getFullYear();
  let quarter = Math.ceil((now.getMonth() + 1) / 3);

  for (let i = 0; i < 8; i++) {
    options.push(`${year}-Q${quarter}`);
    quarter++;
    if (quarter > 4) {
      quarter = 1;
      year++;
    }
  }
  return options;
}

// Calculate days until next quarter start
function getDaysUntilNextQuarter(nextQuarter: Period | null): { days: number; dateStr: string } {
  if (!nextQuarter) return { days: 0, dateStr: '' };
  const now = new Date();
  const start = new Date(nextQuarter.startDate);
  const diffMs = start.getTime() - now.getTime();
  const days = Math.max(0, Math.ceil(diffMs / (1000 * 60 * 60 * 24)));
  const dateStr = start.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  return { days, dateStr };
}

// Countdown bar component
function NextQuarterCountdownBar({ nextQuarter }: { nextQuarter: Period | null }) {
  if (!nextQuarter) return null;

  const { days, dateStr } = getDaysUntilNextQuarter(nextQuarter);
  if (days === 0) return null;

  let colorClasses: string;
  let iconColor: string;
  if (days <= 14) {
    colorClasses = 'bg-red-50 border-red-200 text-red-800';
    iconColor = 'text-red-500';
  } else if (days <= 30) {
    colorClasses = 'bg-amber-50 border-amber-200 text-amber-800';
    iconColor = 'text-amber-500';
  } else {
    colorClasses = 'bg-blue-50 border-blue-200 text-blue-800';
    iconColor = 'text-blue-500';
  }

  return (
    <div className={`rounded-lg border px-4 py-3 mb-6 flex items-center gap-3 ${colorClasses}`}>
      <svg className={`w-5 h-5 flex-shrink-0 ${iconColor}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" />
      </svg>
      <span className="text-sm font-medium">
        <strong>{days} day{days !== 1 ? 's' : ''}</strong> until next quarter ({nextQuarter.label} starts {dateStr})
      </span>
    </div>
  );
}

// Quarter section component
function QuarterSection({
  label,
  sectionLabel,
  period,
  scenarios,
  isCurrent,
  defaultCollapsed,
  onCreateClick,
  onSetPrimary,
}: {
  label: string;
  sectionLabel: string;
  period: Period | null;
  scenarios: Scenario[];
  isCurrent: boolean;
  defaultCollapsed: boolean;
  onCreateClick: (periodLabel: string) => void;
  onSetPrimary: (scenarioId: string) => void;
}) {
  const [isCollapsed, setIsCollapsed] = useState(defaultCollapsed);

  // Sort: primary first, then by updatedAt desc
  const sortedScenarios = useMemo(() => {
    return [...scenarios].sort((a, b) => {
      if (a.isPrimary && !b.isPrimary) return -1;
      if (!a.isPrimary && b.isPrimary) return 1;
      return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
    });
  }, [scenarios]);

  return (
    <div className={`mb-8 ${isCurrent ? 'ring-2 ring-accent-200 rounded-xl p-4 bg-accent-50/30' : ''}`}>
      {/* Section Header */}
      <button
        onClick={() => setIsCollapsed((prev) => !prev)}
        className="w-full flex items-center gap-3 mb-4 group text-left"
      >
        <svg
          className={`w-4 h-4 text-surface-400 transition-transform ${isCollapsed ? '' : 'rotate-90'}`}
          fill="currentColor"
          viewBox="0 0 20 20"
        >
          <path fillRule="evenodd" d="M7.21 14.77a.75.75 0 01.02-1.06L11.168 10 7.23 6.29a.75.75 0 111.04-1.08l4.5 4.25a.75.75 0 010 1.08l-4.5 4.25a.75.75 0 01-1.06-.02z" clipRule="evenodd" />
        </svg>
        <h2 className="text-lg font-display font-semibold text-surface-900">
          {sectionLabel}: {label}
        </h2>
        {isCurrent && (
          <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-accent-100 text-accent-700 border border-accent-200">
            Active Quarter
          </span>
        )}
        <span className="text-sm text-surface-400 ml-auto">
          {scenarios.length} scenario{scenarios.length !== 1 ? 's' : ''}
        </span>
      </button>

      {/* Cards */}
      {!isCollapsed && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {sortedScenarios.map((scenario) => (
            <div key={scenario.id} className="relative group">
              <Link
                to={`/scenarios/${scenario.id}`}
                className="card p-5 hover:shadow-elevated transition-all duration-200 block"
              >
                <div className="flex items-start justify-between mb-3">
                  <div className="min-w-0 flex-1">
                    <h3 className="font-display font-semibold text-surface-900 group-hover:text-accent-600 transition-colors truncate">
                      {scenario.name}
                    </h3>
                    <div className="mt-2 flex items-center gap-2 flex-wrap">
                      <ScenarioStatusBadge status={scenario.status} />
                      {scenario.isPrimary && <PrimaryBadge />}
                      {scenario.orgNode && (
                        <span className="inline-flex items-center px-1.5 py-0.5 text-xs font-medium rounded bg-surface-100 text-surface-600">
                          {scenario.orgNode.name}
                        </span>
                      )}
                    </div>
                  </div>
                  <svg
                    className="w-4 h-4 text-surface-300 group-hover:text-accent-500 transition-colors flex-shrink-0 mt-1"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2}
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" />
                  </svg>
                </div>

                {scenario.allocationsCount !== undefined && (
                  <p className="text-xs text-surface-500 mb-1">
                    {scenario.allocationsCount} allocation{scenario.allocationsCount !== 1 ? 's' : ''}
                  </p>
                )}

                {scenario.planLockDate && (
                  <p className="text-xs text-surface-400">
                    Locked {new Date(scenario.planLockDate).toLocaleDateString()}
                  </p>
                )}
                <p className="text-xs text-surface-400 mt-1">
                  Updated {new Date(scenario.updatedAt).toLocaleDateString()}
                </p>
              </Link>

              {/* Set as Primary action */}
              {!scenario.isPrimary && (
                <button
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    onSetPrimary(scenario.id);
                  }}
                  className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 p-1.5 rounded-lg bg-white shadow-sm border border-surface-200 hover:bg-amber-50 hover:border-amber-300 transition-all"
                  title="Set as Primary"
                >
                  <svg className="w-3.5 h-3.5 text-surface-400 hover:text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M11.48 3.499a.562.562 0 011.04 0l2.125 5.111a.563.563 0 00.475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 00-.182.557l1.285 5.385a.562.562 0 01-.84.61l-4.725-2.885a.563.563 0 00-.586 0L6.982 20.54a.562.562 0 01-.84-.61l1.285-5.386a.562.562 0 00-.182-.557l-4.204-3.602a.563.563 0 01.321-.988l5.518-.442a.563.563 0 00.475-.345L11.48 3.5z" />
                  </svg>
                </button>
              )}
            </div>
          ))}

          {/* Create new scenario card */}
          <button
            onClick={() => onCreateClick(period?.label || getCurrentQuarter())}
            className="card p-5 border-2 border-dashed border-surface-300 hover:border-accent-400 hover:bg-accent-50/50 transition-all duration-200 flex flex-col items-center justify-center text-surface-500 hover:text-accent-600 min-h-[160px]"
          >
            <div className="w-10 h-10 rounded-full bg-surface-100 flex items-center justify-center mb-2">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
              </svg>
            </div>
            <span className="text-sm font-medium">New Scenario</span>
          </button>
        </div>
      )}
    </div>
  );
}

export function ScenariosList() {
  const { data: adjacentQ } = useAdjacentQuarters();
  const { data: periodsData } = useQuarterPeriods();
  const quarterPeriods = periodsData?.data ?? [];
  const { data: orgTree } = useOrgTree();
  const [orgNodeFilter, setOrgNodeFilter] = useState<string>('');
  const flatNodes = useMemo(() => flattenOrgTree(orgTree ?? []), [orgTree]);

  // Collect period IDs for the three adjacent quarters
  const periodIds = useMemo(() => {
    const ids: string[] = [];
    if (adjacentQ?.lastQuarter?.id) ids.push(adjacentQ.lastQuarter.id);
    if (adjacentQ?.currentQuarter?.id) ids.push(adjacentQ.currentQuarter.id);
    if (adjacentQ?.nextQuarter?.id) ids.push(adjacentQ.nextQuarter.id);
    return ids;
  }, [adjacentQ]);

  const { data: scenariosData, isLoading } = useScenarios(
    periodIds.length > 0 ? { periodIds, ...(orgNodeFilter ? { orgNodeId: orgNodeFilter } : {}) } : undefined
  );
  const allScenarios = (scenariosData?.data ?? []) as Scenario[];

  const createScenario = useCreateScenario();
  const cloneScenario = useCloneScenario();
  const setPrimary = useSetPrimary();

  const quarterOptions = getQuarterOptions();

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [newScenarioName, setNewScenarioName] = useState('');
  const [selectedQuarter, setSelectedQuarter] = useState(getCurrentQuarter());
  const [cloneSourceId, setCloneSourceId] = useState<string>('');
  const [includeProjectAllocations, setIncludeProjectAllocations] = useState(false);
  const [includeRunSupportAllocations, setIncludeRunSupportAllocations] = useState(true);
  const [includePriorityRankings, setIncludePriorityRankings] = useState(true);

  // Group scenarios by periodId
  const scenariosByPeriod = useMemo(() => {
    const groups: Record<string, Scenario[]> = {};
    for (const s of allScenarios) {
      if (!groups[s.periodId]) groups[s.periodId] = [];
      groups[s.periodId].push(s);
    }
    return groups;
  }, [allScenarios]);

  // Scenarios from previous quarter (for clone source dropdown)
  const previousQuarterScenarios = useMemo(() => {
    if (!adjacentQ?.lastQuarter?.id) return [];
    return scenariosByPeriod[adjacentQ.lastQuarter.id] ?? [];
  }, [adjacentQ, scenariosByPeriod]);

  const handleCreateScenario = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newScenarioName.trim()) return;

    const period = findPeriodByLabel(quarterPeriods, selectedQuarter);
    if (!period) return;

    if (cloneSourceId) {
      cloneScenario.mutate(
        {
          id: cloneSourceId,
          name: newScenarioName.trim(),
          targetPeriodId: period.id,
          includeProjectAllocations,
          includeRunSupportAllocations,
          includePriorityRankings,
        },
        { onSuccess: () => closeModal() }
      );
    } else {
      createScenario.mutate(
        {
          name: newScenarioName.trim(),
          periodId: period.id,
        },
        { onSuccess: () => closeModal() }
      );
    }
  };

  const openModal = (preselectedQuarter?: string) => {
    if (preselectedQuarter) setSelectedQuarter(preselectedQuarter);
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setNewScenarioName('');
    setSelectedQuarter(getCurrentQuarter());
    setCloneSourceId('');
    setIncludeProjectAllocations(false);
    setIncludeRunSupportAllocations(true);
    setIncludePriorityRankings(true);
  };

  const handleSetPrimary = (scenarioId: string) => {
    setPrimary.mutate(scenarioId);
  };

  // Current quarter scenarios for comparison table
  const currentQuarterScenarios = useMemo(() => {
    if (!adjacentQ?.currentQuarter?.id) return [];
    return scenariosByPeriod[adjacentQ.currentQuarter.id] ?? [];
  }, [adjacentQ, scenariosByPeriod]);

  return (
    <div className="animate-fade-in">
      <div className="page-header flex items-center justify-between">
        <div>
          <h1 className="page-title">Scenarios</h1>
          <p className="page-subtitle">Compare different resource allocation strategies</p>
        </div>
        <div className="flex items-center gap-3">
          <select
            value={orgNodeFilter}
            onChange={(e) => setOrgNodeFilter(e.target.value)}
            className="px-3 py-2 text-sm border border-surface-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-accent-500 focus:border-transparent bg-white"
          >
            <option value="">All Org Units</option>
            {flatNodes.map((node) => (
              <option key={node.id} value={node.id}>
                {'  '.repeat(node.depth)}{node.name}
              </option>
            ))}
          </select>
          <button onClick={() => openModal()} className="btn-primary">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
            New Scenario
          </button>
        </div>
      </div>

      {/* Countdown Bar */}
      <NextQuarterCountdownBar nextQuarter={adjacentQ?.nextQuarter ?? null} />

      {isLoading ? (
        <div className="text-center py-12 text-surface-500">Loading scenarios...</div>
      ) : (
        <>
          {/* Last Quarter */}
          {adjacentQ?.lastQuarter && (
            <QuarterSection
              label={adjacentQ.lastQuarter.label}
              sectionLabel="Last Quarter"
              period={adjacentQ.lastQuarter}
              scenarios={scenariosByPeriod[adjacentQ.lastQuarter.id] ?? []}
              isCurrent={false}
              defaultCollapsed={true}
              onCreateClick={openModal}
              onSetPrimary={handleSetPrimary}
            />
          )}

          {/* Current Quarter */}
          {adjacentQ?.currentQuarter && (
            <QuarterSection
              label={adjacentQ.currentQuarter.label}
              sectionLabel="Current Quarter"
              period={adjacentQ.currentQuarter}
              scenarios={scenariosByPeriod[adjacentQ.currentQuarter.id] ?? []}
              isCurrent={true}
              defaultCollapsed={false}
              onCreateClick={openModal}
              onSetPrimary={handleSetPrimary}
            />
          )}

          {/* Next Quarter */}
          {adjacentQ?.nextQuarter && (
            <QuarterSection
              label={adjacentQ.nextQuarter.label}
              sectionLabel="Next Quarter"
              period={adjacentQ.nextQuarter}
              scenarios={scenariosByPeriod[adjacentQ.nextQuarter.id] ?? []}
              isCurrent={false}
              defaultCollapsed={false}
              onCreateClick={openModal}
              onSetPrimary={handleSetPrimary}
            />
          )}

          {/* Quick Comparison Table (current quarter) */}
          {currentQuarterScenarios.length > 0 && (
            <div className="mt-10">
              <h2 className="text-lg font-display font-semibold text-surface-900 mb-4">
                Quick Comparison ({adjacentQ?.currentQuarter?.label})
              </h2>
              <div className="card overflow-hidden">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Primary</th>
                      <th>Scenario</th>
                      <th className="text-center">Org Unit</th>
                      <th className="text-center">Status</th>
                      <th className="text-center">Allocations</th>
                      <th className="text-center">Last Updated</th>
                    </tr>
                  </thead>
                  <tbody>
                    {currentQuarterScenarios.map((scenario) => (
                      <tr key={scenario.id}>
                        <td className="text-center w-16">
                          {scenario.isPrimary ? (
                            <svg className="w-5 h-5 text-amber-500 mx-auto" fill="currentColor" viewBox="0 0 20 20">
                              <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                            </svg>
                          ) : (
                            <span className="text-surface-300">-</span>
                          )}
                        </td>
                        <td>
                          <Link to={`/scenarios/${scenario.id}`} className="font-medium text-surface-900 hover:text-accent-600">
                            {scenario.name}
                          </Link>
                        </td>
                        <td className="text-center text-sm text-surface-600">
                          {scenario.orgNode?.name ?? '-'}
                        </td>
                        <td className="text-center">
                          <ScenarioStatusBadge status={scenario.status} />
                        </td>
                        <td className="text-center font-mono text-sm">
                          {scenario.allocationsCount ?? '-'}
                        </td>
                        <td className="text-center font-mono text-sm">
                          {new Date(scenario.updatedAt).toLocaleDateString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}

      {/* Create / Clone Scenario Modal */}
      <Modal isOpen={isModalOpen} onClose={closeModal} title="Create New Scenario">
        <form onSubmit={handleCreateScenario} className="space-y-4">
          <div>
            <label htmlFor="scenario-name" className="block text-sm font-medium text-surface-700 mb-1">
              Name
            </label>
            <input
              id="scenario-name"
              type="text"
              value={newScenarioName}
              onChange={(e) => setNewScenarioName(e.target.value)}
              placeholder="e.g., Q2 Planning"
              className="w-full px-3 py-2 border border-surface-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-accent-500 focus:border-transparent"
              required
              autoFocus
            />
          </div>
          <div>
            <label htmlFor="quarter" className="block text-sm font-medium text-surface-700 mb-1">
              Quarter
            </label>
            <select
              id="quarter"
              value={selectedQuarter}
              onChange={(e) => setSelectedQuarter(e.target.value)}
              className="w-full px-3 py-2 border border-surface-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-accent-500 focus:border-transparent bg-white"
            >
              {quarterOptions.map((q) => (
                <option key={q} value={q}>{q}</option>
              ))}
            </select>
          </div>

          {/* Clone from source */}
          <div>
            <label htmlFor="clone-source" className="block text-sm font-medium text-surface-700 mb-1">
              Clone from (optional)
            </label>
            <select
              id="clone-source"
              value={cloneSourceId}
              onChange={(e) => setCloneSourceId(e.target.value)}
              className="w-full px-3 py-2 border border-surface-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-accent-500 focus:border-transparent bg-white"
            >
              <option value="">Start fresh (no clone)</option>
              {previousQuarterScenarios.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} ({s.periodLabel}) {s.isPrimary ? '- Primary' : ''}
                </option>
              ))}
              {/* Also show current quarter scenarios */}
              {currentQuarterScenarios
                .filter((s) => !previousQuarterScenarios.some((p) => p.id === s.id))
                .map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} ({s.periodLabel}) {s.isPrimary ? '- Primary' : ''}
                  </option>
                ))}
            </select>
          </div>

          {/* Clone options */}
          {cloneSourceId && (
            <div className="bg-surface-50 rounded-lg p-3 space-y-2">
              <p className="text-xs font-medium text-surface-600 mb-2">Include from source:</p>
              <label className="flex items-center gap-2 text-sm text-surface-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={includeRunSupportAllocations}
                  onChange={(e) => setIncludeRunSupportAllocations(e.target.checked)}
                  className="rounded border-surface-300 text-accent-600 focus:ring-accent-500"
                />
                Run/Support allocations
              </label>
              <label className="flex items-center gap-2 text-sm text-surface-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={includePriorityRankings}
                  onChange={(e) => setIncludePriorityRankings(e.target.checked)}
                  className="rounded border-surface-300 text-accent-600 focus:ring-accent-500"
                />
                Priority rankings
              </label>
              <label className="flex items-center gap-2 text-sm text-surface-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={includeProjectAllocations}
                  onChange={(e) => setIncludeProjectAllocations(e.target.checked)}
                  className="rounded border-surface-300 text-accent-600 focus:ring-accent-500"
                />
                Project allocations
              </label>
            </div>
          )}

          <div className="flex justify-end gap-3 pt-4">
            <button
              type="button"
              onClick={closeModal}
              className="px-4 py-2 text-sm font-medium text-surface-700 hover:bg-surface-100 rounded-lg transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={createScenario.isPending || cloneScenario.isPending || !newScenarioName.trim()}
              className="px-4 py-2 text-sm font-medium text-white bg-accent-600 hover:bg-accent-700 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {(createScenario.isPending || cloneScenario.isPending)
                ? 'Creating...'
                : cloneSourceId
                  ? 'Clone Scenario'
                  : 'Create Scenario'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
