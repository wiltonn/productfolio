import { useParams, Link } from 'react-router-dom';

export function InitiativeDetail() {
  const { id } = useParams<{ id: string }>();

  return (
    <div className="animate-fade-in">
      <div className="mb-6">
        <Link
          to="/initiatives"
          className="inline-flex items-center gap-1.5 text-sm text-surface-500 hover:text-surface-700 transition-colors"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5 3 12m0 0 7.5-7.5M3 12h18" />
          </svg>
          Back to Initiatives
        </Link>
      </div>

      <div className="page-header flex items-start justify-between">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="page-title">Customer Portal Redesign</h1>
            <span className="badge-success">In Progress</span>
          </div>
          <p className="page-subtitle">Initiative ID: {id}</p>
        </div>
        <div className="flex items-center gap-2">
          <button className="btn-secondary">Edit</button>
          <button className="btn-primary">Update Status</button>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-6">
        {/* Main content */}
        <div className="col-span-2 space-y-6">
          {/* Overview card */}
          <div className="card p-6">
            <h2 className="text-lg font-display font-semibold text-surface-900 mb-4">Overview</h2>
            <p className="text-surface-600 leading-relaxed">
              Complete redesign of the customer-facing portal to improve user experience,
              modernize the interface, and add new self-service capabilities. This initiative
              includes migration to a new component library and implementation of accessibility
              improvements.
            </p>
          </div>

          {/* Scope items */}
          <div className="card">
            <div className="px-6 py-4 border-b border-surface-200 flex items-center justify-between">
              <h2 className="text-lg font-display font-semibold text-surface-900">Scope Items</h2>
              <button className="btn-ghost text-sm">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                </svg>
                Add Item
              </button>
            </div>
            <div className="divide-y divide-surface-100">
              {[
                { name: 'Design System Migration', skill: 'Frontend', p50: 15, p90: 22 },
                { name: 'Authentication Flow', skill: 'Backend', p50: 8, p90: 12 },
                { name: 'Dashboard Components', skill: 'Frontend', p50: 20, p90: 30 },
                { name: 'API Integration', skill: 'Backend', p50: 12, p90: 18 },
              ].map((item) => (
                <div key={item.name} className="px-6 py-4 flex items-center justify-between hover:bg-surface-50 transition-colors">
                  <div>
                    <p className="font-medium text-surface-900">{item.name}</p>
                    <p className="text-sm text-surface-500">{item.skill}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-mono text-surface-700">
                      {item.p50}d <span className="text-surface-400">/ {item.p90}d</span>
                    </p>
                    <p className="text-xs text-surface-500">P50 / P90</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Details card */}
          <div className="card p-6 space-y-4">
            <h3 className="text-sm font-semibold text-surface-900 uppercase tracking-wider">Details</h3>

            <div className="space-y-3">
              <div>
                <p className="text-xs text-surface-500 mb-1">Owner</p>
                <p className="text-sm font-medium text-surface-900">Sarah Chen</p>
              </div>
              <div>
                <p className="text-xs text-surface-500 mb-1">Priority</p>
                <p className="text-sm font-medium text-surface-900">#1</p>
              </div>
              <div>
                <p className="text-xs text-surface-500 mb-1">Start Date</p>
                <p className="text-sm font-mono text-surface-900">2024-01-15</p>
              </div>
              <div>
                <p className="text-xs text-surface-500 mb-1">Target End</p>
                <p className="text-sm font-mono text-surface-900">2024-06-30</p>
              </div>
            </div>
          </div>

          {/* Skill demand card */}
          <div className="card p-6">
            <h3 className="text-sm font-semibold text-surface-900 uppercase tracking-wider mb-4">Skill Demand</h3>
            <div className="space-y-3">
              {[
                { skill: 'Frontend', demand: 35, color: 'bg-accent-500' },
                { skill: 'Backend', demand: 20, color: 'bg-highlight-500' },
                { skill: 'Design', demand: 10, color: 'bg-purple-500' },
              ].map((item) => (
                <div key={item.skill}>
                  <div className="flex items-center justify-between text-sm mb-1">
                    <span className="text-surface-600">{item.skill}</span>
                    <span className="font-mono text-surface-900">{item.demand}d</span>
                  </div>
                  <div className="h-2 bg-surface-100 rounded-full overflow-hidden">
                    <div
                      className={`h-full ${item.color} rounded-full transition-all duration-500`}
                      style={{ width: `${(item.demand / 35) * 100}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
