import { useState, useMemo, useCallback, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { type ColumnDef, type SortingState, type RowSelectionState } from '@tanstack/react-table';
import {
  VirtualTable,
  MultiSelect,
  Select,
  SearchInput,
  StatusBadge,
  Tag,
  Checkbox,
  BulkActionsBar,
} from '../components/ui';
import { CreateInitiativeModal } from '../components/CreateInitiativeModal';
import {
  useInitiatives,
  useInitiativeAllocationHours,
  useBulkUpdateStatus,
  useBulkAddTags,
  useBulkDeleteInitiatives,
  useExportInitiatives,
} from '../hooks/useInitiatives';
import type { Initiative, InitiativeStatus, InitiativeFilters, InitiativeAllocationHours } from '../types';
import { getQuarterOptions } from '../types';

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

// Extract tags from initiative customFields
const extractTags = (initiative: Initiative): string[] => {
  const customFields = initiative.customFields as Record<string, unknown> | null;
  if (!customFields?.tags) return [];
  return Array.isArray(customFields.tags) ? customFields.tags : [];
};

export function InitiativesList() {
  const navigate = useNavigate();

  // Filter state
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string[]>([]);
  const [quarterFilter, setQuarterFilter] = useState('');

  // Table state
  const [sorting, setSorting] = useState<SortingState>([]);
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});

  // Modal state
  const [showCreateModal, setShowCreateModal] = useState(false);

  // Build filters object
  const filters: InitiativeFilters = useMemo(
    () => ({
      search: search || undefined,
      status: statusFilter.length > 0 ? (statusFilter as InitiativeStatus[]) : undefined,
      targetQuarter: quarterFilter || undefined,
      limit: 100, // Backend max is 100
    }),
    [search, statusFilter, quarterFilter]
  );

  // API hooks
  const { data: apiData, isLoading } = useInitiatives(filters);
  const bulkUpdateStatus = useBulkUpdateStatus();
  const bulkAddTags = useBulkAddTags();
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

  const { data: allocationHoursMap } = useInitiativeAllocationHours(
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

  const handleAddTags = useCallback(
    (tags: string[]) => {
      bulkAddTags.mutate({ ids: selectedIds, tags });
      setRowSelection({});
    },
    [selectedIds, bulkAddTags]
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
        id: 'owner',
        header: 'Owner',
        size: 160,
        accessorFn: (row) => (row.customFields as Record<string, unknown>)?.owner ?? '',
        cell: ({ row }) => {
          const owner = (row.original.customFields as Record<string, unknown>)?.owner;
          if (!owner) return <span className="text-surface-400">-</span>;
          return (
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded-full bg-gradient-to-br from-accent-400 to-accent-600 flex items-center justify-center text-[10px] font-bold text-white">
                {String(owner)
                  .split(' ')
                  .map((n) => n[0])
                  .join('')}
              </div>
              <span className="text-surface-700 truncate">{String(owner)}</span>
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
        id: 'currentQHours',
        header: quarterDates.currentLabel,
        size: 100,
        cell: ({ row }) => {
          const hours = allocationHoursMap?.[row.original.id]?.currentQuarterHours ?? 0;
          return (
            <Link
              to={`/initiatives/${row.original.id}?tab=assignments`}
              onClick={(e) => e.stopPropagation()}
              className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-mono font-semibold tabular-nums hover:underline transition-colors"
              style={{
                backgroundColor: hours === 0 ? undefined : undefined,
              }}
              title="View assignments"
            >
              <span className={hours === 0 ? 'text-surface-400' : 'text-surface-800'}>
                {hours === 0 ? '-' : `${hours}h`}
              </span>
            </Link>
          );
        },
        enableSorting: false,
      },
      {
        id: 'nextQHours',
        header: quarterDates.nextLabel,
        size: 100,
        cell: ({ row }) => {
          const hours = allocationHoursMap?.[row.original.id]?.nextQuarterHours ?? 0;
          return (
            <Link
              to={`/initiatives/${row.original.id}?tab=assignments`}
              onClick={(e) => e.stopPropagation()}
              className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-mono font-semibold tabular-nums hover:underline transition-colors"
              title="View assignments"
            >
              <span className={hours === 0 ? 'text-surface-400' : 'text-surface-800'}>
                {hours === 0 ? '-' : `${hours}h`}
              </span>
            </Link>
          );
        },
        enableSorting: false,
      },
      {
        id: 'tags',
        header: 'Tags',
        size: 200,
        cell: ({ row }) => {
          const tags = extractTags(row.original);
          if (tags.length === 0) return <span className="text-surface-400">-</span>;
          return (
            <div className="flex flex-wrap gap-1">
              {tags.slice(0, 3).map((tag) => (
                <Tag key={tag} label={tag} size="sm" />
              ))}
              {tags.length > 3 && (
                <span className="text-xs text-surface-500 px-1">+{tags.length - 3}</span>
              )}
            </div>
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

  const hasActiveFilters = search || statusFilter.length > 0 || quarterFilter;

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
              {hasActiveFilters && (
                <button
                  onClick={() => {
                    setSearch('');
                    setStatusFilter([]);
                    setQuarterFilter('');
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
            </div>
          </div>
        </div>

        {/* Table */}
        <VirtualTable
          data={initiatives}
          columns={columns}
          sorting={sorting}
          onSortingChange={setSorting}
          enableRowSelection
          rowSelection={rowSelection}
          onRowSelectionChange={setRowSelection}
          globalFilter={search}
          onRowClick={handleRowClick}
          getRowId={(row) => row.id}
          isLoading={isLoading}
          emptyMessage={
            hasActiveFilters
              ? 'No initiatives match your filters'
              : 'No initiatives yet. Create your first one!'
          }
        />

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
          onAddTags={handleAddTags}
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
