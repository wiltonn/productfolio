import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useScenarios, useCreateScenario } from '../hooks/useScenarios';
import { useQuarterPeriods, getQuarterPeriodIds, deriveQuarterRange } from '../hooks/usePeriods';
import { Modal } from '../components/ui';

// Helper to get current quarter
function getCurrentQuarter(): string {
  const now = new Date();
  const quarter = Math.ceil((now.getMonth() + 1) / 3);
  return `${now.getFullYear()}-Q${quarter}`;
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

export function ScenariosList() {
  const { data: scenariosData, isLoading } = useScenarios();
  const scenarios = scenariosData?.data ?? [];
  const createScenario = useCreateScenario();
  const { data: periodsData } = useQuarterPeriods();
  const quarterPeriods = periodsData?.data ?? [];
  const quarterOptions = getQuarterOptions();

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [newScenarioName, setNewScenarioName] = useState('');
  const [startQuarter, setStartQuarter] = useState(getCurrentQuarter());
  const [endQuarter, setEndQuarter] = useState(getCurrentQuarter());

  const handleCreateScenario = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newScenarioName.trim()) return;

    const periodIds = getQuarterPeriodIds(quarterPeriods, startQuarter, endQuarter);
    if (periodIds.length === 0) return;

    createScenario.mutate(
      {
        name: newScenarioName.trim(),
        periodIds,
      },
      {
        onSuccess: () => {
          setIsModalOpen(false);
          setNewScenarioName('');
          setStartQuarter(getCurrentQuarter());
          setEndQuarter(getCurrentQuarter());
        },
      }
    );
  };

  const openModal = () => setIsModalOpen(true);
  const closeModal = () => {
    setIsModalOpen(false);
    setNewScenarioName('');
    setStartQuarter(getCurrentQuarter());
    setEndQuarter(getCurrentQuarter());
  };
  return (
    <div className="animate-fade-in">
      <div className="page-header flex items-center justify-between">
        <div>
          <h1 className="page-title">Scenarios</h1>
          <p className="page-subtitle">Compare different resource allocation strategies</p>
        </div>
        <button onClick={openModal} className="btn-primary">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
          </svg>
          New Scenario
        </button>
      </div>

      {/* Scenario cards grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {isLoading ? (
          <div className="col-span-3 text-center py-8 text-surface-500">Loading scenarios...</div>
        ) : scenarios.length === 0 ? (
          <div className="col-span-3 text-center py-8 text-surface-500">No scenarios yet. Create your first one!</div>
        ) : scenarios.map((scenario, index) => (
          <Link
            key={scenario.id}
            to={`/scenarios/${scenario.id}`}
            className={`card p-6 hover:shadow-elevated transition-all duration-200 group animate-slide-up stagger-${index + 1}`}
          >
            <div className="flex items-start justify-between mb-4">
              <div>
                <h3 className="font-display font-semibold text-surface-900 group-hover:text-accent-600 transition-colors">
                  {scenario.name}
                </h3>
                <p className="mt-1 text-sm text-surface-500 font-mono">
                  {scenario.quarterRange || deriveQuarterRange(scenario.periodIds || [], quarterPeriods)}
                </p>
              </div>
              <svg
                className="w-5 h-5 text-surface-300 group-hover:text-accent-500 transition-colors"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" />
              </svg>
            </div>

            <p className="mt-4 text-xs text-surface-400">
              Updated {new Date(scenario.updatedAt).toLocaleDateString()}
            </p>
          </Link>
        ))}

        {/* Create new scenario card */}
        <button
          onClick={openModal}
          className="card p-6 border-2 border-dashed border-surface-300 hover:border-accent-400 hover:bg-accent-50/50 transition-all duration-200 flex flex-col items-center justify-center text-surface-500 hover:text-accent-600 min-h-[200px] group"
        >
          <div className="w-12 h-12 rounded-full bg-surface-100 group-hover:bg-accent-100 flex items-center justify-center mb-3 transition-colors">
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
          </div>
          <span className="font-medium">Create New Scenario</span>
          <span className="text-sm mt-1">Clone from baseline or start fresh</span>
        </button>
      </div>

      {/* Comparison section */}
      {scenarios.length > 0 && (
        <div className="mt-10">
          <h2 className="text-lg font-display font-semibold text-surface-900 mb-4">Quick Comparison</h2>
          <div className="card overflow-hidden">
            <table className="table">
              <thead>
                <tr>
                  <th>Scenario</th>
                  <th className="text-center">Quarter Range</th>
                  <th className="text-center">Created</th>
                  <th className="text-center">Last Updated</th>
                </tr>
              </thead>
              <tbody>
                {scenarios.map((scenario) => (
                  <tr key={scenario.id}>
                    <td>
                      <span className="font-medium text-surface-900">{scenario.name}</span>
                    </td>
                    <td className="text-center font-mono text-sm">
                      {scenario.quarterRange || deriveQuarterRange(scenario.periodIds || [], quarterPeriods)}
                    </td>
                    <td className="text-center font-mono text-sm">
                      {new Date(scenario.createdAt).toLocaleDateString()}
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

      {/* Create Scenario Modal */}
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
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label htmlFor="start-quarter" className="block text-sm font-medium text-surface-700 mb-1">
                Start Quarter
              </label>
              <select
                id="start-quarter"
                value={startQuarter}
                onChange={(e) => setStartQuarter(e.target.value)}
                className="w-full px-3 py-2 border border-surface-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-accent-500 focus:border-transparent bg-white"
              >
                {quarterOptions.map((q) => (
                  <option key={q} value={q}>{q}</option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="end-quarter" className="block text-sm font-medium text-surface-700 mb-1">
                End Quarter
              </label>
              <select
                id="end-quarter"
                value={endQuarter}
                onChange={(e) => setEndQuarter(e.target.value)}
                className="w-full px-3 py-2 border border-surface-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-accent-500 focus:border-transparent bg-white"
              >
                {quarterOptions.map((q) => (
                  <option key={q} value={q}>{q}</option>
                ))}
              </select>
            </div>
          </div>
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
              disabled={createScenario.isPending || !newScenarioName.trim()}
              className="px-4 py-2 text-sm font-medium text-white bg-accent-600 hover:bg-accent-700 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {createScenario.isPending ? 'Creating...' : 'Create Scenario'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
