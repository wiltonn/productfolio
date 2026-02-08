import { useState, useMemo } from 'react';
import {
  useUsers,
  useCreateUser,
  useUpdateUser,
  useDeactivateUser,
} from '../hooks/useUsers';
import type { User, UserRole, CreateUserInput, UpdateUserInput } from '../hooks/useUsers';
import {
  useEntitlementSummary,
  useEntitlements,
  type EntitlementUser,
} from '../hooks/useEntitlements';
import { useSyncRoles, useSyncAllUsers, useSyncUser } from '../hooks/useAuth0Admin';
import { api } from '../api/client';
import { toast } from '../stores/toast';
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

type TabId = 'users' | 'licensing' | 'auth0';

export function UsersAdmin() {
  const [activeTab, setActiveTab] = useState<TabId>('users');

  const tabs: { id: TabId; label: string }[] = [
    { id: 'users', label: 'Users' },
    { id: 'licensing', label: 'Licensing' },
    { id: 'auth0', label: 'Auth0 Sync' },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-surface-900">User Management</h1>
        <p className="text-sm text-surface-500 mt-1">
          Manage user accounts, roles, and seat licensing.
        </p>
      </div>

      {/* Tabs */}
      <div className="border-b border-surface-200">
        <nav className="flex gap-6">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`pb-3 text-sm font-medium border-b-2 transition-colors ${
                activeTab === tab.id
                  ? 'border-accent-500 text-accent-700'
                  : 'border-transparent text-surface-500 hover:text-surface-700'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      {/* Tab Content */}
      {activeTab === 'users' && <UsersTab />}
      {activeTab === 'licensing' && <LicensingTab />}
      {activeTab === 'auth0' && <Auth0SyncTab />}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Users Tab — original UsersAdmin content
// ---------------------------------------------------------------------------

function UsersTab() {
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

  const stats = useMemo(() => {
    const active = users.filter((u) => u.isActive).length;
    const decision = users.filter((u) => u.seatType === 'decision').length;
    const observer = users.filter((u) => u.seatType === 'observer').length;
    return { total: users.length, active, decision, observer };
  }, [users]);

  return (
    <div className="space-y-6">
      {/* Action button */}
      <div className="flex justify-end">
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
                      <SyncUserButton userId={user.id} />
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

// ---------------------------------------------------------------------------
// Licensing Tab — migrated from EntitlementsAdmin
// ---------------------------------------------------------------------------

const tierColors: Record<string, string> = {
  starter: 'bg-blue-100 text-blue-800',
  growth: 'bg-purple-100 text-purple-800',
  enterprise: 'bg-amber-100 text-amber-800',
};

function LicensingTab() {
  const [licenseTab, setLicenseTab] = useState<'overview' | 'licensed' | 'observers'>('overview');
  const { data: summary, isLoading: summaryLoading } = useEntitlementSummary();
  const { data: lists, isLoading: listsLoading } = useEntitlements();

  const handleExportCsv = async () => {
    try {
      const csv = await api.get<string>('/api/admin/entitlements/export');
      const blob = new Blob([csv], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'licensed-users.csv';
      a.click();
      URL.revokeObjectURL(url);
      toast.success('CSV exported');
    } catch {
      toast.error('Failed to export CSV');
    }
  };

  const subtabs = [
    { id: 'overview' as const, label: 'Overview' },
    { id: 'licensed' as const, label: `Licensed Users${summary ? ` (${summary.licensed})` : ''}` },
    { id: 'observers' as const, label: `Observers${summary ? ` (${summary.observers})` : ''}` },
  ];

  return (
    <div className="space-y-6">
      {/* Tier badge + Export button */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          {summary && (
            <span
              className={`px-2.5 py-0.5 text-xs font-semibold rounded-full uppercase ${
                tierColors[summary.tier] ?? 'bg-surface-100 text-surface-700'
              }`}
            >
              {summary.tier}
            </span>
          )}
        </div>
        <button
          onClick={handleExportCsv}
          className="px-4 py-2 text-sm font-medium text-white bg-accent-600 rounded-lg hover:bg-accent-700 transition-colors"
        >
          Export CSV
        </button>
      </div>

      {/* Stat Cards */}
      {!summaryLoading && summary && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard
            label="Licensed Users"
            value={summary.licensed}
            detail={`of ${summary.seatLimit} seats`}
          />
          <StatCard
            label="Seat Utilization"
            value={`${summary.utilizationPct}%`}
            detail={summary.utilizationPct >= 90 ? 'Near limit!' : 'Healthy'}
            alert={summary.utilizationPct >= 90}
          />
          <StatCard label="Observers" value={summary.observers} detail="Free, unlimited" />
          <StatCard
            label="Tier"
            value={summary.tier.charAt(0).toUpperCase() + summary.tier.slice(1)}
            detail={`${summary.seatLimit} seat limit`}
          />
        </div>
      )}

      {/* Sub-tabs */}
      <div className="flex gap-4">
        {subtabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setLicenseTab(tab.id)}
            className={`px-3 py-1.5 text-sm font-medium rounded-lg transition-colors ${
              licenseTab === tab.id
                ? 'bg-accent-50 text-accent-700'
                : 'text-surface-500 hover:text-surface-700 hover:bg-surface-100'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Sub-tab Content */}
      {licenseTab === 'overview' && summary && (
        <div className="bg-white rounded-lg border border-surface-200 p-6">
          <h3 className="text-lg font-semibold text-surface-900 mb-4">Licensing Overview</h3>
          <div className="space-y-4">
            <div>
              <div className="flex justify-between text-sm mb-1">
                <span className="text-surface-600">Seat usage</span>
                <span className="font-medium text-surface-900">
                  {summary.licensed} / {summary.seatLimit}
                </span>
              </div>
              <div className="w-full bg-surface-100 rounded-full h-3">
                <div
                  className={`h-3 rounded-full transition-all ${
                    summary.utilizationPct >= 90
                      ? 'bg-red-500'
                      : summary.utilizationPct >= 70
                        ? 'bg-amber-500'
                        : 'bg-accent-500'
                  }`}
                  style={{ width: `${Math.min(summary.utilizationPct, 100)}%` }}
                />
              </div>
            </div>
            <p className="text-sm text-surface-500">
              Decision-makers (users with write or admin permissions) consume licensed seats.
              Observers and modeled resources are always free.
            </p>
          </div>
        </div>
      )}

      {licenseTab === 'licensed' && (
        <EntitlementUserTable
          users={lists?.licensed.users ?? []}
          loading={listsLoading}
          seatType="decision"
        />
      )}

      {licenseTab === 'observers' && (
        <EntitlementUserTable
          users={lists?.observers.users ?? []}
          loading={listsLoading}
          seatType="observer"
        />
      )}
    </div>
  );
}

function StatCard({
  label,
  value,
  detail,
  alert,
}: {
  label: string;
  value: string | number;
  detail: string;
  alert?: boolean;
}) {
  return (
    <div className="bg-white rounded-lg border border-surface-200 p-4">
      <p className="text-sm text-surface-500">{label}</p>
      <p className={`text-2xl font-bold mt-1 ${alert ? 'text-red-600' : 'text-surface-900'}`}>
        {value}
      </p>
      <p className={`text-xs mt-1 ${alert ? 'text-red-500' : 'text-surface-400'}`}>{detail}</p>
    </div>
  );
}

function EntitlementUserTable({
  users,
  loading,
  seatType,
}: {
  users: EntitlementUser[];
  loading: boolean;
  seatType: string;
}) {
  if (loading) {
    return (
      <div className="flex items-center justify-center h-32 text-surface-400">Loading...</div>
    );
  }

  if (users.length === 0) {
    return (
      <div className="flex items-center justify-center h-32 text-surface-400">
        No users found
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg border border-surface-200 overflow-hidden">
      <table className="min-w-full divide-y divide-surface-200">
        <thead className="bg-surface-50">
          <tr>
            <th className="px-4 py-3 text-left text-xs font-medium text-surface-500 uppercase tracking-wider">
              Name
            </th>
            <th className="px-4 py-3 text-left text-xs font-medium text-surface-500 uppercase tracking-wider">
              Email
            </th>
            <th className="px-4 py-3 text-left text-xs font-medium text-surface-500 uppercase tracking-wider">
              Role
            </th>
            <th className="px-4 py-3 text-left text-xs font-medium text-surface-500 uppercase tracking-wider">
              Seat Type
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-surface-100">
          {users.map((user) => (
            <tr key={user.id} className="hover:bg-surface-50">
              <td className="px-4 py-3 text-sm font-medium text-surface-900">{user.name}</td>
              <td className="px-4 py-3 text-sm text-surface-500">{user.email}</td>
              <td className="px-4 py-3 text-sm text-surface-500">
                {user.role.replace(/_/g, ' ')}
              </td>
              <td className="px-4 py-3 text-sm">
                <span
                  className={`inline-flex items-center px-2 py-0.5 text-xs font-medium rounded-full ${
                    seatType === 'decision'
                      ? 'bg-green-100 text-green-800'
                      : 'bg-surface-100 text-surface-600'
                  }`}
                >
                  {seatType}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Shared helper components (unchanged from original)
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Auth0 Sync Tab
// ---------------------------------------------------------------------------

function Auth0SyncTab() {
  const syncRoles = useSyncRoles();
  const syncAllUsers = useSyncAllUsers();

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-lg border border-surface-200 p-6 space-y-4">
        <h3 className="text-lg font-semibold text-surface-900">Auth0 Integration</h3>
        <p className="text-sm text-surface-500">
          Synchronize ProductFolio roles and users with Auth0 for single sign-on and role-based access control.
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
          {/* Sync Roles */}
          <div className="border border-surface-200 rounded-lg p-4 space-y-3">
            <div>
              <h4 className="text-sm font-medium text-surface-900">Sync Roles</h4>
              <p className="text-xs text-surface-500 mt-1">
                Push ProductFolio role definitions (ADMIN, PRODUCT_OWNER, etc.) to Auth0 as API permissions.
              </p>
            </div>
            <button
              onClick={() => syncRoles.mutate(undefined)}
              disabled={syncRoles.isPending}
              className="w-full px-4 py-2 bg-accent-600 text-white rounded-lg text-sm font-medium hover:bg-accent-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {syncRoles.isPending && (
                <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none">
                  <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" className="opacity-25" />
                  <path d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" fill="currentColor" className="opacity-75" />
                </svg>
              )}
              {syncRoles.isPending ? 'Syncing Roles...' : 'Sync Roles to Auth0'}
            </button>
            {syncRoles.isSuccess && (
              <p className="text-xs text-green-600 font-medium">Roles synced successfully.</p>
            )}
            {syncRoles.isError && (
              <p className="text-xs text-red-600 font-medium">
                {syncRoles.error?.message || 'Failed to sync roles.'}
              </p>
            )}
          </div>

          {/* Sync All Users */}
          <div className="border border-surface-200 rounded-lg p-4 space-y-3">
            <div>
              <h4 className="text-sm font-medium text-surface-900">Sync All Users</h4>
              <p className="text-xs text-surface-500 mt-1">
                Push all ProductFolio users and their role assignments to Auth0.
              </p>
            </div>
            <button
              onClick={() => syncAllUsers.mutate(undefined)}
              disabled={syncAllUsers.isPending}
              className="w-full px-4 py-2 bg-accent-600 text-white rounded-lg text-sm font-medium hover:bg-accent-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {syncAllUsers.isPending && (
                <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none">
                  <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" className="opacity-25" />
                  <path d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" fill="currentColor" className="opacity-75" />
                </svg>
              )}
              {syncAllUsers.isPending ? 'Syncing Users...' : 'Sync All Users to Auth0'}
            </button>
            {syncAllUsers.isSuccess && (
              <p className="text-xs text-green-600 font-medium">All users synced successfully.</p>
            )}
            {syncAllUsers.isError && (
              <p className="text-xs text-red-600 font-medium">
                {syncAllUsers.error?.message || 'Failed to sync users.'}
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Per-user Sync Button
// ---------------------------------------------------------------------------

function SyncUserButton({ userId }: { userId: string }) {
  const syncUser = useSyncUser();

  return (
    <button
      onClick={() => syncUser.mutate(userId)}
      disabled={syncUser.isPending}
      className="text-xs text-surface-400 hover:text-accent-600 transition-colors disabled:opacity-50"
      title="Sync to Auth0"
    >
      {syncUser.isPending ? (
        <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none">
          <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" className="opacity-25" />
          <path d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" fill="currentColor" className="opacity-75" />
        </svg>
      ) : (
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182" />
        </svg>
      )}
    </button>
  );
}
