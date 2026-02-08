import { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { useParams, Link, useSearchParams } from 'react-router-dom';
import { useInitiative, useUpdateInitiative, useUpdateInitiativeStatus, useInitiativeAllocationsAll } from '../hooks';
import { useQuarterPeriods } from '../hooks/usePeriods';
import { StatusBadge, Select } from '../components/ui';
import { OriginBadge } from '../components/OriginBadge';
import type { InitiativeStatus, InitiativeAllocation } from '../types';

// Types for scope items and approvals
interface ScopeItem {
  id: string;
  name: string;
  description?: string;
  skillDemand: Record<string, number>;
  estimateP50: number;
  estimateP90: number;
  quarterDistribution?: Record<string, number>;
}

interface ApprovalEvent {
  id: string;
  type: 'SUBMITTED' | 'APPROVED' | 'REJECTED' | 'REVISION_REQUESTED';
  notes?: string;
  createdAt: string;
  user: { name: string; email: string };
}

interface ActivityEvent {
  id: string;
  action: string;
  field?: string;
  oldValue?: string;
  newValue?: string;
  createdAt: string;
  user: { name: string };
}

// Status workflow transitions (milestone flow)
const statusTransitions: Record<InitiativeStatus, InitiativeStatus[]> = {
  PROPOSED: ['SCOPING', 'ON_HOLD', 'CANCELLED'],
  SCOPING: ['RESOURCING', 'ON_HOLD', 'CANCELLED'],
  RESOURCING: ['IN_EXECUTION', 'ON_HOLD', 'CANCELLED'],
  IN_EXECUTION: ['COMPLETE', 'ON_HOLD', 'CANCELLED'],
  COMPLETE: [],
  ON_HOLD: ['PROPOSED', 'SCOPING', 'RESOURCING', 'IN_EXECUTION', 'CANCELLED'],
  CANCELLED: [],
};

const statusLabels: Record<InitiativeStatus, string> = {
  PROPOSED: 'Proposed',
  SCOPING: 'Begin Scoping',
  RESOURCING: 'Begin Resourcing',
  IN_EXECUTION: 'Start Execution',
  COMPLETE: 'Mark Complete',
  ON_HOLD: 'Put On Hold',
  CANCELLED: 'Cancel',
};

const statusTransitionHints: Record<InitiativeStatus, string> = {
  PROPOSED: 'Return to idea stage with no scope or resource plan.',
  SCOPING: 'Start defining scope items with skill demands and estimates.',
  RESOURCING: 'Finalize scope. Initiative will appear in scenario demand calculations and allocations will be locked.',
  IN_EXECUTION: 'Begin work. Allocations stay locked, still counted in demand.',
  COMPLETE: 'Mark as done. This is permanent and cannot be undone.',
  ON_HOLD: 'Pause this initiative. You can resume to any prior stage later.',
  CANCELLED: 'Cancel this initiative. This is permanent and cannot be undone.',
};

// Mock data for demo
const mockScopeItems: ScopeItem[] = [
  { id: '1', name: 'Design System Migration', description: 'Migrate to new component library with accessibility improvements', skillDemand: { frontend: 12, design: 4 }, estimateP50: 15, estimateP90: 22, quarterDistribution: { '2024-Q1': 0.6, '2024-Q2': 0.4 } },
  { id: '2', name: 'Authentication Flow Redesign', description: 'Implement OAuth 2.0 with SSO support', skillDemand: { backend: 8, frontend: 4 }, estimateP50: 10, estimateP90: 16, quarterDistribution: { '2024-Q1': 1.0 } },
  { id: '3', name: 'Dashboard Components', description: 'Build interactive dashboard with real-time updates', skillDemand: { frontend: 18, backend: 6 }, estimateP50: 20, estimateP90: 30, quarterDistribution: { '2024-Q1': 0.3, '2024-Q2': 0.7 } },
  { id: '4', name: 'API Integration Layer', description: 'Create abstraction layer for third-party integrations', skillDemand: { backend: 14 }, estimateP50: 12, estimateP90: 18 },
  { id: '5', name: 'Performance Optimization', description: 'Bundle optimization and lazy loading implementation', skillDemand: { frontend: 8, devops: 3 }, estimateP50: 8, estimateP90: 12 },
];

const mockApprovals: ApprovalEvent[] = [
  { id: '1', type: 'SUBMITTED', notes: 'Ready for review with updated scope estimates', createdAt: '2024-01-15T10:30:00Z', user: { name: 'Sarah Chen', email: 'sarah@company.com' } },
  { id: '2', type: 'REVISION_REQUESTED', notes: 'Please break down the Dashboard Components item further', createdAt: '2024-01-16T14:20:00Z', user: { name: 'James Wilson', email: 'james@company.com' } },
  { id: '3', type: 'SUBMITTED', notes: 'Scope items updated with more granular breakdown', createdAt: '2024-01-18T09:15:00Z', user: { name: 'Sarah Chen', email: 'sarah@company.com' } },
  { id: '4', type: 'APPROVED', notes: 'Approved with minor adjustments to Q2 timeline', createdAt: '2024-01-19T16:45:00Z', user: { name: 'James Wilson', email: 'james@company.com' } },
];

const mockActivity: ActivityEvent[] = [
  { id: '1', action: 'created', createdAt: '2024-01-10T08:00:00Z', user: { name: 'Sarah Chen' } },
  { id: '2', action: 'updated', field: 'description', createdAt: '2024-01-11T11:30:00Z', user: { name: 'Sarah Chen' } },
  { id: '3', action: 'added_scope_item', newValue: 'Design System Migration', createdAt: '2024-01-12T14:00:00Z', user: { name: 'Mike Torres' } },
  { id: '4', action: 'added_scope_item', newValue: 'Authentication Flow Redesign', createdAt: '2024-01-12T14:15:00Z', user: { name: 'Mike Torres' } },
  { id: '5', action: 'updated', field: 'targetQuarter', oldValue: '2024-Q1', newValue: '2024-Q2', createdAt: '2024-01-14T09:00:00Z', user: { name: 'Sarah Chen' } },
  { id: '6', action: 'status_changed', oldValue: 'PROPOSED', newValue: 'SCOPING', createdAt: '2024-01-15T10:30:00Z', user: { name: 'Sarah Chen' } },
  { id: '7', action: 'status_changed', oldValue: 'SCOPING', newValue: 'RESOURCING', createdAt: '2024-01-19T16:45:00Z', user: { name: 'James Wilson' } },
  { id: '8', action: 'status_changed', oldValue: 'RESOURCING', newValue: 'IN_EXECUTION', createdAt: '2024-01-22T08:30:00Z', user: { name: 'Sarah Chen' } },
];

// Skill color mapping
const skillColors: Record<string, string> = {
  frontend: 'bg-accent-500',
  backend: 'bg-highlight-500',
  design: 'bg-violet-500',
  devops: 'bg-rose-500',
  qa: 'bg-sky-500',
};

function getSkillColor(skill: string): string {
  return skillColors[skill.toLowerCase()] || 'bg-surface-400';
}

// Tab types
type TabId = 'overview' | 'scope' | 'assignments' | 'approvals' | 'activity';

const validTabs: TabId[] = ['overview', 'scope', 'assignments', 'approvals', 'activity'];

export function InitiativeDetail() {
  const { id } = useParams<{ id: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const { data: initiative, isLoading } = useInitiative(id || '');
  const updateInitiative = useUpdateInitiative();
  const updateStatus = useUpdateInitiativeStatus();
  // Allocations are fetched inside AssignmentsTab with quarter filtering

  // Read initial tab from URL query param
  const tabParam = searchParams.get('tab') as TabId | null;
  const initialTab = tabParam && validTabs.includes(tabParam) ? tabParam : 'overview';

  // Local state
  const [activeTab, setActiveTab] = useState<TabId>(initialTab);
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [editedTitle, setEditedTitle] = useState('');
  const [showEstimateP90, setShowEstimateP90] = useState(false);
  const [showStatusDropdown, setShowStatusDropdown] = useState(false);
  const [showStatusConfirmModal, setShowStatusConfirmModal] = useState(false);
  const [pendingStatus, setPendingStatus] = useState<InitiativeStatus | null>(null);
  const [statusNotes, setStatusNotes] = useState('');
  const [showScopeSlideOver, setShowScopeSlideOver] = useState(false);
  const [editingScopeItem, setEditingScopeItem] = useState<ScopeItem | null>(null);
  const [scopeItems, setScopeItems] = useState<ScopeItem[]>(mockScopeItems);
  const [toasts, setToasts] = useState<Array<{ id: string; message: string; type: 'success' | 'error' }>>([]);

  const handleTabChange = useCallback((tab: TabId) => {
    setActiveTab(tab);
    if (tab === 'overview') {
      setSearchParams({}, { replace: true });
    } else {
      setSearchParams({ tab }, { replace: true });
    }
  }, [setSearchParams]);

  // Refs
  const titleInputRef = useRef<HTMLInputElement>(null);
  const statusDropdownRef = useRef<HTMLDivElement>(null);

  // Mock data for when API is loading or unavailable
  const currentInitiative = initiative || {
    id: id || 'demo',
    title: 'Customer Portal Redesign',
    description: 'Complete redesign of the customer-facing portal to improve user experience, modernize the interface, and add new self-service capabilities. This initiative includes migration to a new component library and implementation of accessibility improvements.',
    status: 'IN_EXECUTION' as InitiativeStatus,
    origin: 'DIRECT_PM' as const,
    targetQuarter: '2024-Q2',
    businessOwnerId: 'bo-1',
    productOwnerId: 'po-1',
    portfolioAreaId: null,
    orgNodeId: null,
    productLeaderId: null,
    customFields: {
      priority: 'High',
      department: 'Product',
      budget: '$150,000',
      riskLevel: 'Medium',
    },
    createdAt: '2024-01-10T08:00:00Z',
    updatedAt: '2024-01-22T10:30:00Z',
    businessOwner: { id: 'bo-1', name: 'James Wilson', email: 'james@company.com', role: 'BUSINESS_OWNER' as const, createdAt: '', updatedAt: '' },
    productOwner: { id: 'po-1', name: 'Sarah Chen', email: 'sarah@company.com', role: 'PRODUCT_OWNER' as const, createdAt: '', updatedAt: '' },
    portfolioArea: undefined,
    orgNode: undefined,
    productLeader: undefined,
  };

  // Toast helper
  const showToast = useCallback((message: string, type: 'success' | 'error' = 'success') => {
    const id = Math.random().toString(36).slice(2);
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 3000);
  }, []);

  // Click outside handler for status dropdown
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (statusDropdownRef.current && !statusDropdownRef.current.contains(event.target as Node)) {
        setShowStatusDropdown(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Focus title input when editing
  useEffect(() => {
    if (isEditingTitle && titleInputRef.current) {
      titleInputRef.current.focus();
      titleInputRef.current.select();
    }
  }, [isEditingTitle]);

  // Initialize edited title
  useEffect(() => {
    setEditedTitle(currentInitiative.title);
  }, [currentInitiative.title]);

  // Handlers
  const handleTitleSave = async () => {
    if (editedTitle.trim() && editedTitle !== currentInitiative.title) {
      try {
        await updateInitiative.mutateAsync({ id: currentInitiative.id, data: { title: editedTitle } });
        showToast('Title updated');
      } catch {
        showToast('Failed to update title', 'error');
      }
    }
    setIsEditingTitle(false);
  };

  const handleStatusChange = (newStatus: InitiativeStatus) => {
    setShowStatusDropdown(false);
    setPendingStatus(newStatus);
    setStatusNotes('');
    setShowStatusConfirmModal(true);
  };

  const confirmStatusChange = async () => {
    if (!pendingStatus) return;
    try {
      await updateStatus.mutateAsync({ id: currentInitiative.id, status: pendingStatus });
      showToast(`Status changed to ${statusLabels[pendingStatus]}`);
      setShowStatusConfirmModal(false);
      setPendingStatus(null);
      setStatusNotes('');
    } catch {
      showToast('Failed to update status', 'error');
    }
  };

  const handleAddScopeItem = () => {
    setEditingScopeItem(null);
    setShowScopeSlideOver(true);
  };

  const handleEditScopeItem = (item: ScopeItem) => {
    setEditingScopeItem(item);
    setShowScopeSlideOver(true);
  };

  const handleSaveScopeItem = (item: Partial<ScopeItem>) => {
    if (editingScopeItem) {
      setScopeItems(prev => prev.map(si => si.id === editingScopeItem.id ? { ...si, ...item } : si));
      showToast('Scope item updated');
    } else {
      const newItem: ScopeItem = {
        id: Math.random().toString(36).slice(2),
        name: item.name || 'New Item',
        description: item.description,
        skillDemand: item.skillDemand || {},
        estimateP50: item.estimateP50 || 0,
        estimateP90: item.estimateP90 || 0,
        quarterDistribution: item.quarterDistribution,
      };
      setScopeItems(prev => [...prev, newItem]);
      showToast('Scope item added');
    }
    setShowScopeSlideOver(false);
    setEditingScopeItem(null);
  };

  // Calculate totals
  const totalsBySkill = scopeItems.reduce((acc, item) => {
    Object.entries(item.skillDemand).forEach(([skill, days]) => {
      acc[skill] = (acc[skill] || 0) + days * (showEstimateP90 ? (item.estimateP90 / item.estimateP50) : 1);
    });
    return acc;
  }, {} as Record<string, number>);

  const totalDays = scopeItems.reduce((sum, item) => sum + (showEstimateP90 ? item.estimateP90 : item.estimateP50), 0);

  // Tabs configuration
  const tabs: { id: TabId; label: string; count?: number }[] = [
    { id: 'overview', label: 'Overview' },
    { id: 'scope', label: 'Scope', count: scopeItems.length },
    { id: 'assignments', label: 'Assignments' },
    { id: 'approvals', label: 'Approvals', count: mockApprovals.length },
    { id: 'activity', label: 'Activity' },
  ];

  const availableTransitions = statusTransitions[currentInitiative.status] || [];

  if (isLoading) {
    return (
      <div className="animate-fade-in flex items-center justify-center h-64">
        <div className="flex items-center gap-3 text-surface-500">
          <svg className="animate-spin h-5 w-5" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
          </svg>
          <span className="text-sm font-medium">Loading initiative...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="animate-fade-in">
      {/* Back link */}
      <div className="mb-6">
        <Link
          to="/initiatives"
          className="inline-flex items-center gap-1.5 text-sm text-surface-500 hover:text-surface-700 transition-colors group"
        >
          <svg className="w-4 h-4 transition-transform group-hover:-translate-x-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5 3 12m0 0 7.5-7.5M3 12h18" />
          </svg>
          Back to Initiatives
        </Link>
      </div>

      {/* Header */}
      <div className="page-header">
        <div className="flex items-start justify-between gap-8">
          <div className="flex-1 min-w-0">
            {/* Editable title */}
            <div className="flex items-center gap-4 mb-2">
              {isEditingTitle ? (
                <input
                  ref={titleInputRef}
                  type="text"
                  value={editedTitle}
                  onChange={e => setEditedTitle(e.target.value)}
                  onBlur={handleTitleSave}
                  onKeyDown={e => {
                    if (e.key === 'Enter') handleTitleSave();
                    if (e.key === 'Escape') {
                      setEditedTitle(currentInitiative.title);
                      setIsEditingTitle(false);
                    }
                  }}
                  className="text-2xl font-display font-bold text-surface-900 tracking-tight bg-transparent border-b-2 border-accent-500 outline-none px-0 py-1 w-full max-w-xl"
                />
              ) : (
                <h1
                  className="page-title cursor-pointer hover:text-surface-700 transition-colors group"
                  onClick={() => setIsEditingTitle(true)}
                  title="Click to edit"
                >
                  {currentInitiative.title}
                  <svg className="inline-block w-4 h-4 ml-2 opacity-0 group-hover:opacity-50 transition-opacity" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Zm0 0L19.5 7.125" />
                  </svg>
                </h1>
              )}

              {/* Origin badge */}
              {currentInitiative.origin && (
                <OriginBadge origin={currentInitiative.origin} />
              )}

              {/* Status badge with dropdown */}
              <div className="relative" ref={statusDropdownRef}>
                <button
                  onClick={() => setShowStatusDropdown(!showStatusDropdown)}
                  className="group focus:outline-none"
                  disabled={availableTransitions.length === 0}
                >
                  <StatusBadge status={currentInitiative.status} />
                  {availableTransitions.length > 0 && (
                    <svg className="inline-block w-3.5 h-3.5 ml-1 text-surface-400 group-hover:text-surface-600 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
                    </svg>
                  )}
                </button>

                {showStatusDropdown && availableTransitions.length > 0 && (
                  <div className="absolute left-0 top-full mt-2 w-48 bg-white rounded-lg shadow-elevated border border-surface-200 py-1 z-20 animate-slide-up">
                    <div className="px-3 py-2 text-xs font-medium text-surface-500 uppercase tracking-wider border-b border-surface-100">
                      Change status to
                    </div>
                    {availableTransitions.map(status => (
                      <button
                        key={status}
                        onClick={() => handleStatusChange(status)}
                        className="w-full px-3 py-2 text-left text-sm hover:bg-surface-50 transition-colors flex items-center gap-2"
                        title={statusTransitionHints[status]}
                      >
                        <StatusBadge status={status} size="sm" />
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Owners & Meta */}
            <div className="flex items-center gap-4 text-sm text-surface-500 flex-wrap">
              <div className="flex items-center gap-2">
                <span className="text-surface-400">Product:</span>
                <span className="font-medium text-surface-700">{currentInitiative.productOwner?.name || 'Unassigned'}</span>
              </div>
              <span className="text-surface-300">|</span>
              <div className="flex items-center gap-2">
                <span className="text-surface-400">Business:</span>
                <span className="font-medium text-surface-700">{currentInitiative.businessOwner?.name || 'Unassigned'}</span>
              </div>
              {currentInitiative.productLeader && (
                <>
                  <span className="text-surface-300">|</span>
                  <div className="flex items-center gap-2">
                    <span className="text-surface-400">Product Leader:</span>
                    <span className="font-medium text-surface-700">{currentInitiative.productLeader.name}</span>
                  </div>
                </>
              )}
              {(currentInitiative.orgNode || currentInitiative.portfolioArea) && (
                <>
                  <span className="text-surface-300">|</span>
                  <div className="flex items-center gap-2">
                    <span className="text-surface-400">Portfolio Area:</span>
                    <span className="font-medium text-surface-700">{currentInitiative.orgNode?.name ?? currentInitiative.portfolioArea?.name}</span>
                  </div>
                </>
              )}
              {currentInitiative.targetQuarter && (
                <>
                  <span className="text-surface-300">|</span>
                  <div className="flex items-center gap-2">
                    <span className="text-surface-400">Target:</span>
                    <span className="font-mono text-surface-700">{currentInitiative.targetQuarter}</span>
                  </div>
                </>
              )}
              {currentInitiative.origin === 'INTAKE_CONVERTED' && currentInitiative.intakeRequest && (
                <>
                  <span className="text-surface-300">|</span>
                  <div className="flex items-center gap-2">
                    <span className="text-surface-400">Intake:</span>
                    <Link
                      to={`/intake-requests/${currentInitiative.intakeRequest.id}`}
                      className="text-accent-600 hover:text-accent-700 font-medium transition-colors"
                    >
                      {currentInitiative.intakeRequest.title}
                    </Link>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-surface-200 mb-6">
        <nav className="-mb-px flex gap-6">
          {tabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => handleTabChange(tab.id)}
              className={`
                relative py-3 text-sm font-medium transition-colors
                ${activeTab === tab.id
                  ? 'text-accent-600'
                  : 'text-surface-500 hover:text-surface-700'
                }
              `}
            >
              <span className="flex items-center gap-2">
                {tab.label}
                {tab.count !== undefined && (
                  <span className={`
                    inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 text-xs font-medium rounded-full
                    ${activeTab === tab.id
                      ? 'bg-accent-100 text-accent-700'
                      : 'bg-surface-100 text-surface-600'
                    }
                  `}>
                    {tab.count}
                  </span>
                )}
              </span>
              {activeTab === tab.id && (
                <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-accent-500 rounded-t-full" />
              )}
            </button>
          ))}
        </nav>
      </div>

      {/* Tab content */}
      <div className="animate-fade-in">
        {activeTab === 'overview' && (
          <OverviewTab
            initiative={currentInitiative}
            totalDays={totalDays}
            totalsBySkill={totalsBySkill}
            showEstimateP90={showEstimateP90}
          />
        )}
        {activeTab === 'scope' && (
          <ScopeTab
            scopeItems={scopeItems}
            showEstimateP90={showEstimateP90}
            onToggleEstimate={() => setShowEstimateP90(!showEstimateP90)}
            onAddItem={handleAddScopeItem}
            onEditItem={handleEditScopeItem}
            totalsBySkill={totalsBySkill}
            totalDays={totalDays}
          />
        )}
        {activeTab === 'assignments' && (
          <AssignmentsTab initiativeId={id || ''} />
        )}
        {activeTab === 'approvals' && (
          <ApprovalsTab approvals={mockApprovals} />
        )}
        {activeTab === 'activity' && (
          <ActivityTab activity={mockActivity} />
        )}
      </div>

      {/* Status Confirmation Modal */}
      {showStatusConfirmModal && pendingStatus && (
        <Modal
          title={`Change status to ${statusLabels[pendingStatus]}?`}
          onClose={() => {
            setShowStatusConfirmModal(false);
            setPendingStatus(null);
          }}
        >
          <div className="space-y-4">
            <p className="text-sm text-surface-600">
              This will change the initiative status from{' '}
              <StatusBadge status={currentInitiative.status} size="sm" /> to{' '}
              <StatusBadge status={pendingStatus} size="sm" />.
            </p>
            <div>
              <label className="block text-sm font-medium text-surface-700 mb-1.5">
                Notes (optional)
              </label>
              <textarea
                value={statusNotes}
                onChange={e => setStatusNotes(e.target.value)}
                placeholder="Add any notes about this change..."
                className="input min-h-[80px] resize-none"
              />
            </div>
            <div className="flex justify-end gap-3 pt-2">
              <button
                onClick={() => {
                  setShowStatusConfirmModal(false);
                  setPendingStatus(null);
                }}
                className="btn-secondary"
              >
                Cancel
              </button>
              <button
                onClick={confirmStatusChange}
                className="btn-primary"
                disabled={updateStatus.isPending}
              >
                {updateStatus.isPending ? 'Updating...' : 'Confirm Change'}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* Scope Item Slide-over */}
      {showScopeSlideOver && (
        <ScopeItemSlideOver
          item={editingScopeItem}
          onClose={() => {
            setShowScopeSlideOver(false);
            setEditingScopeItem(null);
          }}
          onSave={handleSaveScopeItem}
        />
      )}

      {/* Toast notifications */}
      <div className="fixed bottom-6 right-6 z-50 flex flex-col gap-2">
        {toasts.map(toast => (
          <div
            key={toast.id}
            className={`
              animate-slide-up px-4 py-3 rounded-lg shadow-elevated flex items-center gap-3
              ${toast.type === 'success' ? 'bg-emerald-600 text-white' : 'bg-red-600 text-white'}
            `}
          >
            {toast.type === 'success' ? (
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
              </svg>
            ) : (
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 3.75h.008v.008H12v-.008Z" />
              </svg>
            )}
            <span className="text-sm font-medium">{toast.message}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// Overview Tab Component
function OverviewTab({
  initiative,
  totalDays,
  totalsBySkill,
  showEstimateP90,
}: {
  initiative: {
    description: string | null;
    customFields: Record<string, unknown> | null;
    createdAt: string;
    updatedAt: string;
  };
  totalDays: number;
  totalsBySkill: Record<string, number>;
  showEstimateP90: boolean;
}) {
  const customFields = initiative.customFields || {};
  const maxSkillDays = Math.max(...Object.values(totalsBySkill), 1);

  return (
    <div className="grid grid-cols-3 gap-6">
      {/* Main content */}
      <div className="col-span-2 space-y-6">
        {/* Description */}
        <div className="card p-6">
          <h2 className="text-sm font-semibold text-surface-900 uppercase tracking-wider mb-4">Description</h2>
          <p className="text-surface-600 leading-relaxed whitespace-pre-wrap">
            {initiative.description || 'No description provided.'}
          </p>
        </div>

        {/* Custom fields */}
        {Object.keys(customFields).length > 0 && (
          <div className="card p-6">
            <h2 className="text-sm font-semibold text-surface-900 uppercase tracking-wider mb-4">Details</h2>
            <div className="grid grid-cols-2 gap-4">
              {Object.entries(customFields).map(([key, value]) => (
                <div key={key}>
                  <p className="text-xs text-surface-500 mb-1 capitalize">{key.replace(/([A-Z])/g, ' $1').trim()}</p>
                  <p className="text-sm font-medium text-surface-800">{String(value)}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Dependencies placeholder */}
        <div className="card p-6">
          <h2 className="text-sm font-semibold text-surface-900 uppercase tracking-wider mb-4">Dependencies</h2>
          <div className="flex items-center justify-center py-8 text-surface-400">
            <div className="text-center">
              <svg className="w-10 h-10 mx-auto mb-2 opacity-50" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M13.19 8.688a4.5 4.5 0 0 1 1.242 7.244l-4.5 4.5a4.5 4.5 0 0 1-6.364-6.364l1.757-1.757m13.35-.622 1.757-1.757a4.5 4.5 0 0 0-6.364-6.364l-4.5 4.5a4.5 4.5 0 0 0 1.242 7.244" />
              </svg>
              <p className="text-sm">No dependencies defined</p>
            </div>
          </div>
        </div>
      </div>

      {/* Sidebar */}
      <div className="space-y-6">
        {/* Effort summary */}
        <div className="card p-6">
          <h3 className="text-sm font-semibold text-surface-900 uppercase tracking-wider mb-4">Effort Summary</h3>
          <div className="text-center py-4 border-b border-surface-100 mb-4">
            <p className="text-3xl font-display font-bold text-surface-900 tabular-nums">{Math.round(totalDays)}</p>
            <p className="text-xs text-surface-500 mt-1">
              Total days ({showEstimateP90 ? 'P90' : 'P50'})
            </p>
          </div>
          <div className="space-y-3">
            {Object.entries(totalsBySkill)
              .sort((a, b) => b[1] - a[1])
              .map(([skill, days]) => (
                <div key={skill}>
                  <div className="flex items-center justify-between text-sm mb-1.5">
                    <span className="text-surface-600 capitalize">{skill}</span>
                    <span className="font-mono text-surface-800">{Math.round(days)}d</span>
                  </div>
                  <div className="h-1.5 bg-surface-100 rounded-full overflow-hidden">
                    <div
                      className={`h-full ${getSkillColor(skill)} rounded-full transition-all duration-500`}
                      style={{ width: `${(days / maxSkillDays) * 100}%` }}
                    />
                  </div>
                </div>
              ))}
          </div>
        </div>

        {/* Timestamps */}
        <div className="card p-6">
          <h3 className="text-sm font-semibold text-surface-900 uppercase tracking-wider mb-4">Timeline</h3>
          <div className="space-y-3 text-sm">
            <div className="flex justify-between">
              <span className="text-surface-500">Created</span>
              <span className="font-mono text-surface-700">{new Date(initiative.createdAt).toLocaleDateString()}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-surface-500">Last updated</span>
              <span className="font-mono text-surface-700">{new Date(initiative.updatedAt).toLocaleDateString()}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// Scope Tab Component
function ScopeTab({
  scopeItems,
  showEstimateP90,
  onToggleEstimate,
  onAddItem,
  onEditItem,
  totalsBySkill,
  totalDays,
}: {
  scopeItems: ScopeItem[];
  showEstimateP90: boolean;
  onToggleEstimate: () => void;
  onAddItem: () => void;
  onEditItem: (item: ScopeItem) => void;
  totalsBySkill: Record<string, number>;
  totalDays: number;
}) {
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [editP50, setEditP50] = useState('');
  const [editP90, setEditP90] = useState('');

  const handleInlineEdit = (item: ScopeItem) => {
    setEditingItemId(item.id);
    setEditP50(String(item.estimateP50));
    setEditP90(String(item.estimateP90));
  };

  const handleInlineSave = (item: ScopeItem) => {
    // In a real implementation, this would call the API
    const updatedItem = {
      ...item,
      estimateP50: parseFloat(editP50) || item.estimateP50,
      estimateP90: parseFloat(editP90) || item.estimateP90,
    };
    onEditItem(updatedItem);
    setEditingItemId(null);
  };

  return (
    <div className="space-y-6">
      {/* Summary bar */}
      <div className="card p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-3">
              <span className="text-sm text-surface-500">Total:</span>
              <span className="text-lg font-display font-bold text-surface-900 tabular-nums">
                {Math.round(totalDays)} days
              </span>
            </div>
            <div className="flex items-center gap-3">
              {Object.entries(totalsBySkill)
                .sort((a, b) => b[1] - a[1])
                .slice(0, 4)
                .map(([skill, days]) => (
                  <div key={skill} className="flex items-center gap-1.5">
                    <span className={`w-2 h-2 rounded-full ${getSkillColor(skill)}`} />
                    <span className="text-xs text-surface-600 capitalize">{skill}</span>
                    <span className="text-xs font-mono text-surface-500">{Math.round(days)}d</span>
                  </div>
                ))}
            </div>
          </div>
          <div className="flex items-center gap-3">
            {/* P50/P90 toggle */}
            <button
              onClick={onToggleEstimate}
              className="inline-flex items-center gap-2 px-3 py-1.5 text-sm font-medium rounded-md bg-surface-100 hover:bg-surface-200 transition-colors"
            >
              <span className={!showEstimateP90 ? 'text-surface-900' : 'text-surface-400'}>P50</span>
              <span className="text-surface-300">/</span>
              <span className={showEstimateP90 ? 'text-surface-900' : 'text-surface-400'}>P90</span>
            </button>
            <button onClick={onAddItem} className="btn-primary">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
              </svg>
              Add Item
            </button>
          </div>
        </div>
      </div>

      {/* Scope items table */}
      <div className="card overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="bg-surface-50 border-b border-surface-200">
              <th className="px-6 py-3 text-left text-xs font-semibold text-surface-500 uppercase tracking-wider">Item</th>
              <th className="px-6 py-3 text-left text-xs font-semibold text-surface-500 uppercase tracking-wider">Skills</th>
              <th className="px-6 py-3 text-right text-xs font-semibold text-surface-500 uppercase tracking-wider w-32">
                {showEstimateP90 ? 'P90 Est.' : 'P50 Est.'}
              </th>
              <th className="px-6 py-3 text-right text-xs font-semibold text-surface-500 uppercase tracking-wider w-24">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-surface-100">
            {scopeItems.map((item, index) => (
              <tr
                key={item.id}
                className="hover:bg-surface-50 transition-colors group"
                style={{ animationDelay: `${index * 30}ms` }}
              >
                <td className="px-6 py-4">
                  <div>
                    <p className="font-medium text-surface-900">{item.name}</p>
                    {item.description && (
                      <p className="text-sm text-surface-500 mt-0.5 line-clamp-1">{item.description}</p>
                    )}
                  </div>
                </td>
                <td className="px-6 py-4">
                  <div className="flex flex-wrap gap-1.5">
                    {Object.entries(item.skillDemand).map(([skill, days]) => (
                      <span
                        key={skill}
                        className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded bg-surface-100 text-surface-700"
                      >
                        <span className={`w-1.5 h-1.5 rounded-full ${getSkillColor(skill)}`} />
                        <span className="capitalize">{skill}</span>
                        <span className="text-surface-400">{days}d</span>
                      </span>
                    ))}
                  </div>
                </td>
                <td className="px-6 py-4 text-right">
                  {editingItemId === item.id ? (
                    <div className="flex items-center justify-end gap-2">
                      <input
                        type="number"
                        value={editP50}
                        onChange={e => setEditP50(e.target.value)}
                        className="w-16 px-2 py-1 text-sm text-right font-mono border border-surface-300 rounded focus:ring-2 focus:ring-accent-500 focus:border-transparent"
                        placeholder="P50"
                      />
                      <span className="text-surface-400">/</span>
                      <input
                        type="number"
                        value={editP90}
                        onChange={e => setEditP90(e.target.value)}
                        className="w-16 px-2 py-1 text-sm text-right font-mono border border-surface-300 rounded focus:ring-2 focus:ring-accent-500 focus:border-transparent"
                        placeholder="P90"
                      />
                      <button
                        onClick={() => handleInlineSave(item)}
                        className="p-1 text-accent-600 hover:text-accent-700"
                      >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
                        </svg>
                      </button>
                      <button
                        onClick={() => setEditingItemId(null)}
                        className="p-1 text-surface-400 hover:text-surface-600"
                      >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => handleInlineEdit(item)}
                      className="font-mono text-surface-700 hover:text-accent-600 transition-colors group/edit"
                    >
                      <span className="tabular-nums">
                        {showEstimateP90 ? item.estimateP90 : item.estimateP50}d
                      </span>
                      <span className="text-surface-400 ml-1.5 text-xs">
                        ({showEstimateP90 ? `P50: ${item.estimateP50}` : `P90: ${item.estimateP90}`})
                      </span>
                      <svg className="inline-block w-3.5 h-3.5 ml-1.5 opacity-0 group-hover/edit:opacity-50" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Zm0 0L19.5 7.125" />
                      </svg>
                    </button>
                  )}
                </td>
                <td className="px-6 py-4 text-right">
                  <button
                    onClick={() => onEditItem(item)}
                    className="p-1.5 text-surface-400 hover:text-surface-600 hover:bg-surface-100 rounded transition-colors opacity-0 group-hover:opacity-100"
                    title="Edit item"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L6.832 19.82a4.5 4.5 0 0 1-1.897 1.13l-2.685.8.8-2.685a4.5 4.5 0 0 1 1.13-1.897L16.863 4.487Zm0 0L19.5 7.125" />
                    </svg>
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="bg-surface-50 border-t border-surface-200">
              <td className="px-6 py-3 text-sm font-semibold text-surface-900">
                Total ({scopeItems.length} items)
              </td>
              <td className="px-6 py-3"></td>
              <td className="px-6 py-3 text-right font-mono font-semibold text-surface-900">
                {Math.round(totalDays)}d
              </td>
              <td className="px-6 py-3"></td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}

// Assignments Tab Component
function AssignmentsTab({ initiativeId }: { initiativeId: string }) {
  const [selectedPeriodId, setSelectedPeriodId] = useState<string>('');
  const { data: periodsData } = useQuarterPeriods();

  // Build quarter options for the picker
  const quarterOptions = useMemo(() => {
    if (!periodsData?.data) return [];
    return periodsData.data
      .sort((a, b) => a.label.localeCompare(b.label))
      .map((p) => ({ value: p.id, label: p.label }));
  }, [periodsData]);

  // Default to current quarter when periods load
  useEffect(() => {
    if (!selectedPeriodId && periodsData?.data) {
      const now = new Date();
      const currentQ = Math.floor(now.getMonth() / 3) + 1;
      const currentLabel = `${now.getFullYear()}-Q${currentQ}`;
      const match = periodsData.data.find((p) => p.label === currentLabel);
      if (match) setSelectedPeriodId(match.id);
      else if (periodsData.data.length > 0) setSelectedPeriodId(periodsData.data[0].id);
    }
  }, [periodsData, selectedPeriodId]);

  // Fetch allocations filtered by selected quarter
  const { data: allocations, isLoading } = useInitiativeAllocationsAll(
    initiativeId,
    selectedPeriodId || undefined
  );

  // Split into actual vs proposed
  const { actualAllocations, proposedGroups, actualCount, proposedCount, uniqueEmployees } = useMemo(() => {
    const allocs = allocations || [];
    const actual = allocs.filter((a) => a.scenarioStatus === 'LOCKED' && a.scenarioIsPrimary);
    const proposed = allocs.filter((a) => !(a.scenarioStatus === 'LOCKED' && a.scenarioIsPrimary));

    // Group proposed by scenario
    const grouped = proposed.reduce<Record<string, { scenarioId: string; scenarioName: string; scenarioStatus: string; allocations: InitiativeAllocation[] }>>((acc, alloc) => {
      if (!acc[alloc.scenarioId]) {
        acc[alloc.scenarioId] = {
          scenarioId: alloc.scenarioId,
          scenarioName: alloc.scenarioName,
          scenarioStatus: alloc.scenarioStatus,
          allocations: [],
        };
      }
      acc[alloc.scenarioId].allocations.push(alloc);
      return acc;
    }, {});

    return {
      actualAllocations: actual,
      proposedGroups: Object.values(grouped),
      actualCount: actual.length,
      proposedCount: proposed.length,
      uniqueEmployees: new Set(allocs.map((a) => a.employeeId)).size,
    };
  }, [allocations]);

  const scenarioStatusStyles: Record<string, string> = {
    DRAFT: 'bg-surface-100 text-surface-600',
    REVIEW: 'bg-amber-100 text-amber-700',
    APPROVED: 'bg-emerald-100 text-emerald-700',
    LOCKED: 'bg-violet-100 text-violet-700',
  };

  const scenarioStatusTooltips: Record<string, string> = {
    DRAFT: 'Fully editable. Add allocations, set priorities, and configure assumptions.',
    REVIEW: 'Under stakeholder review. Allocations and priorities can still be adjusted.',
    APPROVED: 'Allocations and priorities are frozen. Return to Review to make changes.',
    LOCKED: 'Fully immutable. No changes allowed.',
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-48">
        <div className="flex items-center gap-3 text-surface-500">
          <svg className="animate-spin h-5 w-5" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
          </svg>
          <span className="text-sm font-medium">Loading assignments...</span>
        </div>
      </div>
    );
  }

  const allAllocations = allocations || [];

  return (
    <div className="space-y-6">
      {/* Quarter picker + summary bar */}
      <div className="card p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-2">
              <span className="text-sm text-surface-500">Quarter:</span>
              <Select
                options={quarterOptions}
                value={selectedPeriodId}
                onChange={setSelectedPeriodId}
                placeholder="Select quarter"
                className="w-36"
              />
            </div>
            <div className="flex items-center gap-3">
              <span className="text-sm text-surface-500">Actual:</span>
              <span className="text-lg font-display font-bold text-emerald-700 tabular-nums">
                {actualCount}
              </span>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-sm text-surface-500">Proposed:</span>
              <span className="text-lg font-display font-bold text-amber-700 tabular-nums">
                {proposedCount}
              </span>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-sm text-surface-500">Unique employees:</span>
              <span className="text-lg font-display font-bold text-surface-900 tabular-nums">
                {uniqueEmployees}
              </span>
            </div>
          </div>
        </div>
      </div>

      {allAllocations.length === 0 && (
        <div className="card p-12">
          <div className="flex flex-col items-center justify-center text-surface-400">
            <svg className="w-12 h-12 mb-3 opacity-50" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M18 18.72a9.094 9.094 0 0 0 3.741-.479 3 3 0 0 0-4.682-2.72m.94 3.198.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0 1 12 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 0 1 6 18.719m12 0a5.971 5.971 0 0 0-.941-3.197m0 0A5.995 5.995 0 0 0 12 12.75a5.995 5.995 0 0 0-5.058 2.772m0 0a3 3 0 0 0-4.681 2.72 8.986 8.986 0 0 0 3.74.477m.94-3.197a5.971 5.971 0 0 0-.94 3.197M15 6.75a3 3 0 1 1-6 0 3 3 0 0 1 6 0Zm6 3a2.25 2.25 0 1 1-4.5 0 2.25 2.25 0 0 1 4.5 0Zm-13.5 0a2.25 2.25 0 1 1-4.5 0 2.25 2.25 0 0 1 4.5 0Z" />
            </svg>
            <p className="text-sm font-medium text-surface-600 mb-1">No assignments for this quarter</p>
            <p className="text-sm text-surface-400">
              Assignments are created through scenario planning. Add this initiative to a scenario and allocate employees there.
            </p>
          </div>
        </div>
      )}

      {/* Section 1: Actual Allocations */}
      {allAllocations.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-surface-700 uppercase tracking-wider mb-3">Actual Allocations</h3>
          {actualAllocations.length === 0 ? (
            <div className="card p-6 text-center">
              <p className="text-sm text-surface-400">
                No locked primary scenario exists for this quarter. Actual allocations appear when a primary scenario is locked.
              </p>
            </div>
          ) : (
            <div className="card overflow-hidden">
              <div className="px-6 py-3 bg-emerald-50 border-b border-emerald-100 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <h4 className="text-sm font-semibold text-emerald-800">Primary Scenario (Locked)</h4>
                  <span className="inline-flex items-center px-2 py-0.5 text-xs font-medium rounded-full bg-emerald-100 text-emerald-700">
                    ACTUAL
                  </span>
                </div>
                <span className="text-xs text-emerald-600">
                  {actualAllocations.length} assignment{actualAllocations.length !== 1 ? 's' : ''}
                </span>
              </div>
              <table className="w-full">
                <thead>
                  <tr className="border-b border-surface-100">
                    <th className="px-6 py-3 text-left text-xs font-semibold text-surface-500 uppercase tracking-wider">Employee</th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-surface-500 uppercase tracking-wider">Role</th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-surface-500 uppercase tracking-wider">Start Date</th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-surface-500 uppercase tracking-wider">End Date</th>
                    <th className="px-6 py-3 text-right text-xs font-semibold text-surface-500 uppercase tracking-wider">Allocation %</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-surface-100">
                  {actualAllocations.map((alloc) => (
                    <tr key={alloc.id} className="hover:bg-surface-50 transition-colors">
                      <td className="px-6 py-3 text-sm font-medium text-surface-900">{alloc.employeeName}</td>
                      <td className="px-6 py-3 text-sm text-surface-600 capitalize">{alloc.employeeRole.toLowerCase().replace('_', ' ')}</td>
                      <td className="px-6 py-3 text-sm text-surface-600 font-mono">{new Date(alloc.startDate).toLocaleDateString()}</td>
                      <td className="px-6 py-3 text-sm text-surface-600 font-mono">{new Date(alloc.endDate).toLocaleDateString()}</td>
                      <td className="px-6 py-3 text-sm text-right font-mono font-medium text-surface-900">{alloc.percentage}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Section 2: Proposed Allocations */}
      {allAllocations.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-surface-700 uppercase tracking-wider mb-3">Proposed Allocations</h3>
          {proposedGroups.length === 0 ? (
            <div className="card p-6 text-center">
              <p className="text-sm text-surface-400">No proposed allocations for this quarter.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {proposedGroups.map((group) => (
                <div key={group.scenarioId} className="card overflow-hidden">
                  <div className="px-6 py-4 bg-surface-50 border-b border-surface-200 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <Link
                        to={`/scenarios/${group.scenarioId}`}
                        className="text-sm font-semibold text-surface-900 hover:text-accent-600 transition-colors"
                      >
                        {group.scenarioName}
                      </Link>
                      <span
                        className={`inline-flex items-center px-2 py-0.5 text-xs font-medium rounded-full ${scenarioStatusStyles[group.scenarioStatus] || 'bg-surface-100 text-surface-600'}`}
                        title={scenarioStatusTooltips[group.scenarioStatus]}
                      >
                        {group.scenarioStatus}
                      </span>
                    </div>
                    <span className="text-xs text-surface-500">
                      {group.allocations.length} assignment{group.allocations.length !== 1 ? 's' : ''}
                    </span>
                  </div>
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-surface-100">
                        <th className="px-6 py-3 text-left text-xs font-semibold text-surface-500 uppercase tracking-wider">Employee</th>
                        <th className="px-6 py-3 text-left text-xs font-semibold text-surface-500 uppercase tracking-wider">Role</th>
                        <th className="px-6 py-3 text-left text-xs font-semibold text-surface-500 uppercase tracking-wider">Start Date</th>
                        <th className="px-6 py-3 text-left text-xs font-semibold text-surface-500 uppercase tracking-wider">End Date</th>
                        <th className="px-6 py-3 text-right text-xs font-semibold text-surface-500 uppercase tracking-wider">Allocation %</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-surface-100">
                      {group.allocations.map((alloc) => (
                        <tr key={alloc.id} className="hover:bg-surface-50 transition-colors">
                          <td className="px-6 py-3 text-sm font-medium text-surface-900">{alloc.employeeName}</td>
                          <td className="px-6 py-3 text-sm text-surface-600 capitalize">{alloc.employeeRole.toLowerCase().replace('_', ' ')}</td>
                          <td className="px-6 py-3 text-sm text-surface-600 font-mono">{new Date(alloc.startDate).toLocaleDateString()}</td>
                          <td className="px-6 py-3 text-sm text-surface-600 font-mono">{new Date(alloc.endDate).toLocaleDateString()}</td>
                          <td className="px-6 py-3 text-sm text-right font-mono font-medium text-surface-900">{alloc.percentage}%</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// Approvals Tab Component
function ApprovalsTab({ approvals }: { approvals: ApprovalEvent[] }) {
  const eventStyles: Record<ApprovalEvent['type'], { icon: React.ReactNode; bg: string; border: string }> = {
    SUBMITTED: {
      icon: (
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M6 12 3.269 3.125A59.769 59.769 0 0 1 21.485 12 59.768 59.768 0 0 1 3.27 20.875L5.999 12Zm0 0h7.5" />
        </svg>
      ),
      bg: 'bg-sky-100',
      border: 'border-sky-300',
    },
    APPROVED: {
      icon: (
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
        </svg>
      ),
      bg: 'bg-emerald-100',
      border: 'border-emerald-300',
    },
    REJECTED: {
      icon: (
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
        </svg>
      ),
      bg: 'bg-red-100',
      border: 'border-red-300',
    },
    REVISION_REQUESTED: {
      icon: (
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99" />
        </svg>
      ),
      bg: 'bg-amber-100',
      border: 'border-amber-300',
    },
  };

  const eventLabels: Record<ApprovalEvent['type'], string> = {
    SUBMITTED: 'Submitted for approval',
    APPROVED: 'Approved',
    REJECTED: 'Rejected',
    REVISION_REQUESTED: 'Revision requested',
  };

  return (
    <div className="max-w-2xl">
      <div className="relative">
        {/* Timeline line */}
        <div className="absolute left-[19px] top-8 bottom-8 w-0.5 bg-surface-200" />

        {/* Events */}
        <div className="space-y-6">
          {approvals.map((event, index) => {
            const style = eventStyles[event.type];
            return (
              <div
                key={event.id}
                className="relative flex gap-4 animate-fade-in"
                style={{ animationDelay: `${index * 100}ms` }}
              >
                {/* Icon */}
                <div className={`relative z-10 flex items-center justify-center w-10 h-10 rounded-full ${style.bg} border-2 ${style.border}`}>
                  {style.icon}
                </div>

                {/* Content */}
                <div className="flex-1 pt-1.5">
                  <div className="flex items-center gap-3 mb-1">
                    <span className="font-medium text-surface-900">{eventLabels[event.type]}</span>
                    <span className="text-xs text-surface-400">
                      {new Date(event.createdAt).toLocaleDateString()} at{' '}
                      {new Date(event.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                  <p className="text-sm text-surface-500 mb-2">
                    by {event.user.name}
                  </p>
                  {event.notes && (
                    <div className="p-3 bg-surface-50 rounded-lg border border-surface-100">
                      <p className="text-sm text-surface-700">{event.notes}</p>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// Activity Tab Component
function ActivityTab({ activity }: { activity: ActivityEvent[] }) {
  const actionLabels: Record<string, string> = {
    created: 'created this initiative',
    updated: 'updated',
    added_scope_item: 'added scope item',
    removed_scope_item: 'removed scope item',
    status_changed: 'changed status',
  };

  return (
    <div className="max-w-2xl space-y-1">
      {activity.map((event, index) => (
        <div
          key={event.id}
          className="flex items-start gap-3 py-3 animate-fade-in"
          style={{ animationDelay: `${index * 50}ms` }}
        >
          {/* Avatar placeholder */}
          <div className="w-8 h-8 rounded-full bg-surface-200 flex items-center justify-center text-xs font-medium text-surface-600 shrink-0">
            {event.user.name.split(' ').map(n => n[0]).join('')}
          </div>

          {/* Content */}
          <div className="flex-1 min-w-0">
            <p className="text-sm">
              <span className="font-medium text-surface-900">{event.user.name}</span>
              {' '}
              <span className="text-surface-600">{actionLabels[event.action] || event.action}</span>
              {event.field && (
                <span className="text-surface-500"> {event.field}</span>
              )}
              {event.oldValue && event.newValue && (
                <>
                  {' '}
                  <span className="text-surface-400">from</span>
                  {' '}
                  <span className="font-mono text-xs px-1.5 py-0.5 bg-red-50 text-red-700 rounded">{event.oldValue}</span>
                  {' '}
                  <span className="text-surface-400">to</span>
                  {' '}
                  <span className="font-mono text-xs px-1.5 py-0.5 bg-emerald-50 text-emerald-700 rounded">{event.newValue}</span>
                </>
              )}
              {event.newValue && !event.oldValue && (
                <>
                  {' '}
                  <span className="font-medium text-surface-700">"{event.newValue}"</span>
                </>
              )}
            </p>
            <p className="text-xs text-surface-400 mt-0.5 font-mono">
              {new Date(event.createdAt).toLocaleDateString()}{' '}
              {new Date(event.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </p>
          </div>
        </div>
      ))}
    </div>
  );
}

// Modal Component
function Modal({
  title,
  children,
  onClose,
}: {
  title: string;
  children: React.ReactNode;
  onClose: () => void;
}) {
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-surface-900/50 animate-fade-in"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative bg-white rounded-xl shadow-raised w-full max-w-md animate-slide-up">
        <div className="flex items-center justify-between px-6 py-4 border-b border-surface-200">
          <h3 className="text-lg font-display font-semibold text-surface-900">{title}</h3>
          <button
            onClick={onClose}
            className="p-1.5 text-surface-400 hover:text-surface-600 hover:bg-surface-100 rounded transition-colors"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="px-6 py-4">
          {children}
        </div>
      </div>
    </div>
  );
}

// Scope Item Slide-over Component
function ScopeItemSlideOver({
  item,
  onClose,
  onSave,
}: {
  item: ScopeItem | null;
  onClose: () => void;
  onSave: (item: Partial<ScopeItem>) => void;
}) {
  const [name, setName] = useState(item?.name || '');
  const [description, setDescription] = useState(item?.description || '');
  const [estimateP50, setEstimateP50] = useState(item?.estimateP50?.toString() || '');
  const [estimateP90, setEstimateP90] = useState(item?.estimateP90?.toString() || '');
  const [skills, setSkills] = useState<Record<string, number>>(item?.skillDemand || {});
  const [newSkill, setNewSkill] = useState('');
  const [newSkillDays, setNewSkillDays] = useState('');

  const handleAddSkill = () => {
    if (newSkill && newSkillDays) {
      setSkills(prev => ({ ...prev, [newSkill.toLowerCase()]: parseFloat(newSkillDays) }));
      setNewSkill('');
      setNewSkillDays('');
    }
  };

  const handleRemoveSkill = (skill: string) => {
    setSkills(prev => {
      const next = { ...prev };
      delete next[skill];
      return next;
    });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave({
      name,
      description,
      estimateP50: parseFloat(estimateP50) || 0,
      estimateP90: parseFloat(estimateP90) || 0,
      skillDemand: skills,
    });
  };

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-surface-900/30 animate-fade-in"
        onClick={onClose}
      />

      {/* Slide-over panel */}
      <div className="absolute inset-y-0 right-0 w-full max-w-lg bg-white shadow-raised animate-slide-in flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-surface-200 shrink-0">
          <h3 className="text-lg font-display font-semibold text-surface-900">
            {item ? 'Edit Scope Item' : 'Add Scope Item'}
          </h3>
          <button
            onClick={onClose}
            className="p-1.5 text-surface-400 hover:text-surface-600 hover:bg-surface-100 rounded transition-colors"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto">
          <div className="px-6 py-4 space-y-5">
            {/* Name */}
            <div>
              <label className="block text-sm font-medium text-surface-700 mb-1.5">
                Name <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="Enter item name"
                className="input"
                required
              />
            </div>

            {/* Description */}
            <div>
              <label className="block text-sm font-medium text-surface-700 mb-1.5">
                Description
              </label>
              <textarea
                value={description}
                onChange={e => setDescription(e.target.value)}
                placeholder="Describe this scope item..."
                className="input min-h-[80px] resize-none"
              />
            </div>

            {/* Estimates */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-surface-700 mb-1.5">
                  P50 Estimate (days)
                </label>
                <input
                  type="number"
                  value={estimateP50}
                  onChange={e => setEstimateP50(e.target.value)}
                  placeholder="0"
                  min="0"
                  step="0.5"
                  className="input font-mono"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-surface-700 mb-1.5">
                  P90 Estimate (days)
                </label>
                <input
                  type="number"
                  value={estimateP90}
                  onChange={e => setEstimateP90(e.target.value)}
                  placeholder="0"
                  min="0"
                  step="0.5"
                  className="input font-mono"
                />
              </div>
            </div>

            {/* Skill demand */}
            <div>
              <label className="block text-sm font-medium text-surface-700 mb-1.5">
                Skill Demand
              </label>

              {/* Existing skills */}
              {Object.keys(skills).length > 0 && (
                <div className="flex flex-wrap gap-2 mb-3">
                  {Object.entries(skills).map(([skill, days]) => (
                    <span
                      key={skill}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1 text-sm rounded-full bg-surface-100"
                    >
                      <span className={`w-2 h-2 rounded-full ${getSkillColor(skill)}`} />
                      <span className="capitalize">{skill}</span>
                      <span className="text-surface-500 font-mono">{days}d</span>
                      <button
                        type="button"
                        onClick={() => handleRemoveSkill(skill)}
                        className="ml-0.5 text-surface-400 hover:text-surface-600"
                      >
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </span>
                  ))}
                </div>
              )}

              {/* Add skill */}
              <div className="flex gap-2">
                <input
                  type="text"
                  value={newSkill}
                  onChange={e => setNewSkill(e.target.value)}
                  placeholder="Skill name"
                  className="input flex-1"
                  list="skill-suggestions"
                />
                <datalist id="skill-suggestions">
                  <option value="Frontend" />
                  <option value="Backend" />
                  <option value="Design" />
                  <option value="DevOps" />
                  <option value="QA" />
                  <option value="Data" />
                  <option value="Mobile" />
                </datalist>
                <input
                  type="number"
                  value={newSkillDays}
                  onChange={e => setNewSkillDays(e.target.value)}
                  placeholder="Days"
                  min="0"
                  step="0.5"
                  className="input w-24 font-mono"
                />
                <button
                  type="button"
                  onClick={handleAddSkill}
                  disabled={!newSkill || !newSkillDays}
                  className="btn-secondary"
                >
                  Add
                </button>
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="px-6 py-4 border-t border-surface-200 bg-surface-50 flex justify-end gap-3 shrink-0">
            <button type="button" onClick={onClose} className="btn-secondary">
              Cancel
            </button>
            <button type="submit" className="btn-primary" disabled={!name.trim()}>
              {item ? 'Save Changes' : 'Add Item'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
