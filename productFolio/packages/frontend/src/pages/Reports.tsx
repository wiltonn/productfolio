export function Reports() {
  return (
    <div className="animate-fade-in">
      <div className="page-header">
        <h1 className="page-title">Reports & Analytics</h1>
        <p className="page-subtitle">Portfolio insights and performance metrics</p>
      </div>

      {/* Key metrics */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {[
          { label: 'Active Initiatives', value: '8', change: '+2', changeType: 'up' },
          { label: 'Team Utilization', value: '82%', change: '+5%', changeType: 'up' },
          { label: 'On-Time Delivery', value: '94%', change: '-2%', changeType: 'down' },
          { label: 'Budget Adherence', value: '97%', change: '+1%', changeType: 'up' },
        ].map((metric, i) => (
          <div key={metric.label} className={`stat-card animate-slide-up stagger-${i + 1}`}>
            <p className="stat-label">{metric.label}</p>
            <p className="stat-value">{metric.value}</p>
            <p className={metric.changeType === 'up' ? 'stat-change-up' : 'stat-change-down'}>
              {metric.changeType === 'up' ? '↑' : '↓'} {metric.change} vs last month
            </p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Initiative status breakdown */}
        <div className="card p-6">
          <h2 className="font-display font-semibold text-surface-900 mb-6">Initiative Status</h2>
          <div className="space-y-4">
            {[
              { status: 'Completed', count: 4, percentage: 33, color: 'bg-success' },
              { status: 'In Progress', count: 5, percentage: 42, color: 'bg-accent-500' },
              { status: 'Approved', count: 2, percentage: 17, color: 'bg-highlight-500' },
              { status: 'Draft', count: 1, percentage: 8, color: 'bg-surface-400' },
            ].map((item) => (
              <div key={item.status}>
                <div className="flex items-center justify-between text-sm mb-2">
                  <div className="flex items-center gap-2">
                    <div className={`w-3 h-3 rounded-full ${item.color}`} />
                    <span className="font-medium text-surface-900">{item.status}</span>
                  </div>
                  <span className="text-surface-600">
                    {item.count} ({item.percentage}%)
                  </span>
                </div>
                <div className="h-2 bg-surface-100 rounded-full overflow-hidden">
                  <div
                    className={`h-full ${item.color} rounded-full transition-all duration-500`}
                    style={{ width: `${item.percentage}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Skill utilization chart placeholder */}
        <div className="card p-6">
          <h2 className="font-display font-semibold text-surface-900 mb-6">Skill Utilization Trend</h2>
          <div className="h-64 bg-surface-50 rounded-lg flex items-center justify-center border-2 border-dashed border-surface-200">
            <div className="text-center">
              <svg className="w-12 h-12 text-surface-300 mx-auto mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3v11.25A2.25 2.25 0 0 0 6 16.5h2.25M3.75 3h-1.5m1.5 0h16.5m0 0h1.5m-1.5 0v11.25A2.25 2.25 0 0 1 18 16.5h-2.25m-7.5 0h7.5m-7.5 0-1 3m8.5-3 1 3m0 0 .5 1.5m-.5-1.5h-9.5m0 0-.5 1.5m.75-9 3-3 2.148 2.148A12.061 12.061 0 0 1 16.5 7.605" />
              </svg>
              <p className="text-sm text-surface-500">Chart visualization coming soon</p>
              <p className="text-xs text-surface-400 mt-1">Integrate with Recharts or Victory</p>
            </div>
          </div>
        </div>

        {/* Top risks */}
        <div className="card">
          <div className="px-6 py-4 border-b border-surface-200">
            <h2 className="font-display font-semibold text-surface-900">Portfolio Risks</h2>
          </div>
          <div className="divide-y divide-surface-100">
            {[
              { title: 'Backend capacity at 115%', severity: 'high', initiative: 'API Gateway Migration' },
              { title: 'DevOps bottleneck identified', severity: 'medium', initiative: 'Multiple' },
              { title: 'Q2 deadline at risk', severity: 'medium', initiative: 'Mobile App v2' },
              { title: 'Budget variance >5%', severity: 'low', initiative: 'Data Pipeline' },
            ].map((risk) => (
              <div key={risk.title} className="px-6 py-4 flex items-start gap-3">
                <div className={`flex-shrink-0 w-2 h-2 rounded-full mt-2 ${
                  risk.severity === 'high' ? 'bg-danger' :
                  risk.severity === 'medium' ? 'bg-warning' : 'bg-surface-400'
                }`} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-surface-900">{risk.title}</p>
                  <p className="text-xs text-surface-500 mt-0.5">{risk.initiative}</p>
                </div>
                <span className={`badge ${
                  risk.severity === 'high' ? 'badge-danger' :
                  risk.severity === 'medium' ? 'badge-warning' : 'badge-default'
                }`}>
                  {risk.severity}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Recent activity */}
        <div className="card">
          <div className="px-6 py-4 border-b border-surface-200">
            <h2 className="font-display font-semibold text-surface-900">Recent Activity</h2>
          </div>
          <div className="divide-y divide-surface-100">
            {[
              { action: 'Status changed to In Progress', target: 'Customer Portal Redesign', time: '2h ago', user: 'Sarah C.' },
              { action: 'Allocation updated', target: 'Mike Johnson', time: '4h ago', user: 'Admin' },
              { action: 'New scope item added', target: 'API Gateway Migration', time: '1d ago', user: 'Mike J.' },
              { action: 'Scenario created', target: 'Aggressive Growth', time: '2d ago', user: 'Emily W.' },
            ].map((activity, i) => (
              <div key={i} className="px-6 py-4 flex items-center gap-3">
                <div className="flex-shrink-0 w-8 h-8 rounded-full bg-surface-100 flex items-center justify-center">
                  <span className="text-xs font-medium text-surface-600">{activity.user.split(' ')[0][0]}{activity.user.split(' ')[1]?.[0] || ''}</span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-surface-900">
                    <span className="font-medium">{activity.user}</span>
                    {' '}{activity.action}
                  </p>
                  <p className="text-xs text-surface-500 truncate">{activity.target}</p>
                </div>
                <span className="text-xs text-surface-400 whitespace-nowrap">{activity.time}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
