import { useState } from 'react';
import {
  useAuthorities,
  useRoleMapping,
  useAuthorityDrift,
  useEffectivePermissions,
  useAuthorityAuditLog,
  useUpdateAuthority,
} from '../hooks/useAuthorities';

type TabKey = 'registry' | 'roles' | 'test' | 'drift' | 'audit';

const tabs: { key: TabKey; label: string }[] = [
  { key: 'registry', label: 'Registry' },
  { key: 'roles', label: 'Role Mapping' },
  { key: 'test', label: 'Test Access' },
  { key: 'drift', label: 'Drift Detection' },
  { key: 'audit', label: 'Audit Log' },
];

export function AuthoritiesAdmin() {
  const [activeTab, setActiveTab] = useState<TabKey>('registry');

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-surface-900">Authorities</h1>
        <p className="text-sm text-surface-500 mt-1">
          Manage the permission registry, view role mappings, and detect drift.
        </p>
      </div>

      {/* Tab Bar */}
      <div className="border-b border-surface-200">
        <nav className="flex gap-6" aria-label="Tabs">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`pb-3 text-sm font-medium border-b-2 transition-colors ${
                activeTab === tab.key
                  ? 'border-accent-500 text-accent-600'
                  : 'border-transparent text-surface-500 hover:text-surface-700 hover:border-surface-300'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      {/* Tab Content */}
      {activeTab === 'registry' && <RegistryTab />}
      {activeTab === 'roles' && <RoleMappingTab />}
      {activeTab === 'test' && <TestAccessTab />}
      {activeTab === 'drift' && <DriftTab />}
      {activeTab === 'audit' && <AuditLogTab />}
    </div>
  );
}

function RegistryTab() {
  const { data: authorities, isLoading } = useAuthorities();
  const updateAuthority = useUpdateAuthority();

  if (isLoading) {
    return <div className="text-surface-500 text-sm py-8 text-center">Loading authorities...</div>;
  }

  const grouped = (authorities ?? []).reduce<Record<string, typeof authorities>>((acc, auth) => {
    if (!auth) return acc;
    const cat = auth.category;
    if (!acc[cat]) acc[cat] = [];
    acc[cat]!.push(auth);
    return acc;
  }, {});

  return (
    <div className="space-y-6">
      {Object.entries(grouped).map(([category, items]) => (
        <div key={category}>
          <h3 className="text-sm font-semibold text-surface-700 uppercase tracking-wide mb-2">
            {category}
          </h3>
          <div className="bg-white rounded-lg border border-surface-200 divide-y divide-surface-100">
            {(items ?? []).map((auth) => (
              <div
                key={auth.code}
                className={`px-4 py-3 flex items-center justify-between ${
                  auth.deprecated ? 'opacity-50' : ''
                }`}
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <code className="text-sm font-mono text-accent-700 bg-accent-50 px-1.5 py-0.5 rounded">
                      {auth.code}
                    </code>
                    {auth.deprecated && (
                      <span className="text-xs text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded font-medium">
                        deprecated
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-surface-500 mt-0.5">{auth.description}</p>
                </div>
                <button
                  onClick={() =>
                    updateAuthority.mutate({
                      code: auth.code,
                      data: { deprecated: !auth.deprecated },
                    })
                  }
                  className="text-xs text-surface-400 hover:text-surface-600 ml-4"
                >
                  {auth.deprecated ? 'Restore' : 'Deprecate'}
                </button>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function RoleMappingTab() {
  const { data: mapping, isLoading } = useRoleMapping();

  if (isLoading) {
    return <div className="text-surface-500 text-sm py-8 text-center">Loading role mapping...</div>;
  }

  if (!mapping) return null;

  const roles = Object.keys(mapping);
  const allPerms = [...new Set(Object.values(mapping).flat())].sort();

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm border border-surface-200 rounded-lg">
        <thead>
          <tr className="bg-surface-50">
            <th className="text-left px-3 py-2 border-b border-surface-200 font-medium text-surface-700">
              Permission
            </th>
            {roles.map((role) => (
              <th
                key={role}
                className="text-center px-3 py-2 border-b border-surface-200 font-medium text-surface-700"
              >
                {role.replace('_', ' ')}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {allPerms.map((perm) => (
            <tr key={perm} className="hover:bg-surface-50">
              <td className="px-3 py-1.5 border-b border-surface-100 font-mono text-xs">
                {perm}
              </td>
              {roles.map((role) => (
                <td
                  key={role}
                  className="text-center px-3 py-1.5 border-b border-surface-100"
                >
                  {mapping[role].includes(perm) ? (
                    <span className="text-green-600">&#10003;</span>
                  ) : (
                    <span className="text-surface-300">&mdash;</span>
                  )}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function TestAccessTab() {
  const [userId, setUserId] = useState('');
  const [searchId, setSearchId] = useState('');
  const { data, isLoading, error } = useEffectivePermissions(searchId);

  const handleTest = () => {
    if (userId.trim()) {
      setSearchId(userId.trim());
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex gap-3 items-end">
        <div className="flex-1 max-w-md">
          <label className="block text-sm font-medium text-surface-700 mb-1">
            User ID
          </label>
          <input
            type="text"
            value={userId}
            onChange={(e) => setUserId(e.target.value)}
            placeholder="Enter user UUID..."
            className="w-full px-3 py-2 border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-accent-500 focus:border-accent-500"
            onKeyDown={(e) => e.key === 'Enter' && handleTest()}
          />
        </div>
        <button
          onClick={handleTest}
          className="px-4 py-2 bg-accent-600 text-white rounded-lg text-sm font-medium hover:bg-accent-700 transition-colors"
        >
          Test
        </button>
      </div>

      {isLoading && (
        <div className="text-surface-500 text-sm py-4">Loading...</div>
      )}

      {error && (
        <div className="text-red-600 text-sm py-4">
          {(error as Error).message || 'User not found'}
        </div>
      )}

      {data && (
        <div className="bg-white rounded-lg border border-surface-200 p-4 space-y-3">
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <span className="text-surface-500">Name:</span>{' '}
              <span className="font-medium">{data.name}</span>
            </div>
            <div>
              <span className="text-surface-500">Email:</span>{' '}
              <span className="font-medium">{data.email}</span>
            </div>
            <div>
              <span className="text-surface-500">Role:</span>{' '}
              <span className="font-medium">{data.role}</span>
            </div>
            <div>
              <span className="text-surface-500">Source:</span>{' '}
              <span className="font-mono text-xs bg-surface-100 px-1.5 py-0.5 rounded">
                {data.source}
              </span>
            </div>
          </div>
          <div>
            <h4 className="text-sm font-medium text-surface-700 mb-2">
              Effective Permissions ({data.permissions.length})
            </h4>
            <div className="flex flex-wrap gap-1.5">
              {data.permissions.map((p) => (
                <span
                  key={p}
                  className="text-xs font-mono bg-accent-50 text-accent-700 px-2 py-0.5 rounded"
                >
                  {p}
                </span>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function DriftTab() {
  const { data, isLoading } = useAuthorityDrift();

  if (isLoading) {
    return <div className="text-surface-500 text-sm py-8 text-center">Checking for drift...</div>;
  }

  if (!data) return null;

  return (
    <div className="space-y-4">
      <div
        className={`p-4 rounded-lg border ${
          data.inSync
            ? 'bg-green-50 border-green-200'
            : 'bg-amber-50 border-amber-200'
        }`}
      >
        <div className="flex items-center gap-2">
          <span className={`text-lg ${data.inSync ? 'text-green-600' : 'text-amber-600'}`}>
            {data.inSync ? '\u2713' : '\u26A0'}
          </span>
          <span className="font-medium text-sm">
            {data.inSync
              ? 'Code and registry are in sync'
              : 'Drift detected between code and registry'}
          </span>
        </div>
        <p className="text-xs text-surface-500 mt-1">
          Registry: {data.registryCount} authorities | Code: {data.codeCount} permissions
        </p>
      </div>

      {data.inCodeNotInRegistry.length > 0 && (
        <div>
          <h4 className="text-sm font-medium text-surface-700 mb-2">
            In code but missing from registry
          </h4>
          <div className="flex flex-wrap gap-1.5">
            {data.inCodeNotInRegistry.map((code) => (
              <span
                key={code}
                className="text-xs font-mono bg-red-50 text-red-700 px-2 py-0.5 rounded"
              >
                {code}
              </span>
            ))}
          </div>
        </div>
      )}

      {data.inRegistryNotInCode.length > 0 && (
        <div>
          <h4 className="text-sm font-medium text-surface-700 mb-2">
            In registry but not referenced in code
          </h4>
          <div className="flex flex-wrap gap-1.5">
            {data.inRegistryNotInCode.map((item) => (
              <span
                key={item.code}
                className={`text-xs font-mono px-2 py-0.5 rounded ${
                  item.deprecated
                    ? 'bg-surface-100 text-surface-500'
                    : 'bg-amber-50 text-amber-700'
                }`}
              >
                {item.code}
                {item.deprecated ? ' (deprecated)' : ''}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function AuditLogTab() {
  const [page, setPage] = useState(1);
  const { data, isLoading } = useAuthorityAuditLog(page);

  if (isLoading) {
    return <div className="text-surface-500 text-sm py-8 text-center">Loading audit log...</div>;
  }

  if (!data || data.data.length === 0) {
    return <div className="text-surface-500 text-sm py-8 text-center">No audit log entries yet.</div>;
  }

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-lg border border-surface-200 divide-y divide-surface-100">
        {data.data.map((entry) => (
          <div key={entry.id} className="px-4 py-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span
                  className={`text-xs font-medium px-1.5 py-0.5 rounded ${
                    entry.action === 'DEPRECATED'
                      ? 'bg-amber-50 text-amber-700'
                      : 'bg-blue-50 text-blue-700'
                  }`}
                >
                  {entry.action}
                </span>
                <code className="text-sm font-mono text-surface-700">
                  {entry.authorityCode}
                </code>
              </div>
              <span className="text-xs text-surface-400">
                {new Date(entry.createdAt).toLocaleString()}
              </span>
            </div>
            {entry.details && (
              <pre className="mt-1 text-xs text-surface-500 whitespace-pre-wrap">
                {JSON.stringify(entry.details, null, 2)}
              </pre>
            )}
          </div>
        ))}
      </div>

      {/* Pagination */}
      {data.totalPages > 1 && (
        <div className="flex items-center justify-between text-sm text-surface-500">
          <span>
            Page {data.page} of {data.totalPages} ({data.total} entries)
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
              onClick={() => setPage((p) => Math.min(data.totalPages, p + 1))}
              disabled={page >= data.totalPages}
              className="px-3 py-1 border border-surface-300 rounded text-sm disabled:opacity-50"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
