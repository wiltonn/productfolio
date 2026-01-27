const mockEmployees = [
  { id: '1', name: 'Sarah Chen', role: 'Senior Frontend Engineer', skills: ['Frontend', 'React'], capacity: 80, allocated: 65 },
  { id: '2', name: 'Mike Johnson', role: 'Backend Lead', skills: ['Backend', 'Go', 'PostgreSQL'], capacity: 100, allocated: 90 },
  { id: '3', name: 'Alex Rivera', role: 'Full Stack Developer', skills: ['Frontend', 'Backend', 'React'], capacity: 80, allocated: 40 },
  { id: '4', name: 'Emily Watson', role: 'Data Engineer', skills: ['Backend', 'Python', 'Data'], capacity: 100, allocated: 75 },
  { id: '5', name: 'James Lee', role: 'UI Designer', skills: ['Design', 'Figma'], capacity: 100, allocated: 85 },
];

const mockSkills = [
  { name: 'Frontend', employees: 8, totalCapacity: 640, utilized: 520 },
  { name: 'Backend', employees: 12, totalCapacity: 960, utilized: 780 },
  { name: 'Design', employees: 4, totalCapacity: 320, utilized: 280 },
  { name: 'Data', employees: 3, totalCapacity: 240, utilized: 180 },
  { name: 'DevOps', employees: 2, totalCapacity: 160, utilized: 140 },
];

export function Capacity() {
  return (
    <div className="animate-fade-in">
      <div className="page-header flex items-center justify-between">
        <div>
          <h1 className="page-title">Capacity Planning</h1>
          <p className="page-subtitle">Manage team members, skills, and availability</p>
        </div>
        <button className="btn-primary">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M18 7.5v3m0 0v3m0-3h3m-3 0h-3m-2.25-4.125a3.375 3.375 0 1 1-6.75 0 3.375 3.375 0 0 1 6.75 0ZM3 19.235v-.11a6.375 6.375 0 0 1 12.75 0v.109A12.318 12.318 0 0 1 9.374 21c-2.331 0-4.512-.645-6.374-1.766Z" />
          </svg>
          Add Employee
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Skills overview */}
        <div className="lg:col-span-1">
          <div className="card">
            <div className="px-5 py-4 border-b border-surface-200">
              <h2 className="font-display font-semibold text-surface-900">Skills Overview</h2>
            </div>
            <div className="divide-y divide-surface-100">
              {mockSkills.map((skill) => {
                const utilization = Math.round((skill.utilized / skill.totalCapacity) * 100);
                const isHigh = utilization > 80;

                return (
                  <div key={skill.name} className="px-5 py-4 hover:bg-surface-50 transition-colors">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-surface-900">{skill.name}</span>
                        <span className="text-xs text-surface-500">{skill.employees} members</span>
                      </div>
                      <span className={`text-sm font-mono ${isHigh ? 'text-warning' : 'text-success'}`}>
                        {utilization}%
                      </span>
                    </div>
                    <div className="h-2 bg-surface-100 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all duration-500 ${
                          isHigh ? 'bg-warning' : 'bg-success'
                        }`}
                        style={{ width: `${utilization}%` }}
                      />
                    </div>
                    <div className="mt-1 flex items-center justify-between text-xs text-surface-500">
                      <span>{skill.utilized}h allocated</span>
                      <span>{skill.totalCapacity}h total</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Employee list */}
        <div className="lg:col-span-2">
          <div className="card">
            <div className="px-5 py-4 border-b border-surface-200 flex items-center justify-between">
              <h2 className="font-display font-semibold text-surface-900">Team Members</h2>
              <input
                type="text"
                placeholder="Search team..."
                className="input w-48"
              />
            </div>
            <div className="divide-y divide-surface-100">
              {mockEmployees.map((employee) => {
                const utilization = Math.round((employee.allocated / employee.capacity) * 100);
                const availableHours = employee.capacity - employee.allocated;

                return (
                  <div
                    key={employee.id}
                    className="px-5 py-4 flex items-center gap-4 hover:bg-surface-50 transition-colors cursor-pointer group"
                  >
                    {/* Avatar */}
                    <div className="flex-shrink-0 w-10 h-10 rounded-full bg-gradient-to-br from-accent-400 to-accent-600 flex items-center justify-center">
                      <span className="text-sm font-semibold text-white">
                        {employee.name.split(' ').map((n) => n[0]).join('')}
                      </span>
                    </div>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="font-medium text-surface-900 truncate">{employee.name}</p>
                        <span className="text-xs text-surface-500">({employee.capacity}h/week)</span>
                      </div>
                      <p className="text-sm text-surface-500 truncate">{employee.role}</p>
                    </div>

                    {/* Skills */}
                    <div className="hidden md:flex items-center gap-1.5">
                      {employee.skills.slice(0, 3).map((skill) => (
                        <span key={skill} className="badge-default">
                          {skill}
                        </span>
                      ))}
                    </div>

                    {/* Capacity bar */}
                    <div className="w-32">
                      <div className="flex items-center justify-between text-xs mb-1">
                        <span className="text-surface-500">{utilization}% used</span>
                        <span className="font-mono text-surface-700">{availableHours}h free</span>
                      </div>
                      <div className="h-2 bg-surface-100 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all ${
                            utilization > 90
                              ? 'bg-danger'
                              : utilization > 70
                              ? 'bg-warning'
                              : 'bg-success'
                          }`}
                          style={{ width: `${utilization}%` }}
                        />
                      </div>
                    </div>

                    {/* Arrow */}
                    <svg
                      className="w-5 h-5 text-surface-400 group-hover:text-surface-600 transition-colors"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={2}
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" />
                    </svg>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
