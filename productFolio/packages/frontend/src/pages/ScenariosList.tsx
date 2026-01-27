import { Link } from 'react-router-dom';

const mockScenarios = [
  {
    id: '1',
    name: 'Q2 2024 Baseline',
    description: 'Current approved plan for Q2',
    isBaseline: true,
    initiatives: 5,
    utilization: 78,
    updatedAt: '2024-01-20',
  },
  {
    id: '2',
    name: 'Aggressive Growth',
    description: 'Add 2 new initiatives, hire 3 engineers',
    isBaseline: false,
    initiatives: 7,
    utilization: 92,
    updatedAt: '2024-01-22',
  },
  {
    id: '3',
    name: 'Conservative Approach',
    description: 'Defer mobile app, focus on core platform',
    isBaseline: false,
    initiatives: 4,
    utilization: 65,
    updatedAt: '2024-01-21',
  },
];

export function ScenariosList() {
  return (
    <div className="animate-fade-in">
      <div className="page-header flex items-center justify-between">
        <div>
          <h1 className="page-title">Scenarios</h1>
          <p className="page-subtitle">Compare different resource allocation strategies</p>
        </div>
        <button className="btn-primary">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
          </svg>
          New Scenario
        </button>
      </div>

      {/* Scenario cards grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {mockScenarios.map((scenario, index) => (
          <Link
            key={scenario.id}
            to={`/scenarios/${scenario.id}`}
            className={`card p-6 hover:shadow-elevated transition-all duration-200 group animate-slide-up stagger-${index + 1}`}
          >
            <div className="flex items-start justify-between mb-4">
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="font-display font-semibold text-surface-900 group-hover:text-accent-600 transition-colors">
                    {scenario.name}
                  </h3>
                  {scenario.isBaseline && (
                    <span className="badge-accent">Baseline</span>
                  )}
                </div>
                <p className="mt-1 text-sm text-surface-500">{scenario.description}</p>
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

            {/* Stats */}
            <div className="grid grid-cols-2 gap-4 pt-4 border-t border-surface-100">
              <div>
                <p className="text-xs text-surface-500 mb-1">Initiatives</p>
                <p className="text-lg font-display font-bold text-surface-900">{scenario.initiatives}</p>
              </div>
              <div>
                <p className="text-xs text-surface-500 mb-1">Utilization</p>
                <div className="flex items-center gap-2">
                  <p className="text-lg font-display font-bold text-surface-900">{scenario.utilization}%</p>
                  <div className="flex-1 h-2 bg-surface-100 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full ${
                        scenario.utilization > 85
                          ? 'bg-warning'
                          : scenario.utilization > 70
                          ? 'bg-success'
                          : 'bg-accent-500'
                      }`}
                      style={{ width: `${scenario.utilization}%` }}
                    />
                  </div>
                </div>
              </div>
            </div>

            <p className="mt-4 text-xs text-surface-400">
              Updated {scenario.updatedAt}
            </p>
          </Link>
        ))}

        {/* Create new scenario card */}
        <button className="card p-6 border-2 border-dashed border-surface-300 hover:border-accent-400 hover:bg-accent-50/50 transition-all duration-200 flex flex-col items-center justify-center text-surface-500 hover:text-accent-600 min-h-[200px] group">
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
      <div className="mt-10">
        <h2 className="text-lg font-display font-semibold text-surface-900 mb-4">Quick Comparison</h2>
        <div className="card overflow-hidden">
          <table className="table">
            <thead>
              <tr>
                <th>Scenario</th>
                <th className="text-center">Initiatives</th>
                <th className="text-center">Team Utilization</th>
                <th className="text-center">Skill Gaps</th>
                <th className="text-center">Risk Level</th>
              </tr>
            </thead>
            <tbody>
              {mockScenarios.map((scenario) => (
                <tr key={scenario.id}>
                  <td>
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-surface-900">{scenario.name}</span>
                      {scenario.isBaseline && <span className="badge-accent">Baseline</span>}
                    </div>
                  </td>
                  <td className="text-center font-mono">{scenario.initiatives}</td>
                  <td className="text-center">
                    <span className={`font-mono ${
                      scenario.utilization > 85 ? 'text-warning' : 'text-surface-700'
                    }`}>
                      {scenario.utilization}%
                    </span>
                  </td>
                  <td className="text-center">
                    <span className={`badge ${
                      scenario.utilization > 85 ? 'badge-warning' : 'badge-success'
                    }`}>
                      {scenario.utilization > 85 ? '2 gaps' : 'None'}
                    </span>
                  </td>
                  <td className="text-center">
                    <span className={`badge ${
                      scenario.utilization > 90
                        ? 'badge-danger'
                        : scenario.utilization > 80
                        ? 'badge-warning'
                        : 'badge-success'
                    }`}>
                      {scenario.utilization > 90
                        ? 'High'
                        : scenario.utilization > 80
                        ? 'Medium'
                        : 'Low'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
