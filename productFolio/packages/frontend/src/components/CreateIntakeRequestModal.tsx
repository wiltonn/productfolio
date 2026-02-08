import { useState } from 'react';
import { useCreateIntakeRequest } from '../hooks/useIntakeRequests';
import { useUsers } from '../hooks/useUsers';
import { usePortfolioAreaNodes } from '../hooks/usePortfolioAreaNodes';

interface CreateIntakeRequestModalProps {
  onClose: () => void;
  prefill?: {
    title?: string;
    description?: string;
    intakeItemId?: string;
    sourceType?: 'JIRA';
  };
}

export function CreateIntakeRequestModal({
  onClose,
  prefill,
}: CreateIntakeRequestModalProps) {
  const [title, setTitle] = useState(prefill?.title || '');
  const [description, setDescription] = useState(prefill?.description || '');
  const [requestedById, setRequestedById] = useState('');
  const [sponsorId, setSponsorId] = useState('');
  const [orgNodeId, setOrgNodeId] = useState('');
  const [targetQuarter, setTargetQuarter] = useState('');
  const [valueScore, setValueScore] = useState<string>('');
  const [effortEstimate, setEffortEstimate] = useState('');
  const [urgency, setUrgency] = useState('');
  const [customerName, setCustomerName] = useState('');

  const createMutation = useCreateIntakeRequest();
  const { data: users } = useUsers();
  const { data: areas } = usePortfolioAreaNodes();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;

    createMutation.mutate(
      {
        title: title.trim(),
        description: description.trim() || null,
        requestedById: requestedById || null,
        sponsorId: sponsorId || null,
        orgNodeId: orgNodeId || null,
        targetQuarter: targetQuarter || null,
        valueScore: valueScore ? parseInt(valueScore, 10) : null,
        effortEstimate: effortEstimate || null,
        urgency: urgency || null,
        customerName: customerName.trim() || null,
        intakeItemId: prefill?.intakeItemId || null,
        sourceType: prefill?.sourceType || null,
      },
      {
        onSuccess: () => onClose(),
      }
    );
  };

  const userList = Array.isArray(users) ? users : users?.data ?? [];
  const areaList = Array.isArray(areas) ? areas : (areas ?? []);

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
            New Intake Request
          </h2>
        </div>
        <form onSubmit={handleSubmit} className="px-6 py-4 space-y-4">
          <div>
            <label className="block text-sm font-medium text-surface-700 mb-1">
              Title *
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
              className="w-full px-3 py-2 border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-accent-500"
              placeholder="Brief description of the request"
            />
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
              placeholder="Detailed description of the opportunity or request"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-surface-700 mb-1">
                Requested By
              </label>
              <select
                value={requestedById}
                onChange={(e) => setRequestedById(e.target.value)}
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
                Sponsor
              </label>
              <select
                value={sponsorId}
                onChange={(e) => setSponsorId(e.target.value)}
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
                value={orgNodeId}
                onChange={(e) => setOrgNodeId(e.target.value)}
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
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-surface-700 mb-1">
                Value Score
              </label>
              <input
                type="number"
                min="1"
                max="10"
                value={valueScore}
                onChange={(e) => setValueScore(e.target.value)}
                placeholder="1-10"
                className="w-full px-3 py-2 border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-accent-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-surface-700 mb-1">
                Effort Estimate
              </label>
              <select
                value={effortEstimate}
                onChange={(e) => setEffortEstimate(e.target.value)}
                className="w-full px-3 py-2 border border-surface-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-accent-500"
              >
                <option value="">Select...</option>
                <option value="XS">XS</option>
                <option value="S">S</option>
                <option value="M">M</option>
                <option value="L">L</option>
                <option value="XL">XL</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-surface-700 mb-1">
                Urgency
              </label>
              <select
                value={urgency}
                onChange={(e) => setUrgency(e.target.value)}
                className="w-full px-3 py-2 border border-surface-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-accent-500"
              >
                <option value="">Select...</option>
                <option value="LOW">Low</option>
                <option value="MEDIUM">Medium</option>
                <option value="HIGH">High</option>
                <option value="CRITICAL">Critical</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-surface-700 mb-1">
              Customer / Stakeholder
            </label>
            <input
              type="text"
              value={customerName}
              onChange={(e) => setCustomerName(e.target.value)}
              placeholder="Customer or stakeholder name"
              className="w-full px-3 py-2 border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-accent-500"
            />
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
              disabled={!title.trim() || createMutation.isPending}
              className="px-4 py-2 text-sm font-medium text-white bg-accent-600 rounded-lg hover:bg-accent-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {createMutation.isPending ? 'Creating...' : 'Create'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
