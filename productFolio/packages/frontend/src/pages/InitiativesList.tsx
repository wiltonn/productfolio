import { useState, useMemo, useCallback, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { type ColumnDef, type SortingState, type RowSelectionState } from '@tanstack/react-table';
import {
  VirtualTable,
  MultiSelect,
  Select,
  SearchInput,
  StatusBadge,
  Checkbox,
  BulkActionsBar,
} from '../components/ui';
import { CreateInitiativeModal } from '../components/CreateInitiativeModal';
import { OriginBadge } from '../components/OriginBadge';
import {
  useInitiatives,
  useInitiativeAllocationHoursByType,
  useBulkUpdateStatus,
  useBulkDeleteInitiatives,
  useExportInitiatives,
} from '../hooks/useInitiatives';
import { useOrgTree } from '../hooks/useOrgTree';
import type { Initiative, InitiativeStatus, InitiativeFilters, OrgNode } from '../types';
import { getQuarterOptions } from '../types';

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

// Status filter options
const statusOptions = [
  { value: 'PROPOSED', label: 'Proposed' },
  { value: 'SCOPING', label: 'Scoping' },
  { value: 'RESOURCING', label: 'Resourcing' },
  { value: 'IN_EXECUTION', label: 'In Execution' },
  { value: 'COMPLETE', label: 'Complete' },
  { value: 'ON_HOLD', label: 'On Hold' },
  { value: 'CANCELLED', label: 'Cancelled' },
];

// Quarter options
const quarterOptions = getQuarterOptions();

// Origin filter options
const originOptions = [
  { value: 'INTAKE_CONVERTED', label: 'Intake-origin' },
  { value: 'DIRECT_PM', label: 'Non-Intake scope' },
  { value: 'LEGACY', label: 'Legacy' },
];

export function InitiativesList() {
  const navigate = useNavigate();

  // Filter state
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string[]>([]);
  const [quarterFilter, setQuarterFilter] = useState('');
  const [originFilter, setOriginFilter] = useState('');
  const [orgNodeFilter, setOrgNodeFilter] = useState('');

  // Org tree for dropdown
  const { data: orgTree } = useOrgTree();
  const orgNodeOptions = useMemo(() => {
    const flat = flattenOrgTree(orgTree ?? []);
    return flat.map((n) => ({
      value: n.id,
      label: '\u00A0\u00A0'.repeat(n.depth) + n.name,
    }));
  }, [orgTree]);

  // Table state
  const [sorting, setSorting] = useState<SortingState>([]);
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});

  // Modal state
  const [showCreateModal, setShowCreateModal] = useState(false);

  // Group collapse state (all collapsed by default)
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());

  // Build filters object
  const filters: InitiativeFilters = useMemo(
    () => ({
      search: search || undefined,
      status: statusFilter.length > 0 ? (statusFilter as InitiativeStatus[]) : undefined,
      targetQuarter: quarterFilter || undefined,
      origin: originFilter || undefined,
      orgNodeId: orgNodeFilter || undefined,
      limit: 100, // Backend max is 100
    }),
    [search, statusFilter, quarterFilter, originFilter, orgNodeFilter]
  );

  // API hooks
  const { data: apiData, isLoading } = useInitiatives(filters);
  const bulkUpdateStatus = useBulkUpdateStatus();
  const bulkDelete = useBulkDeleteInitiatives();
  const exportMutation = useExportInitiatives();

  // Quarter dates for allocation hours
  const quarterDates = useMemo(() => {
    const now = new Date();
    const currentQ = Math.floor(now.getMonth() / 3);
    const currentYear = now.getFullYear();

    const currentQStart = new Date(currentYear, currentQ * 3, 1);
    const currentQEnd = new Date(currentYear, currentQ * 3 + 3, 0);

    const nextQ = (currentQ + 1) % 4;
    const nextYear = currentQ === 3 ? currentYear + 1 : currentYear;
    const nextQStart = new Date(nextYear, nextQ * 3, 1);
    const nextQEnd = new Date(nextYear, nextQ * 3 + 3, 0);

    const qLabel = (q: number, y: number) => `Q${q + 1} ${y}`;

    return {
      currentQStart: currentQStart.toISOString().split('T')[0],
      currentQEnd: currentQEnd.toISOString().split('T')[0],
      nextQStart: nextQStart.toISOString().split('T')[0],
      nextQEnd: nextQEnd.toISOString().split('T')[0],
      currentLabel: qLabel(currentQ, currentYear),
      nextLabel: qLabel(nextQ, nextYear),
    };
  }, []);

  // Use API data
  const initiatives = apiData?.data ?? [];

  // Fetch allocation hours for loaded initiatives
  const initiativeIds = useMemo(
    () => initiatives.map((i) => i.id),
    [initiatives]
  );

  const { data: allocationHoursMap } = useInitiativeAllocationHoursByType(
    initiativeIds,
    quarterDates.currentQStart,
    quarterDates.currentQEnd,
    quarterDates.nextQStart,
    quarterDates.nextQEnd
  );

  // Get selected IDs
  const selectedIds = useMemo(
    () => Object.keys(rowSelection).filter((id) => rowSelection[id]),
    [rowSelection]
  );

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Escape to clear selection
      if (e.key === 'Escape' && selectedIds.length > 0) {
        setRowSelection({});
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [selectedIds.length]
  );

  // Stats computed from real data
  const stats = useMemo(() => {
    const total = apiData?.pagination?.total ?? initiatives.length;
    const inExecution = initiatives.filter((i) => i.status === 'IN_EXECUTION').length;
    const scopingResourcing = initiatives.filter((i) => i.status === 'SCOPING' || i.status === 'RESOURCING').length;
    const complete = initiatives.filter((i) => i.status === 'COMPLETE').length;
    return { total, inExecution, scopingResourcing, complete };
  }, [apiData?.pagination?.total, initiatives]);

  // Handlers
  const handleStatusChange = useCallback(
    (status: InitiativeStatus) => {
      bulkUpdateStatus.mutate({ ids: selectedIds, status });
      setRowSelection({});
    },
    [selectedIds, bulkUpdateStatus]
  );

  const handleDelete = useCallback(() => {
    if (window.confirm(`Delete ${selectedIds.length} initiative(s)?`)) {
      bulkDelete.mutate(selectedIds);
      setRowSelection({});
    }
  }, [selectedIds, bulkDelete]);

  const handleExport = useCallback(() => {
    exportMutation.mutate(filters);
  }, [filters, exportMutation]);

  const handleRowClick = useCallback(
    (row: Initiative) => {
      navigate(`/initiatives/${row.id}`);
    },
    [navigate]
  );

  const toggleGroup = useCallback((groupId: string) => {
    setExpandedGroups(prev => {
      const next = new Set(prev);
      if (next.has(groupId)) next.delete(groupId);
      else next.add(groupId);
      return next;
    });
  }, []);

  // Group initiatives by portfolio area
  const groupedInitiatives = useMemo(() => {
    const groups = new Map<string, { id: string; name: string; initiatives: Initiative[] }>();

    for (const init of initiatives) {
      const areaId = init.orgNode?.id ?? init.portfolioArea?.id ?? 'unassigned';
      const areaName = init.orgNode?.name ?? init.portfolioArea?.name ?? 'Unassigned';
      if (!groups.has(areaId)) {
        groups.set(areaId, { id: areaId, name: areaName, initiatives: [] });
      }
      groups.get(areaId)!.initiatives.push(init);
    }

    const sorted = Array.from(groups.values()).sort((a, b) => {
      if (a.id === 'unassigned') return 1;
      if (b.id === 'unassigned') return -1;
      return a.name.localeCompare(b.name);
    });

    return sorted;
  }, [initiatives]);

  const toggleAllGroups = useCallback(() => {
    setExpandedGroups(prev => {
      if (prev.size === groupedInitiatives.length) {
        return new Set();
      }
      return new Set(groupedInitiatives.map(g => g.id));
    });
  }, [groupedInitiatives]);

  // Column definitions
  const columns = useMemo<ColumnDef<Initiative, unknown>[]>(
    () => [
      {
        id: 'select',
        size: 40,
        header: ({ table }) => (
          <Checkbox
            checked={table.getIsAllPageRowsSelected()}
            indeterminate={table.getIsSomePageRowsSelected()}
            onChange={table.getToggleAllPageRowsSelectedHandler()}
          />
        ),
        cell: ({ row }) => (
          <div onClick={(e) => e.stopPropagation()}>
            <Checkbox
              checked={row.getIsSelected()}
              onChange={row.getToggleSelectedHandler()}
            />
          </div>
        ),
        enableSorting: false,
      },
      {
        accessorKey: 'title',
        header: 'Title',
        size: 320,
        cell: ({ row }) => (
          <div className="flex flex-col gap-0.5">
            <Link
              to={`/initiatives/${row.original.id}`}
              onClick={(e) => e.stopPropagation()}
              className="font-medium text-surface-900 hover:text-accent-600 transition-colors line-clamp-1"
            >
              {row.original.title}
            </Link>
            {row.original.description && (
              <span className="text-xs text-surface-500 line-clamp-1">
                {row.original.description}
              </span>
            )}
          </div>
        ),
      },
      {
        accessorKey: 'status',
        header: 'Status',
        size: 120,
        cell: ({ row }) => <StatusBadge status={row.original.status} />,
      },
      {
        accessorKey: 'origin',
        header: 'Origin',
        size: 110,
        cell: ({ row }) => <OriginBadge origin={row.original.origin} />,
      },
      {
        id: 'productLeader',
        header: 'Product Leader',
        size: 160,
        cell: ({ row }) => {
          const leader = row.original.productLeader;
          if (!leader) return <span className="text-surface-400">-</span>;
          return (
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded-full bg-gradient-to-br from-accent-400 to-accent-600 flex items-center justify-center text-[10px] font-bold text-white">
                {leader.name
                  .split(' ')
                  .map((n) => n[0])
                  .join('')}
              </div>
              <span className="text-surface-700 truncate">{leader.name}</span>
            </div>
          );
        },
      },
      {
        accessorKey: 'targetQuarter',
        header: 'Quarter',
        size: 100,
        cell: ({ row }) => (
          <span className="font-mono text-xs text-surface-600 bg-surface-100 px-2 py-1 rounded">
            {row.original.targetQuarter || '-'}
          </span>
        ),
      },
      {
        id: 'currentQActual',
        header: `Actual (${quarterDates.currentLabel})`,
        size: 100,
        cell: ({ row }) => {
          const data = allocationHoursMap?.[row.original.id];
          const hours = data?.currentQuarter?.actualHours ?? 0;
          return (
            <Link
              to={`/initiatives/${row.original.id}?tab=assignments`}
              onClick={(e) => e.stopPropagation()}
              className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-mono font-semibold tabular-nums hover:underline transition-colors"
              title="Actual hours (locked primary scenario)"
            >
              <span className={hours === 0 ? 'text-surface-400' : 'text-emerald-700'}>
                {hours === 0 ? '-' : `${hours}h`}
              </span>
            </Link>
          );
        },
        enableSorting: false,
      },
      {
        id: 'currentQProposed',
        header: `Proposed (${quarterDates.currentLabel})`,
        size: 130,
        cell: ({ row }) => {
          const data = allocationHoursMap?.[row.original.id];
          const hours = data?.currentQuarter?.proposedHours ?? 0;
          const count = data?.currentQuarter?.proposedScenarioCount ?? 0;
          return (
            <Link
              to={`/initiatives/${row.original.id}?tab=assignments`}
              onClick={(e) => e.stopPropagation()}
              className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-mono font-semibold tabular-nums hover:underline transition-colors"
              title="Proposed hours across scenarios"
            >
              <span className={hours === 0 ? 'text-surface-400' : 'text-amber-700'}>
                {hours === 0 ? '-' : `${hours}h (${count})`}
              </span>
            </Link>
          );
        },
        enableSorting: false,
      },
      {
        id: 'nextQActual',
        header: `Actual (${quarterDates.nextLabel})`,
        size: 100,
        cell: ({ row }) => {
          const data = allocationHoursMap?.[row.original.id];
          const hours = data?.nextQuarter?.actualHours ?? 0;
          return (
            <Link
              to={`/initiatives/${row.original.id}?tab=assignments`}
              onClick={(e) => e.stopPropagation()}
              className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-mono font-semibold tabular-nums hover:underline transition-colors"
              title="Actual hours (locked primary scenario)"
            >
              <span className={hours === 0 ? 'text-surface-400' : 'text-emerald-700'}>
                {hours === 0 ? '-' : `${hours}h`}
              </span>
            </Link>
          );
        },
        enableSorting: false,
      },
      {
        id: 'nextQProposed',
        header: `Proposed (${quarterDates.nextLabel})`,
        size: 130,
        cell: ({ row }) => {
          const data = allocationHoursMap?.[row.original.id];
          const hours = data?.nextQuarter?.proposedHours ?? 0;
          const count = data?.nextQuarter?.proposedScenarioCount ?? 0;
          return (
            <Link
              to={`/initiatives/${row.original.id}?tab=assignments`}
              onClick={(e) => e.stopPropagation()}
              className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-mono font-semibold tabular-nums hover:underline transition-colors"
              title="Proposed hours across scenarios"
            >
              <span className={hours === 0 ? 'text-surface-400' : 'text-amber-700'}>
                {hours === 0 ? '-' : `${hours}h (${count})`}
              </span>
            </Link>
          );
        },
        enableSorting: false,
      },
      {
        accessorKey: 'updatedAt',
        header: 'Updated',
        size: 100,
        cell: ({ row }) => (
          <span className="text-xs text-surface-500 font-mono">
            {new Date(row.original.updatedAt).toLocaleDateString('en-US', {
              month: 'short',
              day: 'numeric',
            })}
          </span>
        ),
      },
    ],
    [quarterDates, allocationHoursMap]
  );

  const hasActiveFilters = search || statusFilter.length > 0 || quarterFilter || originFilter || orgNodeFilter;

  return (
    <div className="animate-fade-in">
      {/* Header */}
      <div className="page-header flex items-center justify-between">
        <div>
          <h1 className="page-title">Initiatives</h1>
          <p className="page-subtitle">Manage and track your portfolio initiatives</p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={handleExport}
            disabled={exportMutation.isPending}
            className="btn-secondary"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
            Export CSV
          </button>
          <button className="btn-primary" onClick={() => setShowCreateModal(true)}>
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
            New Initiative
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        {[
          {
            label: 'Total Initiatives',
            value: stats.total.toLocaleString(),
            icon: (
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 12h16.5m-16.5 3.75h16.5M3.75 19.5h16.5M5.625 4.5h12.75a1.875 1.875 0 010 3.75H5.625a1.875 1.875 0 010-3.75z" />
              </svg>
            ),
          },
          {
            label: 'In Execution',
            value: stats.inExecution.toString(),
            accent: 'text-emerald-600',
            icon: (
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.348a1.125 1.125 0 010 1.971l-11.54 6.347a1.125 1.125 0 01-1.667-.985V5.653z" />
              </svg>
            ),
          },
          {
            label: 'Scoping / Resourcing',
            value: stats.scopingResourcing.toString(),
            accent: 'text-amber-600',
            icon: (
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            ),
          },
          {
            label: 'Complete',
            value: stats.complete.toString(),
            accent: 'text-violet-600',
            icon: (
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            ),
          },
        ].map((stat, i) => (
          <div key={stat.label} className={`stat-card animate-slide-up stagger-${i + 1}`}>
            <div className="flex items-start justify-between">
              <div>
                <p className="stat-label">{stat.label}</p>
                <p className={`stat-value ${stat.accent || ''}`}>{stat.value}</p>
              </div>
              <div className={`p-2 rounded-lg bg-surface-100 ${stat.accent || 'text-surface-500'}`}>
                {stat.icon}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Main table card */}
      <div className="card overflow-hidden">
        {/* Filter bar */}
        <div className="px-4 py-3 border-b border-surface-200 bg-surface-50/50">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3 flex-1">
              <SearchInput
                value={search}
                onChange={setSearch}
                placeholder="Search initiatives..."
                className="w-72"
              />
              <MultiSelect
                options={statusOptions}
                value={statusFilter}
                onChange={setStatusFilter}
                placeholder="Status"
                className="w-44"
              />
              <Select
                options={quarterOptions}
                value={quarterFilter}
                onChange={setQuarterFilter}
                placeholder="Quarter"
                className="w-36"
              />
              <Select
                options={originOptions}
                value={originFilter}
                onChange={setOriginFilter}
                placeholder="Origin"
                className="w-40"
              />
              <Select
                options={orgNodeOptions}
                value={orgNodeFilter}
                onChange={setOrgNodeFilter}
                placeholder="Org Unit"
                className="w-44"
              />
              {hasActiveFilters && (
                <button
                  onClick={() => {
                    setSearch('');
                    setStatusFilter([]);
                    setQuarterFilter('');
                    setOriginFilter('');
                    setOrgNodeFilter('');
                  }}
                  className="text-sm text-surface-500 hover:text-surface-700 transition-colors"
                >
                  Clear filters
                </button>
              )}
            </div>
            <div className="flex items-center gap-3 text-sm text-surface-500">
              <span className="tabular-nums font-medium">
                {initiatives.length.toLocaleString()} initiative{initiatives.length !== 1 ? 's' : ''}
              </span>
              {groupedInitiatives.length > 0 && (
                <button
                  onClick={toggleAllGroups}
                  className="text-xs text-accent-600 hover:text-accent-700 font-medium transition-colors"
                >
                  {expandedGroups.size === groupedInitiatives.length ? 'Collapse All' : 'Expand All'}
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Grouped Tables */}
        {isLoading ? (
          <div className="flex items-center justify-center py-16 text-surface-400">
            <svg className="animate-spin h-5 w-5 mr-3" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
            </svg>
            Loading initiatives...
          </div>
        ) : groupedInitiatives.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-surface-400">
            <p className="text-sm">
              {hasActiveFilters
                ? 'No initiatives match your filters'
                : 'No initiatives yet. Create your first one!'}
            </p>
          </div>
        ) : (
          <div>
            {groupedInitiatives.map((group) => {
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
                      {group.initiatives.length}
                    </span>
                  </div>

                  {/* Group initiatives table */}
                  {isExpanded && (
                    <VirtualTable
                      data={group.initiatives}
                      columns={columns}
                      sorting={sorting}
                      onSortingChange={setSorting}
                      enableRowSelection
                      rowSelection={rowSelection}
                      onRowSelectionChange={setRowSelection}
                      globalFilter={search}
                      onRowClick={handleRowClick}
                      getRowId={(row) => row.id}
                      isLoading={false}
                      emptyMessage="No initiatives in this group"
                    />
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Footer */}
        <div className="px-4 py-3 border-t border-surface-200 bg-surface-50/30 flex items-center justify-between text-sm">
          <span className="text-surface-500">
            {selectedIds.length > 0 ? (
              <span>
                <span className="font-medium text-surface-700">{selectedIds.length}</span> selected
              </span>
            ) : (
              <span>
                Showing{' '}
                <span className="font-medium text-surface-700">
                  {initiatives.length.toLocaleString()}
                </span>{' '}
                initiatives
              </span>
            )}
          </span>
          <div className="flex items-center gap-2 text-xs text-surface-400">
            <kbd className="px-1.5 py-0.5 bg-surface-100 border border-surface-200 rounded">
              Shift
            </kbd>
            <span>+ Click for range select</span>
          </div>
        </div>
      </div>

      {/* Bulk actions bar */}
      {selectedIds.length > 0 && (
        <BulkActionsBar
          selectedCount={selectedIds.length}
          onClearSelection={() => setRowSelection({})}
          onStatusChange={handleStatusChange}
          onAddTags={() => {}}
          onDelete={handleDelete}
        />
      )}

      {/* Create Initiative Modal */}
      <CreateInitiativeModal
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
      />
    </div>
  );
}
