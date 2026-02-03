import { useState, useMemo, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { useIntakeItems, useIntakeStats } from '../hooks/useIntake';
import { CreateIntakeRequestModal } from '../components/CreateIntakeRequestModal';
import type { IntakeFilters, IntakeItem } from '../types/intake';

const STATUS_CATEGORIES = [
  { value: '', label: 'All Statuses' },
  { value: 'To Do', label: 'To Do' },
  { value: 'In Progress', label: 'In Progress' },
  { value: 'Done', label: 'Done' },
];

const PRIORITIES = [
  { value: '', label: 'All Priorities' },
  { value: 'Highest', label: 'Highest' },
  { value: 'High', label: 'High' },
  { value: 'Medium', label: 'Medium' },
  { value: 'Low', label: 'Low' },
  { value: 'Lowest', label: 'Lowest' },
];

export function IntakeList() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [statusCategory, setStatusCategory] = useState('');
  const [priorityName, setPriorityName] = useState('');
  const [linked, setLinked] = useState('');
  const [sortBy, setSortBy] = useState('jiraUpdatedAt');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [selectedJiraItem, setSelectedJiraItem] = useState<IntakeItem | null>(null);

  const filters = useMemo<IntakeFilters>(() => ({
    page,
    limit: 25,
    search: search || undefined,
    statusCategory: statusCategory || undefined,
    priorityName: priorityName || undefined,
    linked: linked || undefined,
    sortBy,
    sortOrder,
  }), [page, search, statusCategory, priorityName, linked, sortBy, sortOrder]);

  const { data, isLoading } = useIntakeItems(filters);
  const { data: stats } = useIntakeStats();

  const handleSort = useCallback((column: string) => {
    if (sortBy === column) {
      setSortOrder(o => o === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(column);
      setSortOrder('desc');
    }
    setPage(1);
  }, [sortBy]);

  const handleSearchChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setSearch(e.target.value);
    setPage(1);
  }, []);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-display font-bold text-surface-900">Jira Items</h1>
          <p className="mt-1 text-sm text-surface-500">
            Jira issues synced from connected projects. Review, filter, and create intake requests.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Link to="/intake-requests" className="btn-secondary text-sm">
            View Intake Pipeline
          </Link>
          <button
            className="btn-primary text-sm"
            onClick={() => { setSelectedJiraItem(null); setShowCreateModal(true); }}
          >
            New Intake Request
          </button>
        </div>
      </div>

      {/* Stats Cards */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
          <StatCard label="Total Active" value={stats.totalActive} />
          <StatCard label="Linked" value={stats.linked} color="green" />
          <StatCard label="Unlinked" value={stats.unlinked} color="orange" />
          <StatCard label="Updated (7d)" value={stats.recentlyUpdated} color="blue" />
          {stats.byStatusCategory.slice(0, 2).map(cat => (
            <StatCard key={cat.statusCategory} label={cat.statusCategory} value={cat.count} />
          ))}
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex-1 min-w-[200px] max-w-md">
          <input
            type="text"
            value={search}
            onChange={handleSearchChange}
            placeholder="Search issues, keys, assignees..."
            className="w-full px-3 py-2 text-sm border border-surface-300 rounded-lg bg-white placeholder-surface-400 focus:outline-none focus:ring-2 focus:ring-accent-500 focus:border-transparent"
          />
        </div>
        <select
          value={statusCategory}
          onChange={(e) => { setStatusCategory(e.target.value); setPage(1); }}
          className="px-3 py-2 text-sm border border-surface-300 rounded-lg bg-white"
        >
          {STATUS_CATEGORIES.map(o => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
        <select
          value={priorityName}
          onChange={(e) => { setPriorityName(e.target.value); setPage(1); }}
          className="px-3 py-2 text-sm border border-surface-300 rounded-lg bg-white"
        >
          {PRIORITIES.map(o => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
        <select
          value={linked}
          onChange={(e) => { setLinked(e.target.value); setPage(1); }}
          className="px-3 py-2 text-sm border border-surface-300 rounded-lg bg-white"
        >
          <option value="">All Items</option>
          <option value="true">Linked</option>
          <option value="false">Unlinked</option>
        </select>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-surface-200 overflow-hidden">
        {isLoading ? (
          <div className="flex items-center justify-center h-64">
            <div className="flex items-center gap-3 text-surface-500">
              <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
              <span className="text-sm font-medium">Loading intake items...</span>
            </div>
          </div>
        ) : !data?.data?.length ? (
          <div className="text-center py-16">
            <p className="text-surface-500 text-sm">
              {search || statusCategory || priorityName || linked
                ? 'No items match the current filters.'
                : 'No intake items yet. Connect Jira and sync to get started.'}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-surface-50 border-b border-surface-200">
                  <SortableHeader label="Key" column="jiraIssueKey" current={sortBy} order={sortOrder} onSort={handleSort} />
                  <SortableHeader label="Summary" column="summary" current={sortBy} order={sortOrder} onSort={handleSort} />
                  <th className="text-left py-3 px-4 font-medium text-surface-600">Type</th>
                  <th className="text-left py-3 px-4 font-medium text-surface-600">Status</th>
                  <SortableHeader label="Priority" column="priorityName" current={sortBy} order={sortOrder} onSort={handleSort} />
                  <th className="text-left py-3 px-4 font-medium text-surface-600">Assignee</th>
                  <SortableHeader label="Updated" column="jiraUpdatedAt" current={sortBy} order={sortOrder} onSort={handleSort} />
                  <th className="text-left py-3 px-4 font-medium text-surface-600">Linked</th>
                </tr>
              </thead>
              <tbody>
                {data.data.map((item: IntakeItem) => (
                  <tr key={item.id} className="border-b border-surface-100 hover:bg-surface-50 transition-colors">
                    <td className="py-3 px-4">
                      {item.jiraIssueUrl ? (
                        <a
                          href={item.jiraIssueUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-accent-600 hover:text-accent-700 font-mono text-xs font-medium"
                        >
                          {item.jiraIssueKey}
                        </a>
                      ) : (
                        <span className="font-mono text-xs text-surface-700">{item.jiraIssueKey}</span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-surface-900 max-w-md truncate" title={item.summary}>
                      {item.summary}
                    </td>
                    <td className="py-3 px-4 text-surface-600">{item.issueTypeName || '-'}</td>
                    <td className="py-3 px-4">
                      <StatusCategoryBadge category={item.statusCategory} name={item.statusName} />
                    </td>
                    <td className="py-3 px-4">
                      <PriorityBadge priority={item.priorityName} />
                    </td>
                    <td className="py-3 px-4 text-surface-600 text-xs">{item.assigneeName || '-'}</td>
                    <td className="py-3 px-4 text-surface-500 text-xs">
                      {item.jiraUpdatedAt ? new Date(item.jiraUpdatedAt).toLocaleDateString() : '-'}
                    </td>
                    <td className="py-3 px-4">
                      {item.initiative ? (
                        <Link
                          to={`/initiatives/${item.initiative.id}`}
                          className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-700 hover:bg-green-200 transition-colors"
                          title={item.initiative.title}
                        >
                          {item.initiative.title.slice(0, 20)}{item.initiative.title.length > 20 ? '...' : ''}
                        </Link>
                      ) : (
                        <button
                          onClick={() => { setSelectedJiraItem(item); setShowCreateModal(true); }}
                          className="text-xs text-accent-600 hover:text-accent-700 font-medium transition-colors"
                        >
                          Create Request
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination */}
        {data?.pagination && data.pagination.totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-surface-200 bg-surface-50">
            <p className="text-xs text-surface-500">
              Showing {(data.pagination.page - 1) * data.pagination.limit + 1}-
              {Math.min(data.pagination.page * data.pagination.limit, data.pagination.total)} of {data.pagination.total}
            </p>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1}
                className="px-3 py-1.5 text-xs font-medium border border-surface-300 rounded-lg bg-white hover:bg-surface-50 disabled:opacity-50"
              >
                Previous
              </button>
              <span className="text-xs text-surface-500">
                Page {data.pagination.page} of {data.pagination.totalPages}
              </span>
              <button
                onClick={() => setPage(p => p + 1)}
                disabled={page >= data.pagination.totalPages}
                className="px-3 py-1.5 text-xs font-medium border border-surface-300 rounded-lg bg-white hover:bg-surface-50 disabled:opacity-50"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Create Intake Request Modal */}
      {showCreateModal && (
        <CreateIntakeRequestModal
          onClose={() => { setShowCreateModal(false); setSelectedJiraItem(null); }}
          prefill={selectedJiraItem ? {
            intakeItemId: selectedJiraItem.id,
            title: selectedJiraItem.summary,
            description: selectedJiraItem.descriptionExcerpt || undefined,
            sourceType: 'JIRA',
          } : undefined}
        />
      )}
    </div>
  );
}

function StatCard({ label, value, color }: { label: string; value: number; color?: string }) {
  const colorMap: Record<string, string> = {
    green: 'text-green-700',
    orange: 'text-orange-700',
    blue: 'text-blue-700',
  };

  return (
    <div className="bg-white rounded-lg border border-surface-200 p-4">
      <p className="text-xs text-surface-500 font-medium">{label}</p>
      <p className={`text-2xl font-bold mt-1 ${color ? colorMap[color] : 'text-surface-900'}`}>
        {value.toLocaleString()}
      </p>
    </div>
  );
}

function SortableHeader({
  label,
  column,
  current,
  order,
  onSort,
}: {
  label: string;
  column: string;
  current: string;
  order: string;
  onSort: (col: string) => void;
}) {
  const isActive = current === column;
  return (
    <th
      className="text-left py-3 px-4 font-medium text-surface-600 cursor-pointer select-none hover:text-surface-900"
      onClick={() => onSort(column)}
    >
      <span className="inline-flex items-center gap-1">
        {label}
        {isActive && (
          <span className="text-accent-500">{order === 'asc' ? '\u2191' : '\u2193'}</span>
        )}
      </span>
    </th>
  );
}

function StatusCategoryBadge({ category, name }: { category: string | null; name: string | null }) {
  if (!category && !name) return <span className="text-xs text-surface-400">-</span>;

  const categoryStyles: Record<string, string> = {
    'To Do': 'bg-surface-100 text-surface-600',
    'In Progress': 'bg-blue-100 text-blue-700',
    'Done': 'bg-green-100 text-green-700',
  };

  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${categoryStyles[category || ''] || 'bg-surface-100 text-surface-600'}`}>
      {name || category}
    </span>
  );
}

function PriorityBadge({ priority }: { priority: string | null }) {
  if (!priority) return <span className="text-xs text-surface-400">-</span>;

  const styles: Record<string, string> = {
    Highest: 'text-red-600',
    High: 'text-orange-600',
    Medium: 'text-yellow-600',
    Low: 'text-blue-600',
    Lowest: 'text-surface-500',
  };

  return (
    <span className={`text-xs font-medium ${styles[priority] || 'text-surface-600'}`}>
      {priority}
    </span>
  );
}
