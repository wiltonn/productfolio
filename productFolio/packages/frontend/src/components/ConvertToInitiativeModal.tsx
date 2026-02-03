import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useConvertToInitiative } from '../hooks/useIntakeRequests';
import { useUsers } from '../hooks/useUsers';
import { usePortfolioAreas } from '../hooks/usePortfolioAreas';
import type { IntakeRequest } from '../types/intake-request';

interface ConvertToInitiativeModalProps {
  intakeRequest: IntakeRequest;
  onClose: () => void;
}

export function ConvertToInitiativeModal({
  intakeRequest,
  onClose,
}: ConvertToInitiativeModalProps) {
  const navigate = useNavigate();
  const [title, setTitle] = useState(intakeRequest.title);
  const [description, setDescription] = useState(
    intakeRequest.description || ''
  );
  const [businessOwnerId, setBusinessOwnerId] = useState(
    intakeRequest.sponsorId || ''
  );
  const [productOwnerId, setProductOwnerId] = useState(
    intakeRequest.requestedById || ''
  );
  const [portfolioAreaId, setPortfolioAreaId] = useState(
    intakeRequest.portfolioAreaId || ''
  );
  const [productLeaderId, setProductLeaderId] = useState('');
  const [targetQuarter, setTargetQuarter] = useState(
    intakeRequest.targetQuarter || ''
  );

  const convertMutation = useConvertToInitiative();
  const { data: users } = useUsers();
  const { data: areas } = usePortfolioAreas();

  const userList = Array.isArray(users) ? users : users?.data ?? [];
  const areaList = Array.isArray(areas) ? areas : areas?.data ?? [];

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!businessOwnerId || !productOwnerId) return;

    convertMutation.mutate(
      {
        id: intakeRequest.id,
        data: {
          title: title.trim() || undefined,
          description: description.trim() || null,
          businessOwnerId,
          productOwnerId,
          portfolioAreaId: portfolioAreaId || null,
          productLeaderId: productLeaderId || null,
          targetQuarter: targetQuarter || null,
        },
      },
      {
        onSuccess: (result) => {
          onClose();
          if (result?.initiative?.id) {
            navigate(`/initiatives/${result.initiative.id}`);
          }
        },
      }
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div
        className="absolute inset-0 bg-black/50"
        onClick={onClose}
        aria-hidden="true"
      />
      <div className="relative bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto m-4">
        <div className="px-6 py-4 border-b border-surface-200">
          <h2 className="text-lg font-semibold text-surface-900">
            Convert to Initiative
          </h2>
          <p className="text-sm text-surface-500 mt-1">
            This will create a new Initiative from this intake request and
            transition it to CONVERTED status.
          </p>
        </div>
        <form onSubmit={handleSubmit} className="px-6 py-4 space-y-4">
          {/* Source info */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
            <div className="text-xs font-medium text-blue-700 mb-1">
              Intake Source
            </div>
            <div className="text-sm text-blue-900">
              {intakeRequest.title}
              {intakeRequest.intakeItem && (
                <span className="text-blue-500 ml-2">
                  ({intakeRequest.intakeItem.jiraIssueKey})
                </span>
              )}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-surface-700 mb-1">
              Initiative Title
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full px-3 py-2 border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-accent-500"
            />
            <p className="text-xs text-surface-400 mt-1">
              Pre-filled from intake request. Override if needed.
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-surface-700 mb-1">
              Description
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              className="w-full px-3 py-2 border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-accent-500"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-surface-700 mb-1">
                Business Owner *
              </label>
              <select
                value={businessOwnerId}
                onChange={(e) => setBusinessOwnerId(e.target.value)}
                required
                className="w-full px-3 py-2 border border-surface-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-accent-500"
              >
                <option value="">Select...</option>
                {userList.map((u: any) => (
                  <option key={u.id} value={u.id}>
                    {u.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-surface-700 mb-1">
                Product Owner *
              </label>
              <select
                value={productOwnerId}
                onChange={(e) => setProductOwnerId(e.target.value)}
                required
                className="w-full px-3 py-2 border border-surface-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-accent-500"
              >
                <option value="">Select...</option>
                {userList.map((u: any) => (
                  <option key={u.id} value={u.id}>
                    {u.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-surface-700 mb-1">
                Portfolio Area
              </label>
              <select
                value={portfolioAreaId}
                onChange={(e) => setPortfolioAreaId(e.target.value)}
                className="w-full px-3 py-2 border border-surface-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-accent-500"
              >
                <option value="">Select...</option>
                {areaList.map((a: any) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-surface-700 mb-1">
                Product Leader
              </label>
              <select
                value={productLeaderId}
                onChange={(e) => setProductLeaderId(e.target.value)}
                className="w-full px-3 py-2 border border-surface-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-accent-500"
              >
                <option value="">Select...</option>
                {userList.map((u: any) => (
                  <option key={u.id} value={u.id}>
                    {u.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-surface-700 mb-1">
              Target Quarter
            </label>
            <input
              type="text"
              value={targetQuarter}
              onChange={(e) => setTargetQuarter(e.target.value)}
              placeholder="2026-Q2"
              className="w-full px-3 py-2 border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-accent-500"
            />
          </div>

          <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
            <div className="text-xs font-medium text-amber-700">
              What happens on conversion:
            </div>
            <ul className="text-xs text-amber-600 mt-1 space-y-0.5 list-disc pl-4">
              <li>A new Initiative will be created in PROPOSED status</li>
              <li>The intake request will move to CONVERTED (read-only)</li>
              <li>A snapshot of the current intake data will be preserved</li>
              <li>The initiative will be marked as Intake-origin</li>
            </ul>
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t border-surface-200">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-surface-700 bg-white border border-surface-300 rounded-lg hover:bg-surface-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={
                !businessOwnerId ||
                !productOwnerId ||
                convertMutation.isPending
              }
              className="px-4 py-2 text-sm font-medium text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {convertMutation.isPending
                ? 'Converting...'
                : 'Convert to Initiative'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
