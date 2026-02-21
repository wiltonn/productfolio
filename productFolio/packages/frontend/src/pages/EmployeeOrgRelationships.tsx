import { useState, useMemo, useEffect } from 'react';
import { Modal, ProgressBar, Tag, Select } from '../components/ui';
import {
  useActiveEmployeeLinks,
  useEmployeeHomeOrg,
  useEmployeeCapacityLinks,
  useCreateEmployeeOrgLink,
  useUpdateEmployeeOrgLink,
  useEndEmployeeOrgLink,
  useReassignPrimaryReporting,
} from '../hooks/useEmployeeOrgLinks';
import { useOrgTree } from '../hooks/useOrgTree';
import { flattenOrgTree } from '../utils/org-tree';
import type { EmployeeOrgUnitLink, EmployeeOrgRelationshipType } from '../types';

// ============================================================================
// Constants
// ============================================================================

const RELATIONSHIP_TYPE_LABELS: Record<EmployeeOrgRelationshipType, string> = {
  PRIMARY_REPORTING: 'Primary Reporting',
  DELIVERY_ASSIGNMENT: 'Delivery Assignment',
  FUNCTIONAL_ALIGNMENT: 'Functional Alignment',
  CAPABILITY_POOL: 'Capability Pool',
  TEMPORARY_ROTATION: 'Temporary Rotation',
};

const RELATIONSHIP_TYPE_COLORS: Record<EmployeeOrgRelationshipType, string> = {
  PRIMARY_REPORTING: 'bg-indigo-100 text-indigo-700',
  DELIVERY_ASSIGNMENT: 'bg-emerald-100 text-emerald-700',
  FUNCTIONAL_ALIGNMENT: 'bg-sky-100 text-sky-700',
  CAPABILITY_POOL: 'bg-amber-100 text-amber-700',
  TEMPORARY_ROTATION: 'bg-rose-100 text-rose-700',
};

const CAPACITY_TYPES: EmployeeOrgRelationshipType[] = [
  'DELIVERY_ASSIGNMENT',
  'TEMPORARY_ROTATION',
];

const RELATIONSHIP_TYPE_OPTIONS = Object.entries(RELATIONSHIP_TYPE_LABELS).map(
  ([value, label]) => ({ value, label }),
);

// Group order for displaying relationships
const GROUP_ORDER: EmployeeOrgRelationshipType[] = [
  'DELIVERY_ASSIGNMENT',
  'FUNCTIONAL_ALIGNMENT',
  'CAPABILITY_POOL',
  'TEMPORARY_ROTATION',
];

// ============================================================================
// Helpers
// ============================================================================

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

// ============================================================================
// Sub-components
// ============================================================================

function CapacitySummaryBar({
  employeeId,
}: {
  employeeId: string;
}) {
  const { data: capacityLinks, isLoading } = useEmployeeCapacityLinks(employeeId);

  const totalPct = useMemo(
    () =>
      (capacityLinks ?? []).reduce(
        (sum, link) => sum + (link.allocationPct ?? 0),
        0,
      ),
    [capacityLinks],
  );

  const status: 'success' | 'warning' | 'danger' =
    totalPct <= 80 ? 'success' : totalPct <= 100 ? 'warning' : 'danger';

  if (isLoading) {
    return (
      <div className="px-6 py-3 border-b border-surface-200 animate-pulse">
        <div className="h-4 bg-surface-200 rounded w-32 mb-2" />
        <div className="h-2 bg-surface-200 rounded w-full" />
      </div>
    );
  }

  return (
    <div className="px-6 py-3 border-b border-surface-200">
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-xs font-medium text-surface-600">
          Capacity Allocation
        </span>
        <span
          className={`text-xs font-mono font-semibold tabular-nums ${
            status === 'success'
              ? 'text-emerald-700'
              : status === 'warning'
                ? 'text-amber-700'
                : 'text-red-700'
          }`}
        >
          {totalPct}%
        </span>
      </div>
      <ProgressBar value={totalPct} max={100} size="sm" status={status} />
      {(capacityLinks ?? []).length > 0 && (
        <div className="mt-2 space-y-0.5">
          {(capacityLinks ?? []).map((link) => (
            <div
              key={link.id}
              className="flex items-center justify-between text-[11px] text-surface-500"
            >
              <span className="truncate mr-2">
                {link.orgNode?.name ?? 'Unknown'}
              </span>
              <span className="font-mono tabular-nums shrink-0">
                {link.allocationPct ?? 0}%
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function HomeOrgCard({
  employeeId,
  onReassign,
  onAddPrimary,
}: {
  employeeId: string;
  onReassign: () => void;
  onAddPrimary: () => void;
}) {
  const { data: homeOrg, isLoading } = useEmployeeHomeOrg(employeeId);

  if (isLoading) {
    return (
      <div className="px-6 py-4 animate-pulse">
        <div className="h-4 bg-surface-200 rounded w-24 mb-3" />
        <div className="h-16 bg-surface-100 rounded-lg" />
      </div>
    );
  }

  if (!homeOrg) {
    return (
      <div className="px-6 py-4">
        <h4 className="text-xs font-semibold text-surface-500 uppercase tracking-wider mb-2">
          Home Org
        </h4>
        <button
          onClick={onAddPrimary}
          className="w-full p-4 border-2 border-dashed border-surface-300 rounded-lg text-sm text-surface-500 hover:border-accent-400 hover:text-accent-600 transition-colors"
        >
          Set Home Org
        </button>
      </div>
    );
  }

  return (
    <div className="px-6 py-4">
      <h4 className="text-xs font-semibold text-surface-500 uppercase tracking-wider mb-2">
        Home Org
      </h4>
      <div className="flex items-center justify-between p-3 bg-indigo-50 rounded-lg border border-indigo-100">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-sm font-medium text-surface-900 truncate">
            {homeOrg.orgNode?.name ?? 'Unknown'}
          </span>
          {homeOrg.orgNode?.type && (
            <Tag
              label={homeOrg.orgNode.type}
              color="bg-indigo-100 text-indigo-700"
              size="sm"
            />
          )}
        </div>
        <button
          onClick={onReassign}
          className="text-xs font-medium text-indigo-600 hover:text-indigo-800 transition-colors shrink-0 ml-2"
        >
          Reassign
        </button>
      </div>
    </div>
  );
}

function RelationshipRow({
  link,
  onEdit,
}: {
  link: EmployeeOrgUnitLink;
  onEdit: () => void;
}) {
  const [confirmEnd, setConfirmEnd] = useState(false);
  const endMutation = useEndEmployeeOrgLink();

  const handleEnd = () => {
    endMutation.mutate(link.id, {
      onSuccess: () => setConfirmEnd(false),
    });
  };

  return (
    <div className="flex items-center justify-between py-2 px-6 hover:bg-surface-50 transition-colors group">
      <div className="flex items-center gap-2 min-w-0">
        <span className="text-sm text-surface-900 truncate">
          {link.orgNode?.name ?? 'Unknown'}
        </span>
        <Tag
          label={RELATIONSHIP_TYPE_LABELS[link.relationshipType]}
          color={RELATIONSHIP_TYPE_COLORS[link.relationshipType]}
          size="sm"
        />
        {CAPACITY_TYPES.includes(link.relationshipType) && (
          <span className="text-xs font-mono text-surface-500 tabular-nums">
            {link.allocationPct ?? 0}%
          </span>
        )}
      </div>
      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
        <span className="text-[11px] text-surface-400 mr-2">
          {formatDate(link.startDate)}
        </span>
        <button
          onClick={onEdit}
          className="px-2 py-1 text-xs text-surface-600 hover:text-accent-700 hover:bg-accent-50 rounded transition-colors"
        >
          Edit
        </button>
        {confirmEnd ? (
          <div className="flex items-center gap-1">
            <button
              onClick={handleEnd}
              disabled={endMutation.isPending}
              className="px-2 py-1 text-xs text-red-600 hover:bg-red-50 rounded transition-colors font-medium"
            >
              {endMutation.isPending ? 'Ending...' : 'Confirm'}
            </button>
            <button
              onClick={() => setConfirmEnd(false)}
              className="px-2 py-1 text-xs text-surface-500 hover:bg-surface-100 rounded transition-colors"
            >
              Cancel
            </button>
          </div>
        ) : (
          <button
            onClick={() => setConfirmEnd(true)}
            className="px-2 py-1 text-xs text-red-600 hover:bg-red-50 rounded transition-colors"
          >
            End
          </button>
        )}
      </div>
    </div>
  );
}

// ============================================================================
// Modals
// ============================================================================

function AddRelationshipModal({
  isOpen,
  onClose,
  employeeId,
  orgNodeOptions,
  defaultType,
  hasExistingPrimary,
}: {
  isOpen: boolean;
  onClose: () => void;
  employeeId: string;
  orgNodeOptions: Array<{ value: string; label: string }>;
  defaultType?: EmployeeOrgRelationshipType;
  hasExistingPrimary: boolean;
}) {
  const [relType, setRelType] = useState<string>(defaultType ?? '');
  const [orgNodeId, setOrgNodeId] = useState('');
  const [allocationPct, setAllocationPct] = useState(100);
  const [startDate, setStartDate] = useState(
    new Date().toISOString().split('T')[0],
  );

  const createLink = useCreateEmployeeOrgLink();

  const showAllocation = CAPACITY_TYPES.includes(
    relType as EmployeeOrgRelationshipType,
  );
  const showPrimaryWarning =
    relType === 'PRIMARY_REPORTING' && hasExistingPrimary;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!relType || !orgNodeId) return;

    createLink.mutate(
      {
        employeeId,
        orgNodeId,
        relationshipType: relType as EmployeeOrgRelationshipType,
        allocationPct: showAllocation ? allocationPct : undefined,
        startDate,
      },
      {
        onSuccess: () => {
          onClose();
          setRelType(defaultType ?? '');
          setOrgNodeId('');
          setAllocationPct(100);
        },
      },
    );
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Add Relationship">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-surface-700 mb-1">
            Relationship Type
          </label>
          <Select
            options={RELATIONSHIP_TYPE_OPTIONS}
            value={relType}
            onChange={setRelType}
            placeholder="Select type..."
            allowClear={false}
          />
          {showPrimaryWarning && (
            <p className="mt-1 text-xs text-amber-600">
              A primary reporting link already exists. Use "Reassign" from the
              Home Org card instead to replace it.
            </p>
          )}
        </div>

        <div>
          <label className="block text-sm font-medium text-surface-700 mb-1">
            Org Unit
          </label>
          <Select
            options={orgNodeOptions}
            value={orgNodeId}
            onChange={setOrgNodeId}
            placeholder="Select org unit..."
            allowClear={false}
          />
        </div>

        {showAllocation && (
          <div>
            <label className="block text-sm font-medium text-surface-700 mb-1">
              Allocation %
            </label>
            <input
              type="number"
              min={0}
              max={100}
              value={allocationPct}
              onChange={(e) => setAllocationPct(Number(e.target.value))}
              className="w-full px-3 py-2 border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-accent-500 focus:border-accent-500"
            />
          </div>
        )}

        <div>
          <label className="block text-sm font-medium text-surface-700 mb-1">
            Start Date
          </label>
          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="w-full px-3 py-2 border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-accent-500 focus:border-accent-500"
          />
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-surface-700 hover:bg-surface-100 rounded-lg transition-colors"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={
              !relType ||
              !orgNodeId ||
              createLink.isPending ||
              showPrimaryWarning
            }
            className="px-4 py-2 text-sm font-medium text-white bg-accent-600 hover:bg-accent-700 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {createLink.isPending ? 'Adding...' : 'Add'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function EditLinkModal({
  isOpen,
  onClose,
  link,
}: {
  isOpen: boolean;
  onClose: () => void;
  link: EmployeeOrgUnitLink | null;
}) {
  const [allocationPct, setAllocationPct] = useState(
    link?.allocationPct ?? 100,
  );
  const [endDate, setEndDate] = useState(link?.endDate?.split('T')[0] ?? '');
  const updateLink = useUpdateEmployeeOrgLink();

  // Sync state when link changes
  const linkId = link?.id;
  useEffect(() => {
    if (link) {
      setAllocationPct(link.allocationPct ?? 100);
      setEndDate(link.endDate?.split('T')[0] ?? '');
    }
  }, [linkId]);

  const isCapacityType = link
    ? CAPACITY_TYPES.includes(link.relationshipType)
    : false;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!linkId) return;

    updateLink.mutate(
      {
        linkId,
        allocationPct: isCapacityType ? allocationPct : undefined,
        endDate: endDate || null,
      },
      { onSuccess: onClose },
    );
  };

  if (!link) return null;

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Edit Relationship">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-surface-700 mb-1">
            Org Unit
          </label>
          <p className="text-sm text-surface-600">
            {link.orgNode?.name ?? 'Unknown'}
          </p>
        </div>

        <div>
          <label className="block text-sm font-medium text-surface-700 mb-1">
            Type
          </label>
          <Tag
            label={RELATIONSHIP_TYPE_LABELS[link.relationshipType]}
            color={RELATIONSHIP_TYPE_COLORS[link.relationshipType]}
          />
        </div>

        {isCapacityType && (
          <div>
            <label className="block text-sm font-medium text-surface-700 mb-1">
              Allocation %
            </label>
            <input
              type="number"
              min={0}
              max={100}
              value={allocationPct}
              onChange={(e) => setAllocationPct(Number(e.target.value))}
              className="w-full px-3 py-2 border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-accent-500 focus:border-accent-500"
            />
          </div>
        )}

        <div>
          <label className="block text-sm font-medium text-surface-700 mb-1">
            End Date (optional)
          </label>
          <input
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            className="w-full px-3 py-2 border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-accent-500 focus:border-accent-500"
          />
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-surface-700 hover:bg-surface-100 rounded-lg transition-colors"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={updateLink.isPending}
            className="px-4 py-2 text-sm font-medium text-white bg-accent-600 hover:bg-accent-700 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {updateLink.isPending ? 'Saving...' : 'Save'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function ReassignHomeOrgModal({
  isOpen,
  onClose,
  employeeId,
  currentOrgName,
  orgNodeOptions,
}: {
  isOpen: boolean;
  onClose: () => void;
  employeeId: string;
  currentOrgName: string;
  orgNodeOptions: Array<{ value: string; label: string }>;
}) {
  const [orgNodeId, setOrgNodeId] = useState('');
  const reassign = useReassignPrimaryReporting();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!orgNodeId) return;

    reassign.mutate(
      { employeeId, orgNodeId },
      {
        onSuccess: () => {
          onClose();
          setOrgNodeId('');
        },
      },
    );
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Reassign Home Org">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-surface-700 mb-1">
            Current Home Org
          </label>
          <p className="text-sm text-surface-600">{currentOrgName}</p>
        </div>

        <div>
          <label className="block text-sm font-medium text-surface-700 mb-1">
            New Org Unit
          </label>
          <Select
            options={orgNodeOptions}
            value={orgNodeId}
            onChange={setOrgNodeId}
            placeholder="Select new org unit..."
            allowClear={false}
          />
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-surface-700 hover:bg-surface-100 rounded-lg transition-colors"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={!orgNodeId || reassign.isPending}
            className="px-4 py-2 text-sm font-medium text-white bg-accent-600 hover:bg-accent-700 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {reassign.isPending ? 'Reassigning...' : 'Reassign'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

// ============================================================================
// Main Component
// ============================================================================

export function EmployeeOrgRelationships({
  employeeId,
}: {
  employeeId: string;
}) {
  const { data: activeLinks, isLoading: linksLoading } =
    useActiveEmployeeLinks(employeeId);
  const { data: homeOrg } = useEmployeeHomeOrg(employeeId);
  const { data: orgTree } = useOrgTree();

  const [showAddModal, setShowAddModal] = useState(false);
  const [addDefaultType, setAddDefaultType] =
    useState<EmployeeOrgRelationshipType | undefined>();
  const [editLink, setEditLink] = useState<EmployeeOrgUnitLink | null>(null);
  const [showReassignModal, setShowReassignModal] = useState(false);

  const orgNodeOptions = useMemo(
    () =>
      flattenOrgTree(orgTree ?? []).map((n) => ({
        value: n.id,
        label: `${'\u00A0\u00A0'.repeat(n.depth)}${n.name}`,
      })),
    [orgTree],
  );

  // Group non-PRIMARY links by relationship type
  const groupedLinks = useMemo(() => {
    const nonPrimary = (activeLinks ?? []).filter(
      (l) => l.relationshipType !== 'PRIMARY_REPORTING',
    );
    const groups: Partial<
      Record<EmployeeOrgRelationshipType, EmployeeOrgUnitLink[]>
    > = {};
    for (const link of nonPrimary) {
      if (!groups[link.relationshipType]) {
        groups[link.relationshipType] = [];
      }
      groups[link.relationshipType]!.push(link);
    }
    return groups;
  }, [activeLinks]);

  const hasAnyNonPrimary = Object.keys(groupedLinks).length > 0;

  const handleOpenAddPrimary = () => {
    setAddDefaultType('PRIMARY_REPORTING');
    setShowAddModal(true);
  };

  const handleOpenAdd = () => {
    setAddDefaultType(undefined);
    setShowAddModal(true);
  };

  if (linksLoading) {
    return (
      <div className="py-6 px-6 space-y-4 animate-pulse">
        <div className="h-4 bg-surface-200 rounded w-32" />
        <div className="h-20 bg-surface-100 rounded-lg" />
        <div className="h-4 bg-surface-200 rounded w-48" />
        <div className="h-12 bg-surface-100 rounded" />
        <div className="h-12 bg-surface-100 rounded" />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* A. Capacity Summary Bar */}
      <CapacitySummaryBar employeeId={employeeId} />

      {/* B. Home Org Card */}
      <HomeOrgCard
        employeeId={employeeId}
        onReassign={() => setShowReassignModal(true)}
        onAddPrimary={handleOpenAddPrimary}
      />

      {/* C. Active Relationships List */}
      <div className="flex-1 overflow-y-auto border-t border-surface-200">
        {hasAnyNonPrimary ? (
          <div className="py-2">
            {GROUP_ORDER.map((type) => {
              const links = groupedLinks[type];
              if (!links?.length) return null;
              return (
                <div key={type} className="mb-2">
                  <div className="px-6 py-1.5">
                    <span className="text-[11px] font-semibold text-surface-400 uppercase tracking-wider">
                      {RELATIONSHIP_TYPE_LABELS[type]}
                    </span>
                  </div>
                  {links.map((link) => (
                    <RelationshipRow
                      key={link.id}
                      link={link}
                      onEdit={() => setEditLink(link)}
                    />
                  ))}
                </div>
              );
            })}
          </div>
        ) : (
          <div className="flex items-center justify-center py-12 text-sm text-surface-400">
            No additional org relationships
          </div>
        )}
      </div>

      {/* D. Sticky Footer */}
      <div className="sticky bottom-0 px-6 py-3 border-t border-surface-200 bg-white">
        <button
          onClick={handleOpenAdd}
          className="w-full px-4 py-2 text-sm font-medium text-accent-700 bg-accent-50 hover:bg-accent-100 rounded-lg transition-colors"
        >
          + Add Relationship
        </button>
      </div>

      {/* Modals */}
      <AddRelationshipModal
        isOpen={showAddModal}
        onClose={() => {
          setShowAddModal(false);
          setAddDefaultType(undefined);
        }}
        employeeId={employeeId}
        orgNodeOptions={orgNodeOptions}
        defaultType={addDefaultType}
        hasExistingPrimary={!!homeOrg}
      />

      <EditLinkModal
        isOpen={editLink !== null}
        onClose={() => setEditLink(null)}
        link={editLink}
      />

      <ReassignHomeOrgModal
        isOpen={showReassignModal}
        onClose={() => setShowReassignModal(false)}
        employeeId={employeeId}
        currentOrgName={homeOrg?.orgNode?.name ?? 'None'}
        orgNodeOptions={orgNodeOptions}
      />
    </div>
  );
}
