import { Link } from 'react-router-dom';

const mockInitiatives = [
  {
    id: '1',
    name: 'Customer Portal Redesign',
    status: 'IN_PROGRESS',
    priority: 1,
    owner: 'Sarah Chen',
    startDate: '2024-01-15',
    endDate: '2024-06-30',
  },
  {
    id: '2',
    name: 'API Gateway Migration',
    status: 'APPROVED',
    priority: 2,
    owner: 'Mike Johnson',
    startDate: '2024-02-01',
    endDate: '2024-05-15',
  },
  {
    id: '3',
    name: 'Mobile App v2',
    status: 'DRAFT',
    priority: 3,
    owner: 'Alex Rivera',
    startDate: '2024-03-01',
    endDate: '2024-09-30',
  },
  {
    id: '4',
    name: 'Data Pipeline Optimization',
    status: 'PENDING_APPROVAL',
    priority: 4,
    owner: 'Emily Watson',
    startDate: '2024-02-15',
    endDate: '2024-04-30',
  },
];

const statusColors: Record<string, string> = {
  DRAFT: 'badge-default',
  PENDING_APPROVAL: 'badge-warning',
  APPROVED: 'badge-accent',
  IN_PROGRESS: 'badge-success',
  COMPLETED: 'badge-default',
};

const statusLabels: Record<string, string> = {
  DRAFT: 'Draft',
  PENDING_APPROVAL: 'Pending',
  APPROVED: 'Approved',
  IN_PROGRESS: 'In Progress',
  COMPLETED: 'Completed',
};

export function InitiativesList() {
  return (
    <div className="animate-fade-in">
      <div className="page-header flex items-center justify-between">
        <div>
          <h1 className="page-title">Initiatives</h1>
          <p className="page-subtitle">Manage and track your portfolio initiatives</p>
        </div>
        <button className="btn-primary">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
          </svg>
          New Initiative
        </button>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
        {[
          { label: 'Total Initiatives', value: '12', change: '+2 this month' },
          { label: 'In Progress', value: '5', change: '42% of total' },
          { label: 'Pending Review', value: '3', change: 'Awaiting approval' },
          { label: 'Completed', value: '4', change: 'This quarter' },
        ].map((stat, i) => (
          <div key={stat.label} className={`stat-card animate-slide-up stagger-${i + 1}`}>
            <p className="stat-label">{stat.label}</p>
            <p className="stat-value">{stat.value}</p>
            <p className="stat-change text-surface-500">{stat.change}</p>
          </div>
        ))}
      </div>

      {/* Table */}
      <div className="card">
        <div className="px-4 py-3 border-b border-surface-200 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <input
              type="text"
              placeholder="Search initiatives..."
              className="input w-64"
            />
            <select className="input w-40">
              <option value="">All Statuses</option>
              <option value="DRAFT">Draft</option>
              <option value="IN_PROGRESS">In Progress</option>
              <option value="APPROVED">Approved</option>
            </select>
          </div>
          <div className="flex items-center gap-2 text-sm text-surface-500">
            <span>4 initiatives</span>
          </div>
        </div>

        <div className="table-container border-0 rounded-none">
          <table className="table">
            <thead>
              <tr>
                <th>Initiative</th>
                <th>Status</th>
                <th>Owner</th>
                <th>Timeline</th>
                <th className="text-right">Priority</th>
              </tr>
            </thead>
            <tbody>
              {mockInitiatives.map((initiative) => (
                <tr key={initiative.id} className="group">
                  <td>
                    <Link
                      to={`/initiatives/${initiative.id}`}
                      className="font-medium text-surface-900 hover:text-accent-600 transition-colors"
                    >
                      {initiative.name}
                    </Link>
                  </td>
                  <td>
                    <span className={statusColors[initiative.status]}>
                      {statusLabels[initiative.status]}
                    </span>
                  </td>
                  <td className="text-surface-600">{initiative.owner}</td>
                  <td className="text-surface-600 font-mono text-xs">
                    {initiative.startDate} → {initiative.endDate}
                  </td>
                  <td className="text-right">
                    <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-surface-100 text-xs font-medium text-surface-700">
                      {initiative.priority}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="px-4 py-3 border-t border-surface-200 flex items-center justify-between text-sm">
          <span className="text-surface-500">Showing 1-4 of 4 initiatives</span>
          <div className="flex items-center gap-2">
            <button className="btn-ghost px-3 py-1.5" disabled>
              Previous
            </button>
            <button className="btn-ghost px-3 py-1.5" disabled>
              Next
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
