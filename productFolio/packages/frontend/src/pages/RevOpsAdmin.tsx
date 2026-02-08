import { useState } from 'react';
import {
  useRevOpsSummary,
  useRevOpsEvents,
  type EntitlementEventFilters,
} from '../hooks/useEntitlements';

export function RevOpsAdmin() {
  const [filters, setFilters] = useState<EntitlementEventFilters>({
    page: 1,
    limit: 20,
  });
  const { data: signals, isLoading: signalsLoading } = useRevOpsSummary();
  const { data: events, isLoading: eventsLoading } = useRevOpsEvents(filters);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-display font-bold text-surface-900">RevOps Dashboard</h1>
        <p className="mt-1 text-sm text-surface-500">
          Usage analytics, expansion signals, and entitlement event log
        </p>
      </div>

      {/* Signal Cards */}
      {!signalsLoading && signals && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <SignalCard
            label="Licensed Users"
            value={signals.licensed}
            detail={`of ${signals.seatLimit} seats`}
          />
          <SignalCard
            label="Seat Utilization"
            value={`${signals.utilizationPct}%`}
            detail={signals.nearLimit ? 'Near limit!' : 'Healthy'}
            alert={signals.nearLimit}
          />
          <SignalCard
            label="Blocked Attempts"
            value={signals.blockedAttempts}
            detail="Last 30 days"
            alert={signals.blockedAttempts > 0}
          />
          <SignalCard
            label="Tier"
            value={signals.tier.charAt(0).toUpperCase() + signals.tier.slice(1)}
            detail={`${signals.seatLimit} seat limit`}
          />
        </div>
      )}

      {/* Expansion Signals Alert */}
      {signals && (signals.blockedAttempts > 0 || signals.nearLimit) && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
          <div className="flex items-start gap-3">
            <svg
              className="w-5 h-5 text-amber-500 mt-0.5 flex-shrink-0"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={1.5}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z"
              />
            </svg>
            <div>
              <h3 className="text-sm font-semibold text-amber-800">Expansion Signal</h3>
              <p className="text-sm text-amber-700 mt-1">
                {signals.blockedAttempts > 0 && (
                  <>
                    {signals.blockedAttempts} user{signals.blockedAttempts !== 1 ? 's were' : ' was'}{' '}
                    blocked from decision actions in the last 30 days.{' '}
                  </>
                )}
                {signals.nearLimit && (
                  <>
                    Seat utilization is at {signals.utilizationPct}% — approaching the{' '}
                    {signals.seatLimit} seat limit.
                  </>
                )}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Event Log */}
      <div className="bg-white rounded-lg border border-surface-200">
        <div className="px-4 py-3 border-b border-surface-200">
          <h3 className="text-sm font-semibold text-surface-900">Event Log</h3>
        </div>

        {eventsLoading ? (
          <div className="flex items-center justify-center h-32 text-surface-400">Loading...</div>
        ) : !events || events.data.length === 0 ? (
          <div className="flex items-center justify-center h-32 text-surface-400">
            No events recorded yet
          </div>
        ) : (
          <>
            <table className="min-w-full divide-y divide-surface-200">
              <thead className="bg-surface-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-surface-500 uppercase tracking-wider">
                    Event
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-surface-500 uppercase tracking-wider">
                    Seat Type
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-surface-500 uppercase tracking-wider">
                    User ID
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-surface-500 uppercase tracking-wider">
                    Date
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-100">
                {events.data.map((event) => (
                  <tr key={event.id} className="hover:bg-surface-50">
                    <td className="px-4 py-3 text-sm">
                      <span
                        className={`inline-flex items-center px-2 py-0.5 text-xs font-medium rounded-full ${
                          event.eventName === 'decision_seat_blocked'
                            ? 'bg-red-100 text-red-800'
                            : 'bg-surface-100 text-surface-700'
                        }`}
                      >
                        {event.eventName}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-surface-500">{event.seatType}</td>
                    <td className="px-4 py-3 text-sm text-surface-400 font-mono text-xs">
                      {event.userId ? event.userId.slice(0, 8) + '...' : '—'}
                    </td>
                    <td className="px-4 py-3 text-sm text-surface-500">
                      {new Date(event.createdAt).toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* Pagination */}
            {events.totalPages > 1 && (
              <div className="flex items-center justify-between px-4 py-3 border-t border-surface-200">
                <p className="text-sm text-surface-500">
                  Page {events.page} of {events.totalPages} ({events.total} events)
                </p>
                <div className="flex gap-2">
                  <button
                    disabled={events.page <= 1}
                    onClick={() => setFilters((f) => ({ ...f, page: (f.page ?? 1) - 1 }))}
                    className="px-3 py-1 text-sm rounded border border-surface-200 disabled:opacity-50 hover:bg-surface-50"
                  >
                    Previous
                  </button>
                  <button
                    disabled={events.page >= events.totalPages}
                    onClick={() => setFilters((f) => ({ ...f, page: (f.page ?? 1) + 1 }))}
                    className="px-3 py-1 text-sm rounded border border-surface-200 disabled:opacity-50 hover:bg-surface-50"
                  >
                    Next
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function SignalCard({
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
