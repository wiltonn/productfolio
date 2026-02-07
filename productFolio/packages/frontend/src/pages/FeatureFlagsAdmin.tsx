import { useFeatureFlags, useUpdateFeatureFlag } from '../hooks/useFeatureFlags';
import type { FeatureFlag } from '../hooks/useFeatureFlags';

// ============================================================================
// Toggle Switch
// ============================================================================

function ToggleSwitch({
  enabled,
  isPending,
  onToggle,
}: {
  enabled: boolean;
  isPending: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={enabled}
      onClick={onToggle}
      disabled={isPending}
      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-accent-500 focus:ring-offset-2 ${
        enabled ? 'bg-accent-600' : 'bg-surface-300'
      } ${isPending ? 'opacity-50 cursor-wait' : 'cursor-pointer'}`}
    >
      <span
        className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
          enabled ? 'translate-x-6' : 'translate-x-1'
        }`}
      />
    </button>
  );
}

// ============================================================================
// Flag Row
// ============================================================================

function FlagRow({ flag }: { flag: FeatureFlag }) {
  const updateFlag = useUpdateFeatureFlag();

  const handleToggle = () => {
    updateFlag.mutate({ key: flag.key, data: { enabled: !flag.enabled } });
  };

  return (
    <tr className="border-b last:border-b-0 hover:bg-surface-50">
      <td className="px-4 py-3">
        <code className="text-sm font-mono bg-surface-100 px-1.5 py-0.5 rounded text-surface-800">
          {flag.key}
        </code>
      </td>
      <td className="px-4 py-3 text-sm text-surface-600">
        {flag.description || '--'}
      </td>
      <td className="px-4 py-3">
        <div className="flex items-center gap-2">
          <ToggleSwitch
            enabled={flag.enabled}
            isPending={updateFlag.isPending}
            onToggle={handleToggle}
          />
          <span className={`text-xs font-medium ${flag.enabled ? 'text-emerald-600' : 'text-surface-400'}`}>
            {flag.enabled ? 'Enabled' : 'Disabled'}
          </span>
        </div>
      </td>
      <td className="px-4 py-3 text-sm text-surface-500">
        {new Date(flag.updatedAt).toLocaleString()}
      </td>
    </tr>
  );
}

// ============================================================================
// Main Page
// ============================================================================

export function FeatureFlagsAdmin() {
  const { data: flags, isLoading } = useFeatureFlags();

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="px-6 py-4 border-b bg-white">
        <div>
          <h1 className="text-xl font-semibold text-surface-900">Feature Flags</h1>
          <p className="text-sm text-surface-500 mt-1">
            Toggle feature flags to control access to new functionality
          </p>
        </div>
      </div>

      {/* Table */}
      <div className="flex-1 px-6 py-6">
        <div className="bg-white rounded-lg border">
          {isLoading ? (
            <div className="p-8 text-center text-sm text-surface-400">Loading feature flags...</div>
          ) : !flags || flags.length === 0 ? (
            <div className="p-8 text-center text-sm text-surface-400">
              No feature flags configured.
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-surface-50">
                  <th className="text-left px-4 py-3 font-medium text-surface-600">Key</th>
                  <th className="text-left px-4 py-3 font-medium text-surface-600">Description</th>
                  <th className="text-left px-4 py-3 font-medium text-surface-600">Status</th>
                  <th className="text-left px-4 py-3 font-medium text-surface-600">Updated</th>
                </tr>
              </thead>
              <tbody>
                {flags.map((flag) => (
                  <FlagRow key={flag.id} flag={flag} />
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
