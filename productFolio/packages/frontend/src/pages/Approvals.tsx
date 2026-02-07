import { useState } from 'react';
import {
  useApproverInbox,
  useMyRequests,
  useApprovalRequest,
  useSubmitDecision,
  useCancelRequest,
} from '../hooks/useApprovals';
import { Modal } from '../components/ui';
import type { ApprovalRequest, ApprovalRequestStatus, ChainStep } from '../types';

// ============================================================================
// Status Badge
// ============================================================================

function ApprovalStatusBadge({ status }: { status: ApprovalRequestStatus }) {
  const colors: Record<string, string> = {
    PENDING: 'bg-yellow-100 text-yellow-700',
    APPROVED: 'bg-green-100 text-green-700',
    REJECTED: 'bg-red-100 text-red-700',
    CANCELLED: 'bg-surface-100 text-surface-500',
    EXPIRED: 'bg-surface-100 text-surface-400',
  };

  return (
    <span className={`inline-flex px-2 py-0.5 text-xs font-medium rounded-full ${colors[status] ?? ''}`}>
      {status}
    </span>
  );
}

// ============================================================================
// Chain Visualization
// ============================================================================

function ChainSteps({ chain, currentLevel }: { chain: ChainStep[]; currentLevel: number }) {
  return (
    <div className="flex items-center gap-2 flex-wrap">
      {chain.map((step, i) => {
        const isActive = step.level === currentLevel;
        const isPast = step.level < currentLevel;

        return (
          <div key={i} className="flex items-center gap-2">
            {i > 0 && <span className="text-surface-300">&rarr;</span>}
            <div
              className={`px-3 py-1.5 rounded text-xs border ${
                isActive
                  ? 'bg-accent-50 border-accent-300 text-accent-700'
                  : isPast
                    ? 'bg-green-50 border-green-300 text-green-700'
                    : 'bg-surface-50 border-surface-200 text-surface-500'
              }`}
            >
              <div className="font-medium">L{step.level}: {step.orgNodeName}</div>
              <div className="text-[10px] mt-0.5">
                {step.ruleType} &middot;{' '}
                {step.resolvedApprovers.map((a) => a.name).join(', ') || 'No approvers'}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ============================================================================
// Request Card
// ============================================================================

function RequestCard({
  request,
  onSelect,
}: {
  request: ApprovalRequest;
  onSelect: (id: string) => void;
}) {
  return (
    <div
      className="p-4 bg-white border rounded-lg hover:shadow-sm cursor-pointer transition-shadow"
      onClick={() => onSelect(request.id)}
    >
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-surface-500 uppercase">{request.scope}</span>
          <ApprovalStatusBadge status={request.status} />
        </div>
        <span className="text-xs text-surface-400">
          {new Date(request.createdAt).toLocaleDateString()}
        </span>
      </div>
      <div className="text-sm text-surface-700">
        <span className="font-medium">{request.subjectType}</span>
        <span className="text-surface-400 ml-2">#{request.subjectId.slice(0, 8)}</span>
      </div>
      <div className="text-xs text-surface-400 mt-1">
        Requested by {request.requester?.name ?? 'Unknown'}
      </div>
      {request.snapshotChain && request.snapshotChain.length > 0 && (
        <div className="mt-3">
          <ChainSteps chain={request.snapshotChain} currentLevel={request.currentLevel} />
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Request Detail Modal
// ============================================================================

function RequestDetailModal({
  requestId,
  onClose,
}: {
  requestId: string;
  onClose: () => void;
}) {
  const { data: request, isLoading } = useApprovalRequest(requestId);
  const submitDecision = useSubmitDecision();
  const cancelReq = useCancelRequest();
  const [comments, setComments] = useState('');

  if (isLoading || !request) {
    return (
      <Modal isOpen title="Approval Request" onClose={onClose}>
        <div className="p-4 text-surface-400">Loading...</div>
      </Modal>
    );
  }

  const canDecide = request.status === 'PENDING';
  const canCancel = request.status === 'PENDING';

  const handleDecision = (decision: 'APPROVED' | 'REJECTED') => {
    submitDecision.mutate(
      { requestId, decision, comments: comments || undefined },
      { onSuccess: onClose },
    );
  };

  return (
    <Modal isOpen title="Approval Request Detail" onClose={onClose}>
      <div className="space-y-5">
        {/* Header info */}
        <div className="flex items-center gap-3">
          <ApprovalStatusBadge status={request.status} />
          <span className="text-sm text-surface-500">{request.scope}</span>
          <span className="text-sm text-surface-400">
            &middot; {request.subjectType} #{request.subjectId.slice(0, 8)}
          </span>
        </div>

        {/* Chain */}
        {request.snapshotChain && request.snapshotChain.length > 0 && (
          <div>
            <h3 className="text-sm font-medium text-surface-700 mb-2">Approval Chain</h3>
            <ChainSteps chain={request.snapshotChain} currentLevel={request.currentLevel} />
          </div>
        )}

        {/* Decisions */}
        {request.decisions && request.decisions.length > 0 && (
          <div>
            <h3 className="text-sm font-medium text-surface-700 mb-2">Decisions</h3>
            <div className="space-y-2">
              {request.decisions.map((d) => (
                <div key={d.id} className="flex items-start gap-3 p-2 bg-surface-50 rounded text-sm">
                  <span
                    className={`font-medium ${
                      d.decision === 'APPROVED' ? 'text-green-600' : 'text-red-600'
                    }`}
                  >
                    {d.decision}
                  </span>
                  <div className="flex-1">
                    <span className="text-surface-700">{d.decider?.name}</span>
                    <span className="text-surface-400 ml-2">L{d.level}</span>
                    {d.comments && (
                      <p className="text-surface-500 mt-1">{d.comments}</p>
                    )}
                  </div>
                  <span className="text-xs text-surface-400">
                    {new Date(d.decidedAt).toLocaleDateString()}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Actions */}
        {canDecide && (
          <div className="border-t pt-4">
            <h3 className="text-sm font-medium text-surface-700 mb-2">Your Decision</h3>
            <textarea
              className="w-full border rounded px-3 py-2 text-sm mb-3"
              rows={3}
              placeholder="Comments (optional, required for rejection)"
              value={comments}
              onChange={(e) => setComments(e.target.value)}
            />
            <div className="flex gap-2">
              <button
                className="px-4 py-2 text-sm bg-green-600 text-white rounded hover:bg-green-700"
                onClick={() => handleDecision('APPROVED')}
                disabled={submitDecision.isPending}
              >
                Approve
              </button>
              <button
                className="px-4 py-2 text-sm bg-red-600 text-white rounded hover:bg-red-700"
                onClick={() => handleDecision('REJECTED')}
                disabled={submitDecision.isPending}
              >
                Reject
              </button>
              {canCancel && (
                <button
                  className="px-4 py-2 text-sm text-surface-600 border rounded hover:bg-surface-50 ml-auto"
                  onClick={() => {
                    cancelReq.mutate(requestId, { onSuccess: onClose });
                  }}
                  disabled={cancelReq.isPending}
                >
                  Cancel Request
                </button>
              )}
            </div>
          </div>
        )}

        {/* Metadata */}
        <div className="text-xs text-surface-400 border-t pt-3 space-y-1">
          <div>Created: {new Date(request.createdAt).toLocaleString()}</div>
          {request.resolvedAt && (
            <div>Resolved: {new Date(request.resolvedAt).toLocaleString()}</div>
          )}
          <div>Requester: {request.requester?.name} ({request.requester?.email})</div>
        </div>
      </div>
    </Modal>
  );
}

// ============================================================================
// Main Page
// ============================================================================

export function Approvals() {
  const [activeTab, setActiveTab] = useState<'inbox' | 'my'>('inbox');
  const [selectedRequestId, setSelectedRequestId] = useState<string | null>(null);

  const { data: inboxData, isLoading: inboxLoading } = useApproverInbox();
  const { data: myData, isLoading: myLoading } = useMyRequests();

  const inboxRequests = inboxData?.data ?? [];
  const myRequests = myData?.data ?? [];

  const tabs = [
    { key: 'inbox' as const, label: 'Inbox', count: inboxData?.pagination?.total ?? 0 },
    { key: 'my' as const, label: 'My Requests', count: myData?.pagination?.total ?? 0 },
  ];

  const requests = activeTab === 'inbox' ? inboxRequests : myRequests;
  const isLoading = activeTab === 'inbox' ? inboxLoading : myLoading;

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="px-6 py-4 border-b bg-white">
        <h1 className="text-xl font-semibold text-surface-900">Approvals</h1>
        <p className="text-sm text-surface-500 mt-1">
          Review and manage approval requests
        </p>
      </div>

      {/* Tabs */}
      <div className="px-6 pt-4">
        <div className="flex gap-1 border-b">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                activeTab === tab.key
                  ? 'text-accent-600 border-accent-600'
                  : 'text-surface-500 border-transparent hover:text-surface-700'
              }`}
              onClick={() => setActiveTab(tab.key)}
            >
              {tab.label}
              {tab.count > 0 && (
                <span
                  className={`ml-2 px-1.5 py-0.5 text-xs rounded-full ${
                    activeTab === tab.key
                      ? 'bg-accent-100 text-accent-700'
                      : 'bg-surface-100 text-surface-500'
                  }`}
                >
                  {tab.count}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Request list */}
      <div className="flex-1 overflow-y-auto px-6 py-4">
        {isLoading ? (
          <div className="text-sm text-surface-400">Loading...</div>
        ) : requests.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-surface-400 text-sm">
              {activeTab === 'inbox'
                ? 'No pending approval requests'
                : 'You have no approval requests'}
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {requests.map((req) => (
              <RequestCard
                key={req.id}
                request={req}
                onSelect={setSelectedRequestId}
              />
            ))}
          </div>
        )}
      </div>

      {selectedRequestId && (
        <RequestDetailModal
          requestId={selectedRequestId}
          onClose={() => setSelectedRequestId(null)}
        />
      )}
    </div>
  );
}
