import { useState } from 'react';
import type { InitiativeStatus } from '../../types';

interface BulkActionsBarProps {
  selectedCount: number;
  onClearSelection: () => void;
  onStatusChange: (status: InitiativeStatus) => void;
  onAddTags: (tags: string[]) => void;
  onDelete?: () => void;
}

const statusOptions: { value: InitiativeStatus; label: string }[] = [
  { value: 'DRAFT', label: 'Draft' },
  { value: 'PENDING_APPROVAL', label: 'Pending Approval' },
  { value: 'APPROVED', label: 'Approved' },
  { value: 'IN_PROGRESS', label: 'In Progress' },
  { value: 'COMPLETED', label: 'Completed' },
  { value: 'ON_HOLD', label: 'On Hold' },
];

export function BulkActionsBar({
  selectedCount,
  onClearSelection,
  onStatusChange,
  onAddTags,
  onDelete,
}: BulkActionsBarProps) {
  const [showStatusMenu, setShowStatusMenu] = useState(false);
  const [showTagInput, setShowTagInput] = useState(false);
  const [tagInput, setTagInput] = useState('');

  const handleAddTag = () => {
    if (tagInput.trim()) {
      onAddTags([tagInput.trim()]);
      setTagInput('');
      setShowTagInput(false);
    }
  };

  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 animate-slide-up">
      <div className="flex items-center gap-3 px-4 py-3 bg-surface-900 text-white rounded-xl shadow-raised">
        {/* Selection count */}
        <div className="flex items-center gap-2 pr-3 border-r border-surface-700">
          <span className="flex items-center justify-center w-6 h-6 bg-accent-500 rounded-md text-xs font-bold">
            {selectedCount}
          </span>
          <span className="text-sm font-medium">selected</span>
        </div>

        {/* Status change */}
        <div className="relative">
          <button
            type="button"
            onClick={() => setShowStatusMenu(!showStatusMenu)}
            className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium rounded-md hover:bg-surface-800 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            Status
          </button>
          {showStatusMenu && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setShowStatusMenu(false)} />
              <div className="absolute bottom-full mb-2 left-0 bg-white border border-surface-200 rounded-lg shadow-elevated overflow-hidden z-50 min-w-40">
                {statusOptions.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => {
                      onStatusChange(option.value);
                      setShowStatusMenu(false);
                    }}
                    className="w-full px-3 py-2 text-sm text-left text-surface-700 hover:bg-surface-50 transition-colors"
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>

        {/* Add tag */}
        <div className="relative">
          {showTagInput ? (
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleAddTag()}
                placeholder="Tag name"
                className="px-2 py-1 text-sm bg-surface-800 border border-surface-700 rounded text-white placeholder:text-surface-400 focus:outline-none focus:ring-1 focus:ring-accent-500"
                autoFocus
              />
              <button
                type="button"
                onClick={handleAddTag}
                className="p-1 text-accent-400 hover:text-accent-300 transition-colors"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowTagInput(false);
                  setTagInput('');
                }}
                className="p-1 text-surface-400 hover:text-surface-300 transition-colors"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setShowTagInput(true)}
              className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium rounded-md hover:bg-surface-800 transition-colors"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
              </svg>
              Add Tag
            </button>
          )}
        </div>

        {/* Delete */}
        {onDelete && (
          <button
            type="button"
            onClick={onDelete}
            className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-red-400 rounded-md hover:bg-red-500/10 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
            Delete
          </button>
        )}

        {/* Divider */}
        <div className="w-px h-6 bg-surface-700" />

        {/* Clear selection */}
        <button
          type="button"
          onClick={onClearSelection}
          className="p-1.5 text-surface-400 hover:text-white rounded-md hover:bg-surface-800 transition-colors"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
    </div>
  );
}
