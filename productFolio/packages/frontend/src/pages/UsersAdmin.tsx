import { useState, useMemo } from 'react';
import {
  useUsers,
  useCreateUser,
  useUpdateUser,
  useDeactivateUser,
} from '../hooks/useUsers';
import type { User, UserRole, CreateUserInput, UpdateUserInput } from '../hooks/useUsers';
import { Modal, SearchInput } from '../components/ui';

const ROLES: { value: UserRole; label: string }[] = [
  { value: 'ADMIN', label: 'Admin' },
  { value: 'PRODUCT_OWNER', label: 'Product Owner' },
  { value: 'BUSINESS_OWNER', label: 'Business Owner' },
  { value: 'RESOURCE_MANAGER', label: 'Resource Manager' },
  { value: 'VIEWER', label: 'Viewer' },
];

function formatRole(role: string): string {
  return role.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

export function UsersAdmin() {
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [showInactive, setShowInactive] = useState(false);
  const [page, setPage] = useState(1);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [deactivatingUser, setDeactivatingUser] = useState<User | null>(null);

  const filters = useMemo(
    () => ({
      search: search || undefined,
      role: roleFilter || undefined,
      includeInactive: showInactive || undefined,
      page,
      limit: 50,
    }),
    [search, roleFilter, showInactive, page]
  );

  const { data, isLoading } = useUsers(filters);
  const users = data?.data ?? [];
  const totalPages = data?.totalPages ?? 1;
  const total = data?.total ?? 0;

  // Stat counts
  const stats = useMemo(() => {
    const active = users.filter((u) => u.isActive).length;
    const decision = users.filter((u) => u.seatType === 'decision').length;
    const observer = users.filter((u) => u.seatType === 'observer').length;
    return { total: users.length, active, decision, observer };
  }, [users]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-surface-900">User Management</h1>
          <p className="text-sm text-surface-500 mt-1">
            Create, edit, and manage user accounts and roles.
          </p>
        </div>
        <button
          onClick={() => setShowCreateModal(true)}
          className="px-4 py-2 bg-accent-600 text-white rounded-lg text-sm font-medium hover:bg-accent-700 transition-colors"
        >
          Add User
        </button>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-4 gap-4">
        {[
          { label: 'Total', value: total, color: 'text-surface-900' },
          { label: 'Active', value: stats.active, color: 'text-green-600' },
          { label: 'Licensed (Decision)', value: stats.decision, color: 'text-accent-600' },
          { label: 'Observers', value: stats.observer, color: 'text-surface-500' },
        ].map((s) => (
          <div key={s.label} className="bg-white rounded-lg border border-surface-200 p-4">
            <div className="text-xs text-surface-500 uppercase tracking-wide">{s.label}</div>
            <div className={`text-2xl font-bold mt-1 ${s.color}`}>{s.value}</div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex items-center gap-4">
        <div className="w-72">
          <SearchInput
            value={search}
            onChange={setSearch}
            placeholder="Search users..."
          />
        </div>
        <select
          value={roleFilter}
          onChange={(e) => { setRoleFilter(e.target.value); setPage(1); }}
          className="px-3 py-2 border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-accent-500"
        >
          <option value="">All Roles</option>
          {ROLES.map((r) => (
            <option key={r.value} value={r.value}>{r.label}</option>
          ))}
        </select>
        <label className="flex items-center gap-2 text-sm text-surface-600 cursor-pointer">
          <input
            type="checkbox"
            checked={showInactive}
            onChange={(e) => { setShowInactive(e.target.checked); setPage(1); }}
            className="rounded border-surface-300"
          />
          Show inactive
        </label>
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="text-surface-500 text-sm py-12 text-center">Loading users...</div>
      ) : users.length === 0 ? (
        <div className="text-surface-500 text-sm py-12 text-center">No users found.</div>
      ) : (
        <div className="bg-white rounded-lg border border-surface-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-surface-50 border-b border-surface-200">
                <th className="text-left px-4 py-3 font-medium text-surface-700">Name</th>
                <th className="text-left px-4 py-3 font-medium text-surface-700">Email</th>
                <th className="text-left px-4 py-3 font-medium text-surface-700">Role</th>
                <th className="text-left px-4 py-3 font-medium text-surface-700">Status</th>
                <th className="text-left px-4 py-3 font-medium text-surface-700">Seat</th>
                <th className="text-left px-4 py-3 font-medium text-surface-700">Auth0</th>
                <th className="text-left px-4 py-3 font-medium text-surface-700">Last Login</th>
                <th className="text-right px-4 py-3 font-medium text-surface-700">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-100">
              {users.map((user) => (
                <tr key={user.id} className={`hover:bg-surface-50 ${!user.isActive ? 'opacity-60' : ''}`}>
                  <td className="px-4 py-3 font-medium text-surface-900">{user.name}</td>
                  <td className="px-4 py-3 text-surface-600">{user.email}</td>
                  <td className="px-4 py-3">
                    <span className="text-xs font-medium bg-surface-100 text-surface-700 px-2 py-0.5 rounded">
                      {formatRole(user.role)}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded ${
                        user.isActive
                          ? 'bg-green-50 text-green-700'
                          : 'bg-red-50 text-red-700'
                      }`}
                    >
                      {user.isActive ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`text-xs font-medium px-2 py-0.5 rounded ${
                        user.seatType === 'decision'
                          ? 'bg-accent-50 text-accent-700'
                          : 'bg-surface-100 text-surface-500'
                      }`}
                    >
                      {user.seatType}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    {user.auth0Linked ? (
                      <span className="text-green-600">&#10003;</span>
                    ) : (
                      <span className="text-surface-300">&mdash;</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-surface-500 text-xs">
                    {user.lastLoginAt
                      ? new Date(user.lastLoginAt).toLocaleDateString()
                      : 'Never'}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        onClick={() => setEditingUser(user)}
                        className="text-xs text-accent-600 hover:text-accent-800 font-medium"
                      >
                        Edit
                      </button>
                      {user.isActive ? (
                        <button
                          onClick={() => setDeactivatingUser(user)}
                          className="text-xs text-red-600 hover:text-red-800 font-medium"
                        >
                          Deactivate
                        </button>
                      ) : (
                        <ReactivateButton user={user} />
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between text-sm text-surface-500">
          <span>
            Page {page} of {totalPages} ({total} users)
          </span>
          <div className="flex gap-2">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1}
              className="px-3 py-1 border border-surface-300 rounded text-sm disabled:opacity-50"
            >
              Previous
            </button>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages}
              className="px-3 py-1 border border-surface-300 rounded text-sm disabled:opacity-50"
            >
              Next
            </button>
          </div>
        </div>
      )}

      {/* Modals */}
      {showCreateModal && (
        <CreateUserModal onClose={() => setShowCreateModal(false)} />
      )}
      {editingUser && (
        <EditUserModal user={editingUser} onClose={() => setEditingUser(null)} />
      )}
      {deactivatingUser && (
        <DeactivateConfirmModal
          user={deactivatingUser}
          onClose={() => setDeactivatingUser(null)}
        />
      )}
    </div>
  );
}

function ReactivateButton({ user }: { user: User }) {
  const updateUser = useUpdateUser();
  return (
    <button
      onClick={() => updateUser.mutate({ id: user.id, data: { isActive: true } })}
      disabled={updateUser.isPending}
      className="text-xs text-green-600 hover:text-green-800 font-medium disabled:opacity-50"
    >
      Reactivate
    </button>
  );
}

function CreateUserModal({ onClose }: { onClose: () => void }) {
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [role, setRole] = useState<UserRole>('VIEWER');
  const createUser = useCreateUser();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const data: CreateUserInput = { email, name, role };
    createUser.mutate(data, { onSuccess: onClose });
  };

  return (
    <Modal isOpen title="Add User" onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-surface-700 mb-1">Email</label>
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="user@example.com"
            className="w-full px-3 py-2 border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-accent-500 focus:border-accent-500"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-surface-700 mb-1">Name</label>
          <input
            type="text"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Full name"
            className="w-full px-3 py-2 border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-accent-500 focus:border-accent-500"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-surface-700 mb-1">Role</label>
          <select
            value={role}
            onChange={(e) => setRole(e.target.value as UserRole)}
            className="w-full px-3 py-2 border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-accent-500 focus:border-accent-500"
          >
            {ROLES.map((r) => (
              <option key={r.value} value={r.value}>{r.label}</option>
            ))}
          </select>
        </div>
        <div className="flex justify-end gap-3 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-surface-700 hover:bg-surface-100 rounded-lg transition-colors"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={createUser.isPending}
            className="px-4 py-2 bg-accent-600 text-white rounded-lg text-sm font-medium hover:bg-accent-700 transition-colors disabled:opacity-50"
          >
            {createUser.isPending ? 'Creating...' : 'Create User'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function EditUserModal({ user, onClose }: { user: User; onClose: () => void }) {
  const [name, setName] = useState(user.name);
  const [role, setRole] = useState<UserRole>(user.role);
  const [isActive, setIsActive] = useState(user.isActive);
  const updateUser = useUpdateUser();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const data: UpdateUserInput = {};
    if (name !== user.name) data.name = name;
    if (role !== user.role) data.role = role;
    if (isActive !== user.isActive) data.isActive = isActive;

    if (Object.keys(data).length === 0) {
      onClose();
      return;
    }
    updateUser.mutate({ id: user.id, data }, { onSuccess: onClose });
  };

  return (
    <Modal isOpen title="Edit User" onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-surface-700 mb-1">Email</label>
          <input
            type="email"
            value={user.email}
            disabled
            className="w-full px-3 py-2 border border-surface-200 rounded-lg text-sm bg-surface-50 text-surface-500"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-surface-700 mb-1">Name</label>
          <input
            type="text"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full px-3 py-2 border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-accent-500 focus:border-accent-500"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-surface-700 mb-1">Role</label>
          <select
            value={role}
            onChange={(e) => setRole(e.target.value as UserRole)}
            className="w-full px-3 py-2 border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-accent-500 focus:border-accent-500"
          >
            {ROLES.map((r) => (
              <option key={r.value} value={r.value}>{r.label}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="flex items-center gap-2 text-sm text-surface-700 cursor-pointer">
            <input
              type="checkbox"
              checked={isActive}
              onChange={(e) => setIsActive(e.target.checked)}
              className="rounded border-surface-300"
            />
            Active
          </label>
        </div>
        <div className="flex justify-end gap-3 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-surface-700 hover:bg-surface-100 rounded-lg transition-colors"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={updateUser.isPending}
            className="px-4 py-2 bg-accent-600 text-white rounded-lg text-sm font-medium hover:bg-accent-700 transition-colors disabled:opacity-50"
          >
            {updateUser.isPending ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function DeactivateConfirmModal({
  user,
  onClose,
}: {
  user: User;
  onClose: () => void;
}) {
  const deactivateUser = useDeactivateUser();

  const handleConfirm = () => {
    deactivateUser.mutate(user.id, { onSuccess: onClose });
  };

  return (
    <Modal isOpen title="Deactivate User" onClose={onClose}>
      <div className="space-y-4">
        <p className="text-sm text-surface-600">
          Are you sure you want to deactivate <span className="font-medium">{user.name}</span> ({user.email})?
          They will lose access but can be reactivated later.
        </p>
        <div className="flex justify-end gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-surface-700 hover:bg-surface-100 rounded-lg transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            disabled={deactivateUser.isPending}
            className="px-4 py-2 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700 transition-colors disabled:opacity-50"
          >
            {deactivateUser.isPending ? 'Deactivating...' : 'Deactivate'}
          </button>
        </div>
      </div>
    </Modal>
  );
}
