import { useState } from 'react';
import { Modal, Select } from './ui';
import { useCreateInitiative } from '../hooks/useInitiatives';
import { useUsers } from '../hooks/useUsers';
import { usePortfolioAreaNodes } from '../hooks/usePortfolioAreaNodes';
import { getQuarterOptions } from '../types';

interface CreateInitiativeModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function CreateInitiativeModal({ isOpen, onClose }: CreateInitiativeModalProps) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [businessOwnerId, setBusinessOwnerId] = useState('');
  const [productOwnerId, setProductOwnerId] = useState('');
  const [orgNodeId, setOrgNodeId] = useState('');
  const [productLeaderId, setProductLeaderId] = useState('');
  const [targetQuarter, setTargetQuarter] = useState('');

  const createInitiative = useCreateInitiative();
  const { data: usersData } = useUsers();
  const { data: portfolioAreaNodes } = usePortfolioAreaNodes();

  const users = usersData?.data ?? [];
  const userOptions = users.map((user) => ({
    value: user.id,
    label: user.name,
  }));

  const portfolioAreaOptions = (portfolioAreaNodes ?? []).map((node) => ({
    value: node.id,
    label: node.name,
  }));

  const quarterOptions = getQuarterOptions();

  const resetForm = () => {
    setTitle('');
    setDescription('');
    setBusinessOwnerId('');
    setProductOwnerId('');
    setOrgNodeId('');
    setProductLeaderId('');
    setTargetQuarter('');
  };

  const handleClose = () => {
    resetForm();
    onClose();
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!title.trim() || !businessOwnerId || !productOwnerId) {
      return;
    }

    createInitiative.mutate(
      {
        title: title.trim(),
        description: description.trim() || null,
        businessOwnerId,
        productOwnerId,
        orgNodeId: orgNodeId || null,
        productLeaderId: productLeaderId || null,
        targetQuarter: targetQuarter || null,
      },
      {
        onSuccess: () => {
          handleClose();
        },
      }
    );
  };

  const isValid = title.trim() && businessOwnerId && productOwnerId;

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title="New Initiative" size="lg">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="title" className="block text-sm font-medium text-surface-700 mb-1">
            Title <span className="text-red-500">*</span>
          </label>
          <input
            id="title"
            name="title"
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Enter initiative title"
            required
            className="w-full px-3 py-2 text-sm border border-surface-300 rounded-md
                       focus:outline-none focus:ring-2 focus:ring-accent-500 focus:border-accent-500
                       placeholder:text-surface-400"
          />
        </div>

        <div>
          <label htmlFor="description" className="block text-sm font-medium text-surface-700 mb-1">
            Description
          </label>
          <textarea
            id="description"
            name="description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Enter initiative description (optional)"
            rows={3}
            className="w-full px-3 py-2 text-sm border border-surface-300 rounded-md
                       focus:outline-none focus:ring-2 focus:ring-accent-500 focus:border-accent-500
                       placeholder:text-surface-400 resize-none"
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-surface-700 mb-1">
              Business Owner <span className="text-red-500">*</span>
            </label>
            <Select
              options={userOptions}
              value={businessOwnerId}
              onChange={setBusinessOwnerId}
              placeholder="Select business owner"
              allowClear={false}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-surface-700 mb-1">
              Product Owner <span className="text-red-500">*</span>
            </label>
            <Select
              options={userOptions}
              value={productOwnerId}
              onChange={setProductOwnerId}
              placeholder="Select product owner"
              allowClear={false}
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-surface-700 mb-1">
              Portfolio Area
            </label>
            <Select
              options={portfolioAreaOptions}
              value={orgNodeId}
              onChange={setOrgNodeId}
              placeholder="Select portfolio area (optional)"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-surface-700 mb-1">
              Product Leader
            </label>
            <Select
              options={userOptions}
              value={productLeaderId}
              onChange={setProductLeaderId}
              placeholder="Select product leader (optional)"
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-surface-700 mb-1">
            Target Quarter
          </label>
          <Select
            options={quarterOptions}
            value={targetQuarter}
            onChange={setTargetQuarter}
            placeholder="Select quarter (optional)"
            className="w-full"
          />
        </div>

        <div className="flex justify-end gap-3 pt-4 border-t border-surface-200">
          <button
            type="button"
            onClick={handleClose}
            className="px-4 py-2 text-sm font-medium text-surface-700 bg-white border border-surface-300
                       rounded-md hover:bg-surface-50 transition-colors"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={!isValid || createInitiative.isPending}
            className="px-4 py-2 text-sm font-medium text-white bg-accent-600
                       rounded-md hover:bg-accent-700 transition-colors
                       disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {createInitiative.isPending ? 'Creating...' : 'Create Initiative'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
