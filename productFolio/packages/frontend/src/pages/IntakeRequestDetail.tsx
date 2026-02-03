import { useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import {
  useIntakeRequest,
  useTransitionIntakeRequestStatus,
  useUpdateIntakeRequest,
  useDeleteIntakeRequest,
} from '../hooks/useIntakeRequests';
import { ConvertToInitiativeModal } from '../components/ConvertToInitiativeModal';
import type { IntakeRequestStatus } from '../types/intake-request';

const STATUS_COLORS: Record<IntakeRequestStatus, { bg: string; text: string }> = {
  DRAFT: { bg: 'bg-surface-100', text: 'text-surface-600' },
  TRIAGE: { bg: 'bg-yellow-50', text: 'text-yellow-700' },
  ASSESSED: { bg: 'bg-orange-50', text: 'text-orange-700' },
  APPROVED: { bg: 'bg-emerald-50', text: 'text-emerald-700' },
  CONVERTED: { bg: 'bg-blue-50', text: 'text-blue-700' },
  CLOSED: { bg: 'bg-surface-50', text: 'text-surface-400' },
};

const VALID_TRANSITIONS: Record<IntakeRequestStatus, IntakeRequestStatus[]> = {
  DRAFT: ['TRIAGE', 'CLOSED'],
  TRIAGE: ['ASSESSED', 'DRAFT', 'CLOSED'],
  ASSESSED: ['APPROVED', 'TRIAGE', 'CLOSED'],
  APPROVED: ['ASSESSED', 'CLOSED'],
  CONVERTED: ['CLOSED'],
  CLOSED: ['DRAFT'],
};

const TRANSITION_LABELS: Record<string, string> = {
  DRAFT: 'Move to Draft',
  TRIAGE: 'Send to Triage',
  ASSESSED: 'Mark Assessed',
  APPROVED: 'Approve',
  CLOSED: 'Close',
};

export function IntakeRequestDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data: item, isLoading } = useIntakeRequest(id || '');
  const transitionMutation = useTransitionIntakeRequestStatus();
  const updateMutation = useUpdateIntakeRequest();
  const deleteMutation = useDeleteIntakeRequest();

  const [showConvertModal, setShowConvertModal] = useState(false);
  const [editingNotes, setEditingNotes] = useState(false);
  const [notes, setNotes] = useState('');

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16 text-surface-400">
        Loading...
      </div>
    );
  }

  if (!item) {
    return (
      <div className="flex items-center justify-center py-16 text-surface-400">
        Intake request not found
      </div>
    );
  }

  const statusColors = STATUS_COLORS[item.status] || STATUS_COLORS.DRAFT;
  const nextStatuses = VALID_TRANSITIONS[item.status] || [];

  const handleTransition = (newStatus: IntakeRequestStatus) => {
    transitionMutation.mutate({ id: item.id, newStatus });
  };

  const handleSaveNotes = () => {
    updateMutation.mutate(
      { id: item.id, data: { decisionNotes: notes } },
      { onSuccess: () => setEditingNotes(false) }
    );
  };

  const handleDelete = () => {
    if (confirm('Are you sure you want to delete this intake request?')) {
      deleteMutation.mutate(item.id, {
        onSuccess: () => navigate('/intake-requests'),
      });
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <div className="flex items-center gap-3 mb-2">
            <Link
              to="/intake-requests"
              className="text-sm text-surface-500 hover:text-surface-700"
            >
              Intake Pipeline
            </Link>
            <span className="text-surface-300">/</span>
          </div>
          <h1 className="text-2xl font-bold text-surface-900">{item.title}</h1>
          <div className="flex items-center gap-3 mt-2">
            <span
              className={`inline-flex items-center px-2.5 py-1 rounded-full text-sm font-medium ${statusColors.bg} ${statusColors.text}`}
            >
              {item.status}
            </span>
            {item.urgency && (
              <span className="text-sm text-surface-500">
                Urgency: <span className="font-medium">{item.urgency}</span>
              </span>
            )}
            {item.valueScore != null && (
              <span className="text-sm text-surface-500">
                Value: <span className="font-medium">{item.valueScore}/10</span>
              </span>
            )}
            {item.effortEstimate && (
              <span className="text-sm text-surface-500">
                Effort: <span className="font-medium">{item.effortEstimate}</span>
              </span>
            )}
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2">
          {item.status === 'APPROVED' && !item.initiativeId && (
            <button
              onClick={() => setShowConvertModal(true)}
              className="px-4 py-2 text-sm font-medium text-white bg-emerald-600 rounded-lg hover:bg-emerald-700"
            >
              Convert to Initiative
            </button>
          )}
          {nextStatuses.map((status) => (
            <button
              key={status}
              onClick={() => handleTransition(status)}
              disabled={transitionMutation.isPending}
              className={`px-3 py-2 text-sm font-medium rounded-lg border transition-colors ${
                status === 'CLOSED'
                  ? 'text-red-600 border-red-200 hover:bg-red-50'
                  : 'text-surface-700 border-surface-300 hover:bg-surface-50'
              }`}
            >
              {TRANSITION_LABELS[status] || status}
            </button>
          ))}
          {(item.status === 'DRAFT' || item.status === 'CLOSED') && (
            <button
              onClick={handleDelete}
              className="px-3 py-2 text-sm font-medium text-red-600 border border-red-200 rounded-lg hover:bg-red-50"
            >
              Delete
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-3 gap-6">
        {/* Main Content */}
        <div className="col-span-2 space-y-6">
          {/* Description */}
          <div className="bg-white rounded-lg border border-surface-200 p-6">
            <h2 className="text-sm font-medium text-surface-500 uppercase tracking-wider mb-3">
              Description
            </h2>
            <p className="text-sm text-surface-700 whitespace-pre-wrap">
              {item.description || 'No description provided'}
            </p>
          </div>

          {/* Decision Notes */}
          <div className="bg-white rounded-lg border border-surface-200 p-6">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-medium text-surface-500 uppercase tracking-wider">
                Decision Notes
              </h2>
              {!editingNotes && (
                <button
                  onClick={() => {
                    setNotes(item.decisionNotes || '');
                    setEditingNotes(true);
                  }}
                  className="text-sm text-accent-600 hover:text-accent-700"
                >
                  Edit
                </button>
              )}
            </div>
            {editingNotes ? (
              <div className="space-y-3">
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={4}
                  className="w-full px-3 py-2 border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-accent-500"
                />
                <div className="flex gap-2">
                  <button
                    onClick={handleSaveNotes}
                    disabled={updateMutation.isPending}
                    className="px-3 py-1.5 text-sm font-medium text-white bg-accent-600 rounded-lg hover:bg-accent-700"
                  >
                    Save
                  </button>
                  <button
                    onClick={() => setEditingNotes(false)}
                    className="px-3 py-1.5 text-sm font-medium text-surface-600 border border-surface-300 rounded-lg hover:bg-surface-50"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <p className="text-sm text-surface-700 whitespace-pre-wrap">
                {item.decisionNotes || 'No notes yet'}
              </p>
            )}
          </div>

          {/* Conversion Snapshot (if converted) */}
          {item.conversionSnapshot && (
            <div className="bg-white rounded-lg border border-surface-200 p-6">
              <h2 className="text-sm font-medium text-surface-500 uppercase tracking-wider mb-3">
                Conversion Snapshot
              </h2>
              <div className="text-xs text-surface-400 font-mono bg-surface-50 rounded p-3 overflow-auto">
                <pre>{JSON.stringify(item.conversionSnapshot, null, 2)}</pre>
              </div>
            </div>
          )}
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Details */}
          <div className="bg-white rounded-lg border border-surface-200 p-6">
            <h2 className="text-sm font-medium text-surface-500 uppercase tracking-wider mb-4">
              Details
            </h2>
            <dl className="space-y-3">
              <div>
                <dt className="text-xs text-surface-400">Requested By</dt>
                <dd className="text-sm text-surface-700">
                  {item.requestedBy?.name || '-'}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-surface-400">Sponsor</dt>
                <dd className="text-sm text-surface-700">
                  {item.sponsor?.name || '-'}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-surface-400">Portfolio Area</dt>
                <dd className="text-sm text-surface-700">
                  {item.portfolioArea?.name || '-'}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-surface-400">Target Quarter</dt>
                <dd className="text-sm text-surface-700">
                  {item.targetQuarter || '-'}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-surface-400">Customer</dt>
                <dd className="text-sm text-surface-700">
                  {item.customerName || '-'}
                </dd>
              </div>
              {item.closedReason && (
                <div>
                  <dt className="text-xs text-surface-400">Closed Reason</dt>
                  <dd className="text-sm text-surface-700">
                    {item.closedReason}
                  </dd>
                </div>
              )}
            </dl>
          </div>

          {/* Linked Initiative */}
          {item.initiative && (
            <div className="bg-white rounded-lg border border-blue-200 p-6">
              <h2 className="text-sm font-medium text-blue-700 uppercase tracking-wider mb-3">
                Linked Initiative
              </h2>
              <Link
                to={`/initiatives/${item.initiative.id}`}
                className="text-sm font-medium text-accent-600 hover:text-accent-700"
              >
                {item.initiative.title}
              </Link>
              <div className="mt-1 text-xs text-surface-400">
                Status: {item.initiative.status}
              </div>
            </div>
          )}

          {/* Jira Source */}
          {item.intakeItem && (
            <div className="bg-white rounded-lg border border-surface-200 p-6">
              <h2 className="text-sm font-medium text-surface-500 uppercase tracking-wider mb-3">
                Jira Source
              </h2>
              {item.intakeItem.jiraIssueUrl ? (
                <a
                  href={item.intakeItem.jiraIssueUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm font-medium text-blue-600 hover:text-blue-700"
                >
                  {item.intakeItem.jiraIssueKey}
                </a>
              ) : (
                <span className="text-sm text-surface-700">
                  {item.intakeItem.jiraIssueKey}
                </span>
              )}
              <div className="mt-1 text-xs text-surface-400">
                {item.intakeItem.summary}
              </div>
            </div>
          )}

          {/* Timestamps */}
          <div className="bg-white rounded-lg border border-surface-200 p-6">
            <h2 className="text-sm font-medium text-surface-500 uppercase tracking-wider mb-4">
              Timeline
            </h2>
            <dl className="space-y-2">
              <div>
                <dt className="text-xs text-surface-400">Created</dt>
                <dd className="text-sm text-surface-700">
                  {new Date(item.createdAt).toLocaleString()}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-surface-400">Updated</dt>
                <dd className="text-sm text-surface-700">
                  {new Date(item.updatedAt).toLocaleString()}
                </dd>
              </div>
            </dl>
          </div>
        </div>
      </div>

      {/* Convert Modal */}
      {showConvertModal && (
        <ConvertToInitiativeModal
          intakeRequest={item}
          onClose={() => setShowConvertModal(false)}
        />
      )}
    </div>
  );
}
