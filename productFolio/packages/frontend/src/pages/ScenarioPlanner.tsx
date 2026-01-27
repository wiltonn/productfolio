import { useParams, Link } from 'react-router-dom';

const mockInitiatives = [
  { id: '1', name: 'Customer Portal Redesign', priority: 1, demand: { Frontend: 35, Backend: 20, Design: 10 } },
  { id: '2', name: 'API Gateway Migration', priority: 2, demand: { Backend: 40, DevOps: 15 } },
  { id: '3', name: 'Mobile App v2', priority: 3, demand: { Frontend: 45, Backend: 25, Design: 15 } },
  { id: '4', name: 'Data Pipeline Optimization', priority: 4, demand: { Backend: 30, Data: 20 } },
];

const mockAllocations = [
  { employee: 'Sarah Chen', skill: 'Frontend', initiatives: ['Customer Portal Redesign', 'Mobile App v2'], hours: 65 },
  { employee: 'Mike Johnson', skill: 'Backend', initiatives: ['API Gateway Migration', 'Data Pipeline'], hours: 90 },
  { employee: 'Alex Rivera', skill: 'Full Stack', initiatives: ['Customer Portal Redesign'], hours: 40 },
  { employee: 'Emily Watson', skill: 'Data', initiatives: ['Data Pipeline Optimization'], hours: 75 },
  { employee: 'James Lee', skill: 'Design', initiatives: ['Customer Portal Redesign', 'Mobile App v2'], hours: 85 },
];

export function ScenarioPlanner() {
  const { id } = useParams<{ id: string }>();

  return (
    <div className="animate-fade-in">
      <div className="mb-6">
        <Link
          to="/scenarios"
          className="inline-flex items-center gap-1.5 text-sm text-surface-500 hover:text-surface-700 transition-colors"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5 3 12m0 0 7.5-7.5M3 12h18" />
          </svg>
          Back to Scenarios
        </Link>
      </div>

      <div className="page-header flex items-start justify-between">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="page-title">Q2 2024 Baseline</h1>
            <span className="badge-accent">Baseline</span>
          </div>
          <p className="page-subtitle">Scenario ID: {id} · Last updated 2 hours ago</p>
        </div>
        <div className="flex items-center gap-2">
          <button className="btn-secondary">Clone Scenario</button>
          <button className="btn-secondary">Compare</button>
          <button className="btn-primary">Save Changes</button>
        </div>
      </div>

      {/* Summary stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
        {[
          { label: 'Total Demand', value: '255d', subtitle: 'Person-days', trend: null },
          { label: 'Available Capacity', value: '280d', subtitle: 'Person-days', trend: null },
          { label: 'Utilization', value: '91%', subtitle: 'Capacity used', trend: 'warning' },
          { label: 'Skill Gaps', value: '2', subtitle: 'Skills over capacity', trend: 'danger' },
        ].map((stat, i) => (
          <div key={stat.label} className={`stat-card animate-slide-up stagger-${i + 1}`}>
            <p className="stat-label">{stat.label}</p>
            <p className={`stat-value ${
              stat.trend === 'warning' ? 'text-warning' :
              stat.trend === 'danger' ? 'text-danger' : ''
            }`}>
              {stat.value}
            </p>
            <p className="text-xs text-surface-500">{stat.subtitle}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Initiative priority list (draggable in real implementation) */}
        <div className="lg:col-span-2">
          <div className="card">
            <div className="px-5 py-4 border-b border-surface-200 flex items-center justify-between">
              <h2 className="font-display font-semibold text-surface-900">Initiative Priority</h2>
              <span className="text-sm text-surface-500">Drag to reorder</span>
            </div>
            <div className="divide-y divide-surface-100">
              {mockInitiatives.map((initiative) => (
                <div
                  key={initiative.id}
                  className="px-5 py-4 flex items-center gap-4 hover:bg-surface-50 transition-colors cursor-grab active:cursor-grabbing group"
                >
                  {/* Drag handle */}
                  <div className="text-surface-300 group-hover:text-surface-500 transition-colors">
                    <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                      <path d="M7 2a2 2 0 1 0 .001 4.001A2 2 0 0 0 7 2zm0 6a2 2 0 1 0 .001 4.001A2 2 0 0 0 7 8zm0 6a2 2 0 1 0 .001 4.001A2 2 0 0 0 7 14zm6-8a2 2 0 1 0-.001-4.001A2 2 0 0 0 13 6zm0 2a2 2 0 1 0 .001 4.001A2 2 0 0 0 13 8zm0 6a2 2 0 1 0 .001 4.001A2 2 0 0 0 13 14z" />
                    </svg>
                  </div>

                  {/* Priority badge */}
                  <div className="flex-shrink-0 w-8 h-8 rounded-full bg-accent-100 text-accent-700 flex items-center justify-center text-sm font-semibold">
                    {initiative.priority}
                  </div>

                  {/* Initiative info */}
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-surface-900">{initiative.name}</p>
                    <div className="flex items-center gap-2 mt-1">
                      {Object.entries(initiative.demand).map(([skill, days]) => (
                        <span key={skill} className="text-xs text-surface-500">
                          {skill}: {days}d
                        </span>
                      ))}
                    </div>
                  </div>

                  {/* Total demand */}
                  <div className="text-right">
                    <p className="text-sm font-mono font-semibold text-surface-900">
                      {Object.values(initiative.demand).reduce((a, b) => a + b, 0)}d
                    </p>
                    <p className="text-xs text-surface-500">Total demand</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Capacity heatmap */}
        <div>
          <div className="card p-5">
            <h2 className="font-display font-semibold text-surface-900 mb-4">Capacity by Skill</h2>
            <div className="space-y-4">
              {[
                { skill: 'Frontend', demand: 80, capacity: 85, status: 'ok' },
                { skill: 'Backend', demand: 115, capacity: 100, status: 'over' },
                { skill: 'Design', demand: 25, capacity: 40, status: 'ok' },
                { skill: 'Data', demand: 20, capacity: 30, status: 'ok' },
                { skill: 'DevOps', demand: 15, capacity: 10, status: 'over' },
              ].map((item) => {
                const utilization = Math.round((item.demand / item.capacity) * 100);
                const isOver = item.demand > item.capacity;

                return (
                  <div key={item.skill}>
                    <div className="flex items-center justify-between text-sm mb-1.5">
                      <span className="font-medium text-surface-900">{item.skill}</span>
                      <span className={`font-mono ${isOver ? 'text-danger' : 'text-surface-600'}`}>
                        {item.demand}/{item.capacity}d
                        {isOver && <span className="ml-1 text-xs">({item.demand - item.capacity}d over)</span>}
                      </span>
                    </div>
                    <div className="h-3 bg-surface-100 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all duration-300 ${
                          isOver ? 'bg-danger' : utilization > 85 ? 'bg-warning' : 'bg-success'
                        }`}
                        style={{ width: `${Math.min(utilization, 100)}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="mt-6 pt-4 border-t border-surface-200">
              <h3 className="text-sm font-semibold text-surface-900 mb-3">Recommendations</h3>
              <div className="space-y-2">
                <div className="flex items-start gap-2 text-sm">
                  <span className="w-5 h-5 rounded-full bg-danger/10 text-danger flex-shrink-0 flex items-center justify-center text-xs">!</span>
                  <span className="text-surface-600">Consider hiring Backend engineer or deferring initiative</span>
                </div>
                <div className="flex items-start gap-2 text-sm">
                  <span className="w-5 h-5 rounded-full bg-warning/10 text-warning flex-shrink-0 flex items-center justify-center text-xs">!</span>
                  <span className="text-surface-600">DevOps at capacity - evaluate contractor support</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Allocation timeline */}
      <div className="mt-6">
        <div className="card">
          <div className="px-5 py-4 border-b border-surface-200">
            <h2 className="font-display font-semibold text-surface-900">Team Allocations</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="table">
              <thead>
                <tr>
                  <th>Team Member</th>
                  <th>Primary Skill</th>
                  <th>Assigned Initiatives</th>
                  <th className="text-right">Hours/Week</th>
                  <th className="text-right">Utilization</th>
                </tr>
              </thead>
              <tbody>
                {mockAllocations.map((allocation) => {
                  const utilization = Math.round((allocation.hours / 100) * 100);

                  return (
                    <tr key={allocation.employee}>
                      <td className="font-medium text-surface-900">{allocation.employee}</td>
                      <td>
                        <span className="badge-default">{allocation.skill}</span>
                      </td>
                      <td>
                        <div className="flex flex-wrap gap-1">
                          {allocation.initiatives.map((init) => (
                            <span key={init} className="text-xs text-surface-600 bg-surface-100 px-2 py-0.5 rounded">
                              {init}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td className="text-right font-mono">{allocation.hours}h</td>
                      <td className="text-right">
                        <div className="flex items-center justify-end gap-2">
                          <span className={`font-mono ${
                            utilization > 90 ? 'text-danger' :
                            utilization > 80 ? 'text-warning' : 'text-surface-700'
                          }`}>
                            {utilization}%
                          </span>
                          <div className="w-16 h-2 bg-surface-100 rounded-full overflow-hidden">
                            <div
                              className={`h-full rounded-full ${
                                utilization > 90 ? 'bg-danger' :
                                utilization > 80 ? 'bg-warning' : 'bg-success'
                              }`}
                              style={{ width: `${utilization}%` }}
                            />
                          </div>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
