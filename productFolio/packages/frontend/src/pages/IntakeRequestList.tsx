import { useState, useMemo, useCallback } from 'react';
import { Link } from 'react-router-dom';
import {
  useIntakeRequests,
  useIntakeRequestStats,
  usePipelineStats,
} from '../hooks/useIntakeRequests';
import { CreateIntakeRequestModal } from '../components/CreateIntakeRequestModal';
import type { IntakeRequestStatus, IntakeRequestFilters, IntakeRequest } from '../types/intake-request';

const STATUS_COLORS: Record<IntakeRequestStatus, { bg: string; text: string }> = {
  DRAFT: { bg: 'bg-surface-100', text: 'text-surface-600' },
  TRIAGE: { bg: 'bg-yellow-50', text: 'text-yellow-700' },
  ASSESSED: { bg: 'bg-orange-50', text: 'text-orange-700' },
  APPROVED: { bg: 'bg-emerald-50', text: 'text-emerald-700' },
  CONVERTED: { bg: 'bg-blue-50', text: 'text-blue-700' },
  CLOSED: { bg: 'bg-surface-50', text: 'text-surface-400' },
};

const URGENCY_COLORS: Record<string, string> = {
  CRITICAL: 'text-red-600',
  HIGH: 'text-orange-600',
  MEDIUM: 'text-yellow-600',
  LOW: 'text-surface-500',
};

function StatusBadge({ status }: { status: IntakeRequestStatus }) {
  const colors = STATUS_COLORS[status] || STATUS_COLORS.DRAFT;
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${colors.bg} ${colors.text}`}
    >
      {status.replace('_', ' ')}
    </span>
  );
}

function IntakeTable({ items }: { items: IntakeRequest[] }) {
  return (
    <table className="min-w-full divide-y divide-surface-200">
      <thead className="bg-surface-50">
        <tr>
          <th className="px-4 py-3 text-left text-xs font-medium text-surface-500 uppercase tracking-wider">
            Title
          </th>
          <th className="px-4 py-3 text-left text-xs font-medium text-surface-500 uppercase tracking-wider">
            Status
          </th>
          <th className="px-4 py-3 text-left text-xs font-medium text-surface-500 uppercase tracking-wider">
            Urgency
          </th>
          <th className="px-4 py-3 text-left text-xs font-medium text-surface-500 uppercase tracking-wider">
            Value
          </th>
          <th className="px-4 py-3 text-left text-xs font-medium text-surface-500 uppercase tracking-wider">
            Effort
          </th>
          <th className="px-4 py-3 text-left text-xs font-medium text-surface-500 uppercase tracking-wider">
            Quarter
          </th>
          <th className="px-4 py-3 text-left text-xs font-medium text-surface-500 uppercase tracking-wider">
            Linked Initiative
          </th>
          <th className="px-4 py-3 text-left text-xs font-medium text-surface-500 uppercase tracking-wider">
            Updated
          </th>
        </tr>
      </thead>
      <tbody className="divide-y divide-surface-100">
        {items.map((item) => (
          <tr
            key={item.id}
            className="hover:bg-surface-50 transition-colors"
          >
            <td className="px-4 py-3">
              <Link
                to={`/intake-requests/${item.id}`}
                className="text-sm font-medium text-surface-900 hover:text-accent-600"
              >
                {item.title}
              </Link>
              {item.customerName && (
                <div className="text-xs text-surface-400 mt-0.5">
                  {item.customerName}
                </div>
              )}
              {item.intakeItem && (
                <div className="text-xs text-surface-400 mt-0.5">
                  {item.intakeItem.jiraIssueUrl ? (
                    <a
                      href={item.intakeItem.jiraIssueUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-500 hover:text-blue-700"
                    >
                      {item.intakeItem.jiraIssueKey}
                    </a>
                  ) : (
                    item.intakeItem.jiraIssueKey
                  )}
                </div>
              )}
            </td>
            <td className="px-4 py-3">
              <StatusBadge status={item.status} />
            </td>
            <td className="px-4 py-3">
              <span
                className={`text-sm font-medium ${
                  URGENCY_COLORS[item.urgency || ''] || 'text-surface-400'
                }`}
              >
                {item.urgency || '-'}
              </span>
            </td>
            <td className="px-4 py-3 text-sm text-surface-600">
              {item.valueScore != null ? `${item.valueScore}/10` : '-'}
            </td>
            <td className="px-4 py-3 text-sm text-surface-600">
              {item.effortEstimate || '-'}
            </td>
            <td className="px-4 py-3 text-sm text-surface-600">
              {item.targetQuarter || '-'}
            </td>
            <td className="px-4 py-3">
              {item.initiative ? (
                <Link
                  to={`/initiatives/${item.initiative.id}`}
                  className="text-sm text-accent-600 hover:text-accent-700"
                >
                  {item.initiative.title}
                </Link>
              ) : (
                <span className="text-sm text-surface-400">-</span>
              )}
            </td>
            <td className="px-4 py-3 text-sm text-surface-400">
              {new Date(item.updatedAt).toLocaleDateString()}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function IntakeRequestList() {
  const [filters, setFilters] = useState<IntakeRequestFilters>({
    page: 1,
    limit: 100,
  });
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [showCreateModal, setShowCreateModal] = useState(false);

  // Group collapse state (all collapsed by default)
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());

  const effectiveFilters = useMemo(
    () => ({
      ...filters,
      search: search || undefined,
      status: (statusFilter as IntakeRequestStatus) || undefined,
    }),
    [filters, search, statusFilter]
  );

  const { data, isLoading } = useIntakeRequests(effectiveFilters);
  const { data: stats } = useIntakeRequestStats();
  const { data: pipeline } = usePipelineStats();

  const items = data?.data ?? [];
  const pagination = data?.pagination;

  const toggleGroup = useCallback((groupId: string) => {
    setExpandedGroups(prev => {
      const next = new Set(prev);
      if (next.has(groupId)) next.delete(groupId);
      else next.add(groupId);
      return next;
    });
  }, []);

  // Group intake requests by portfolio area
  const groupedItems = useMemo(() => {
    const groups = new Map<string, { id: string; name: string; items: IntakeRequest[] }>();

    for (const item of items) {
      const areaId = item.portfolioArea?.id ?? 'unassigned';
      const areaName = item.portfolioArea?.name ?? 'Unassigned';
      if (!groups.has(areaId)) {
        groups.set(areaId, { id: areaId, name: areaName, items: [] });
      }
      groups.get(areaId)!.items.push(item);
    }

    const sorted = Array.from(groups.values()).sort((a, b) => {
      if (a.id === 'unassigned') return 1;
      if (b.id === 'unassigned') return -1;
      return a.name.localeCompare(b.name);
    });

    return sorted;
  }, [items]);

  const toggleAllGroups = useCallback(() => {
    setExpandedGroups(prev => {
      if (prev.size === groupedItems.length) {
        return new Set();
      }
      return new Set(groupedItems.map(g => g.id));
    });
  }, [groupedItems]);

  const hasActiveFilters = search || statusFilter;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-surface-900">
            Intake Pipeline
          </h1>
          <p className="mt-1 text-sm text-surface-500">
            Track and manage intake requests through the approval pipeline
          </p>
        </div>
        <button
          onClick={() => setShowCreateModal(true)}
          className="inline-flex items-center px-4 py-2 bg-accent-600 text-white text-sm font-medium rounded-lg hover:bg-accent-700 transition-colors"
        >
          New Intake Request
        </button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
        {stats?.byStatus.map((s) => (
          <div
            key={s.status}
            className="bg-white rounded-lg border border-surface-200 p-4"
          >
            <div className="text-sm text-surface-500">{s.status}</div>
            <div className="mt-1 text-2xl font-semibold text-surface-900">
              {s.count}
            </div>
          </div>
        ))}
        {pipeline && (
          <>
            <div className="bg-white rounded-lg border border-surface-200 p-4">
              <div className="text-sm text-surface-500">Intake Coverage</div>
              <div className="mt-1 text-2xl font-semibold text-blue-600">
                {pipeline.coverage.intakeCoveragePct}%
              </div>
            </div>
            <div className="bg-white rounded-lg border border-surface-200 p-4">
              <div className="text-sm text-surface-500">Leakage</div>
              <div className="mt-1 text-2xl font-semibold text-amber-600">
                {pipeline.coverage.intakeLeakagePct}%
              </div>
            </div>
          </>
        )}
      </div>

      {/* Filters */}
      <div className="flex items-center gap-4">
        <div className="flex-1">
          <input
            type="text"
            placeholder="Search intake requests..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setFilters((f) => ({ ...f, page: 1 }));
            }}
            className="w-full px-3 py-2 border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-accent-500"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => {
            setStatusFilter(e.target.value);
            setFilters((f) => ({ ...f, page: 1 }));
          }}
          className="px-3 py-2 border border-surface-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-accent-500"
        >
          <option value="">All Statuses</option>
          <option value="DRAFT">Draft</option>
          <option value="TRIAGE">Triage</option>
          <option value="ASSESSED">Assessed</option>
          <option value="APPROVED">Approved</option>
          <option value="CONVERTED">Converted</option>
          <option value="CLOSED">Closed</option>
        </select>
        {hasActiveFilters && (
          <button
            onClick={() => {
              setSearch('');
              setStatusFilter('');
              setFilters((f) => ({ ...f, page: 1 }));
            }}
            className="text-sm text-surface-500 hover:text-surface-700 transition-colors"
          >
            Clear filters
          </button>
        )}
      </div>

      {/* Grouped Table */}
      <div className="bg-white rounded-lg border border-surface-200 overflow-hidden">
        {/* Header bar */}
        <div className="px-4 py-3 border-b border-surface-200 bg-surface-50/50 flex items-center justify-between">
          <span className="text-sm text-surface-500 tabular-nums font-medium">
            {items.length.toLocaleString()} request{items.length !== 1 ? 's' : ''}
          </span>
          {groupedItems.length > 1 && (
            <button
              onClick={toggleAllGroups}
              className="text-xs text-accent-600 hover:text-accent-700 font-medium transition-colors"
            >
              {expandedGroups.size === groupedItems.length ? 'Collapse All' : 'Expand All'}
            </button>
          )}
        </div>

        {isLoading ? (
          <div className="px-4 py-12 text-center text-surface-400">
            Loading...
          </div>
        ) : items.length === 0 ? (
          <div className="px-4 py-12 text-center text-surface-400">
            {hasActiveFilters
              ? 'No intake requests match your filters'
              : 'No intake requests yet. Create your first one!'}
          </div>
        ) : (
          <div>
            {groupedItems.map((group) => {
              const isExpanded = expandedGroups.has(group.id);
              return (
                <div key={group.id}>
                  {/* Group header */}
                  <div
                    onClick={() => toggleGroup(group.id)}
                    className="flex items-center justify-between px-4 py-3 bg-surface-50 border-b border-surface-200 cursor-pointer hover:bg-surface-100 transition-colors select-none"
                  >
                    <div className="flex items-center gap-2">
                      <svg
                        className={`w-4 h-4 text-surface-500 transition-transform duration-200 ${isExpanded ? 'rotate-90' : ''}`}
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        strokeWidth={2}
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                      </svg>
                      <span className="font-semibold text-sm text-surface-800">
                        {group.name}
                      </span>
                    </div>
                    <span className="text-xs text-surface-500 bg-surface-200 px-2 py-0.5 rounded-full">
                      {group.items.length}
                    </span>
                  </div>

                  {/* Group table */}
                  {isExpanded && (
                    <IntakeTable items={group.items} />
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Pagination */}
        {pagination && pagination.totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-surface-200 bg-surface-50">
            <div className="text-sm text-surface-500">
              Showing {(pagination.page - 1) * pagination.limit + 1}-
              {Math.min(pagination.page * pagination.limit, pagination.total)} of{' '}
              {pagination.total}
            </div>
            <div className="flex gap-2">
              <button
                onClick={() =>
                  setFilters((f) => ({ ...f, page: (f.page ?? 1) - 1 }))
                }
                disabled={pagination.page <= 1}
                className="px-3 py-1 text-sm border border-surface-300 rounded-md hover:bg-surface-100 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Previous
              </button>
              <button
                onClick={() =>
                  setFilters((f) => ({ ...f, page: (f.page ?? 1) + 1 }))
                }
                disabled={pagination.page >= pagination.totalPages}
                className="px-3 py-1 text-sm border border-surface-300 rounded-md hover:bg-surface-100 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Create Modal */}
      {showCreateModal && (
        <CreateIntakeRequestModal
          onClose={() => setShowCreateModal(false)}
        />
      )}
    </div>
  );
}
