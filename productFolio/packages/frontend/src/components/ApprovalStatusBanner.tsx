import { useApprovalStatus, useRequestApproval } from '../hooks/useApprovalStatus';
import type { ApprovalScope, ChainStep } from '../types';

interface ApprovalStatusBannerProps {
  subjectType: 'initiative' | 'scenario' | 'allocation';
  subjectId: string;
  scope: ApprovalScope;
  /** If true, enforcement is ADVISORY — show as warning, not blocking */
  advisory?: boolean;
}

function ChainPreview({ chain }: { chain: ChainStep[] }) {
  if (!chain || chain.length === 0) return null;
  return (
    <div className="mt-2 flex items-center gap-1.5 text-xs">
      {chain.map((step, i) => (
        <span key={step.level} className="flex items-center gap-1">
          {i > 0 && (
            <svg className="w-3 h-3 text-current opacity-40" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
            </svg>
          )}
          <span className="font-medium">{step.orgNodeName}</span>
          <span className="opacity-60">
            ({step.resolvedApprovers.map((a) => a.name).join(', ') || step.ruleType})
          </span>
        </span>
      ))}
    </div>
  );
}

export function ApprovalStatusBanner({
  subjectType,
  subjectId,
  scope,
  advisory = false,
}: ApprovalStatusBannerProps) {
  const { data: approvalStatus, isLoading } = useApprovalStatus(subjectType, subjectId);
  const requestApproval = useRequestApproval();

  if (isLoading || !approvalStatus) return null;

  const { status, pendingRequest, latestRequest } = approvalStatus;

  // No requests and no indication approval is needed — render nothing
  if (status === 'none') return null;

  // PENDING: yellow/amber banner
  if (status === 'pending' && pendingRequest) {
    const chain = pendingRequest.snapshotChain ?? [];
    return (
      <div className={`rounded-lg border px-4 py-3 mb-4 ${
        advisory
          ? 'bg-amber-50/60 border-amber-200 text-amber-800'
          : 'bg-yellow-50 border-yellow-200 text-yellow-800'
      }`}>
        <div className="flex items-center gap-2">
          <svg className="w-5 h-5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <span className="text-sm font-medium">
            Approval Pending
            {advisory && <span className="ml-1 font-normal opacity-70">(Advisory)</span>}
          </span>
          <span className="text-xs opacity-60 ml-auto">
            Level {pendingRequest.currentLevel} of {chain.length}
          </span>
        </div>
        <ChainPreview chain={chain} />
      </div>
    );
  }

  // APPROVED: green banner
  if (status === 'approved' && latestRequest) {
    return (
      <div className="rounded-lg border px-4 py-3 mb-4 bg-green-50 border-green-200 text-green-800">
        <div className="flex items-center gap-2">
          <svg className="w-5 h-5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <span className="text-sm font-medium">Approved</span>
          {latestRequest.resolvedAt && (
            <span className="text-xs opacity-60 ml-auto">
              {new Date(latestRequest.resolvedAt).toLocaleDateString()}
            </span>
          )}
        </div>
      </div>
    );
  }

  // REJECTED: red banner with option to re-request
  if (status === 'rejected' && latestRequest) {
    return (
      <div className={`rounded-lg border px-4 py-3 mb-4 ${
        advisory
          ? 'bg-orange-50 border-orange-200 text-orange-800'
          : 'bg-red-50 border-red-200 text-red-800'
      }`}>
        <div className="flex items-center gap-2">
          <svg className="w-5 h-5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9.75 9.75l4.5 4.5m0-4.5l-4.5 4.5M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <span className="text-sm font-medium">
            {advisory ? 'Approval Declined (Advisory)' : 'Approval Rejected'}
          </span>
          <button
            onClick={() =>
              requestApproval.mutate({
                scope,
                subjectType,
                subjectId,
              })
            }
            disabled={requestApproval.isPending}
            className="ml-auto text-xs font-medium underline underline-offset-2 hover:opacity-80"
          >
            {requestApproval.isPending ? 'Submitting...' : 'Re-request Approval'}
          </button>
        </div>
      </div>
    );
  }

  return null;
}
