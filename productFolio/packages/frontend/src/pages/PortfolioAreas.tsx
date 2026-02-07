import { useState } from 'react';
import {
  usePortfolioAreas,
  useCreatePortfolioArea,
  useUpdatePortfolioArea,
  useDeletePortfolioArea,
} from '../hooks/usePortfolioAreas';
import { Modal } from '../components/ui';

// ============================================================================
// Types
// ============================================================================

interface PortfolioAreaRow {
  id: string;
  name: string;
  createdAt: string;
  _count?: { initiatives: number };
}

// ============================================================================
// Create / Edit Modal
// ============================================================================

function PortfolioAreaModal({
  area,
  onClose,
}: {
  area?: PortfolioAreaRow | null;
  onClose: () => void;
}) {
  const isEdit = !!area;
  const createArea = useCreatePortfolioArea();
  const updateArea = useUpdatePortfolioArea();
  const [name, setName] = useState(area?.name ?? '');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (isEdit) {
      updateArea.mutate(
        { id: area!.id, data: { name } },
        { onSuccess: onClose },
      );
    } else {
      createArea.mutate({ name }, { onSuccess: onClose });
    }
  };

  const isPending = createArea.isPending || updateArea.isPending;

  return (
    <Modal isOpen title={isEdit ? 'Edit Portfolio Area' : 'Add Portfolio Area'} onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-surface-700 mb-1">Name</label>
          <input
            className="w-full border rounded px-3 py-2 text-sm"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Platform Engineering"
            required
            autoFocus
          />
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" className="btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button
            type="submit"
            className="btn-primary"
            disabled={isPending || !name.trim()}
          >
            {isPending ? (isEdit ? 'Saving...' : 'Creating...') : isEdit ? 'Save' : 'Create'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

// ============================================================================
// Delete Confirmation Modal
// ============================================================================

function DeleteConfirmModal({
  area,
  onClose,
}: {
  area: PortfolioAreaRow;
  onClose: () => void;
}) {
  const deleteArea = useDeletePortfolioArea();

  const handleDelete = () => {
    deleteArea.mutate(area.id, { onSuccess: onClose });
  };

  return (
    <Modal isOpen title="Delete Portfolio Area" onClose={onClose}>
      <div className="space-y-4">
        <p className="text-sm text-surface-600">
          Are you sure you want to delete <strong>{area.name}</strong>? This action cannot be undone.
        </p>
        {(area._count?.initiatives ?? 0) > 0 && (
          <div className="p-3 bg-amber-50 border border-amber-200 rounded text-sm text-amber-800">
            This area has {area._count!.initiatives} initiative(s) assigned. You must reassign or remove them before deleting.
          </div>
        )}
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" className="btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button
            className="btn-danger"
            onClick={handleDelete}
            disabled={deleteArea.isPending}
          >
            {deleteArea.isPending ? 'Deleting...' : 'Delete'}
          </button>
        </div>
      </div>
    </Modal>
  );
}

// ============================================================================
// Main Page
// ============================================================================

export function PortfolioAreas() {
  const { data, isLoading } = usePortfolioAreas();
  const areas: PortfolioAreaRow[] = data?.data ?? [];

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editArea, setEditArea] = useState<PortfolioAreaRow | null>(null);
  const [deleteArea, setDeleteArea] = useState<PortfolioAreaRow | null>(null);

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="px-6 py-4 border-b bg-white">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold text-surface-900">Portfolio Areas</h1>
            <p className="text-sm text-surface-500 mt-1">
              Manage portfolio areas used to group initiatives
            </p>
          </div>
          <button
            className="btn-primary"
            onClick={() => setShowCreateModal(true)}
          >
            + Add Portfolio Area
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="flex-1 px-6 py-6">
        <div className="bg-white rounded-lg border">
          {isLoading ? (
            <div className="p-8 text-center text-sm text-surface-400">Loading portfolio areas...</div>
          ) : areas.length === 0 ? (
            <div className="p-8 text-center text-sm text-surface-400">
              No portfolio areas yet. Create one to get started.
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-surface-50">
                  <th className="text-left px-4 py-3 font-medium text-surface-600">Name</th>
                  <th className="text-left px-4 py-3 font-medium text-surface-600">Initiatives</th>
                  <th className="text-left px-4 py-3 font-medium text-surface-600">Created</th>
                  <th className="text-right px-4 py-3 font-medium text-surface-600">Actions</th>
                </tr>
              </thead>
              <tbody>
                {areas.map((area) => (
                  <tr key={area.id} className="border-b last:border-b-0 hover:bg-surface-50">
                    <td className="px-4 py-3 font-medium text-surface-900">{area.name}</td>
                    <td className="px-4 py-3 text-surface-600">
                      {area._count?.initiatives ?? 0}
                    </td>
                    <td className="px-4 py-3 text-surface-500">
                      {new Date(area.createdAt).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        className="px-2 py-1 text-xs font-medium text-accent-700 hover:bg-accent-50 rounded transition-colors mr-2"
                        onClick={() => setEditArea(area)}
                      >
                        Edit
                      </button>
                      <button
                        className="text-xs text-red-600 hover:text-red-700"
                        onClick={() => setDeleteArea(area)}
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Modals */}
      {showCreateModal && (
        <PortfolioAreaModal onClose={() => setShowCreateModal(false)} />
      )}
      {editArea && (
        <PortfolioAreaModal area={editArea} onClose={() => setEditArea(null)} />
      )}
      {deleteArea && (
        <DeleteConfirmModal area={deleteArea} onClose={() => setDeleteArea(null)} />
      )}
    </div>
  );
}
