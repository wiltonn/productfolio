import { useState } from 'react';
import {
  useEntitlementSummary,
  useEntitlements,
  type EntitlementUser,
} from '../hooks/useEntitlements';
import { api } from '../api/client';
import { toast } from 'sonner';

const tierColors: Record<string, string> = {
  starter: 'bg-blue-100 text-blue-800',
  growth: 'bg-purple-100 text-purple-800',
  enterprise: 'bg-amber-100 text-amber-800',
};

export function EntitlementsAdmin() {
  const [activeTab, setActiveTab] = useState<'overview' | 'licensed' | 'observers'>('overview');
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

  const tabs = [
    { id: 'overview' as const, label: 'Overview' },
    { id: 'licensed' as const, label: `Licensed Users${summary ? ` (${summary.licensed})` : ''}` },
    { id: 'observers' as const, label: `Observers${summary ? ` (${summary.observers})` : ''}` },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-display font-bold text-surface-900">
              Entitlements
            </h1>
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
          <p className="mt-1 text-sm text-surface-500">
            Manage seat licensing and view entitlement usage
          </p>
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
            detail={summary.utilizationPct >= 90 ? 'Near limit' : 'Healthy'}
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
      {activeTab === 'overview' && summary && (
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

      {activeTab === 'licensed' && (
        <UserTable
          users={lists?.licensed.users ?? []}
          loading={listsLoading}
          seatType="decision"
        />
      )}

      {activeTab === 'observers' && (
        <UserTable
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

function UserTable({
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
