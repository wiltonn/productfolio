import { useState, useCallback, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { toast } from '../stores/toast';
import {
  useJiraConnections,
  useConnectJira,
  useDisconnectJira,
  useJiraSites,
  useSelectSites,
  useJiraProjects,
  useSelectProjects,
  useSyncStatus,
  useSyncRuns,
  useTriggerSync,
} from '../hooks/useJiraIntegration';
import type { JiraConnection, JiraSite, JiraProject } from '../types/intake';

export function JiraSettings() {
  const [searchParams] = useSearchParams();
  const [selectedConnectionId, setSelectedConnectionId] = useState<string | null>(null);
  const [selectedSiteId, setSelectedSiteId] = useState<string | null>(null);
  const [syncRunsPage, setSyncRunsPage] = useState(1);

  const { data: connections, isLoading: connectionsLoading } = useJiraConnections();
  const connectJira = useConnectJira();
  const disconnectJira = useDisconnectJira();

  const { data: sites } = useJiraSites(selectedConnectionId || '');
  const selectSites = useSelectSites();

  const { data: projects } = useJiraProjects(selectedSiteId || '');
  const selectProjects = useSelectProjects();

  const { data: syncStatus } = useSyncStatus();
  const { data: syncRunsData } = useSyncRuns({ page: syncRunsPage, limit: 10 });
  const triggerSync = useTriggerSync();

  // Handle OAuth callback params
  useEffect(() => {
    if (searchParams.get('connected') === 'true') {
      toast.success('Jira connected successfully');
    }
    if (searchParams.get('error')) {
      toast.error(`Jira connection failed: ${searchParams.get('error')}`);
    }
  }, [searchParams]);

  // Auto-select first connection
  useEffect(() => {
    if (connections?.length && !selectedConnectionId) {
      setSelectedConnectionId(connections[0].id);
    }
  }, [connections, selectedConnectionId]);

  const handleConnect = useCallback(() => {
    connectJira.mutate();
  }, [connectJira]);

  const handleDisconnect = useCallback((connectionId: string) => {
    if (window.confirm('This will remove the Jira connection and stop syncing. Continue?')) {
      disconnectJira.mutate(connectionId);
      if (selectedConnectionId === connectionId) {
        setSelectedConnectionId(null);
      }
    }
  }, [disconnectJira, selectedConnectionId]);

  const handleToggleSite = useCallback((site: JiraSite) => {
    if (!selectedConnectionId || !sites) return;

    const currentSelected = sites.filter(s => s.isSelected).map(s => s.id);
    const newSelected = site.isSelected
      ? currentSelected.filter(id => id !== site.id)
      : [...currentSelected, site.id];

    selectSites.mutate({ connectionId: selectedConnectionId, siteIds: newSelected });
  }, [selectedConnectionId, sites, selectSites]);

  const handleToggleProject = useCallback((project: JiraProject) => {
    if (!selectedSiteId || !projects) return;

    const currentSelected = projects.filter(p => p.isSelected);
    let newSelected: Array<{ projectId: string; projectKey: string; projectName: string }>;

    if (project.isSelected) {
      newSelected = currentSelected
        .filter(p => p.id !== project.id)
        .map(p => ({ projectId: p.id, projectKey: p.key, projectName: p.name }));
    } else {
      newSelected = [
        ...currentSelected.map(p => ({ projectId: p.id, projectKey: p.key, projectName: p.name })),
        { projectId: project.id, projectKey: project.key, projectName: project.name },
      ];
    }

    if (newSelected.length > 0) {
      selectProjects.mutate({ siteId: selectedSiteId, projects: newSelected });
    }
  }, [selectedSiteId, projects, selectProjects]);

  const handleSyncNow = useCallback(() => {
    triggerSync.mutate({});
  }, [triggerSync]);

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-display font-bold text-surface-900">Jira Settings</h1>
          <p className="mt-1 text-sm text-surface-500">
            Connect your Atlassian account to sync Jira issues into the intake pipeline.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={handleSyncNow}
            disabled={triggerSync.isPending || !connections?.length}
            className="px-4 py-2 text-sm font-medium text-accent-700 bg-accent-50 border border-accent-200 rounded-lg hover:bg-accent-100 disabled:opacity-50"
          >
            {triggerSync.isPending ? 'Syncing...' : 'Sync Now'}
          </button>
          <button
            onClick={handleConnect}
            disabled={connectJira.isPending}
            className="px-4 py-2 text-sm font-medium text-white bg-accent-600 rounded-lg hover:bg-accent-700 disabled:opacity-50"
          >
            {connectJira.isPending ? 'Connecting...' : 'Connect Jira'}
          </button>
        </div>
      </div>

      {/* Connections */}
      <section className="bg-white rounded-xl border border-surface-200 p-6">
        <h2 className="text-lg font-semibold text-surface-900 mb-4">Connections</h2>
        {connectionsLoading ? (
          <p className="text-sm text-surface-500">Loading connections...</p>
        ) : !connections?.length ? (
          <div className="text-center py-8">
            <p className="text-sm text-surface-500 mb-4">No Jira connections yet.</p>
            <button
              onClick={handleConnect}
              className="px-4 py-2 text-sm font-medium text-white bg-accent-600 rounded-lg hover:bg-accent-700"
            >
              Connect Jira Account
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            {connections.map((conn: JiraConnection) => (
              <div
                key={conn.id}
                className={`flex items-center justify-between p-4 rounded-lg border cursor-pointer transition-colors ${
                  selectedConnectionId === conn.id
                    ? 'border-accent-300 bg-accent-50'
                    : 'border-surface-200 hover:bg-surface-50'
                }`}
                onClick={() => setSelectedConnectionId(conn.id)}
              >
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center">
                    <span className="text-xs font-bold text-blue-700">A</span>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-surface-900">
                      {conn.displayName || conn.accountEmail || 'Atlassian Account'}
                    </p>
                    <p className="text-xs text-surface-500">
                      {conn.sites.length} site{conn.sites.length !== 1 ? 's' : ''} &middot;
                      Connected {new Date(conn.createdAt).toLocaleDateString()}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                    conn.isActive ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                  }`}>
                    {conn.isActive ? 'Active' : 'Inactive'}
                  </span>
                  <button
                    onClick={(e) => { e.stopPropagation(); handleDisconnect(conn.id); }}
                    className="text-xs text-red-600 hover:text-red-700 font-medium"
                  >
                    Disconnect
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Sites */}
      {selectedConnectionId && (
        <section className="bg-white rounded-xl border border-surface-200 p-6">
          <h2 className="text-lg font-semibold text-surface-900 mb-4">Sites</h2>
          <p className="text-sm text-surface-500 mb-4">Select which Jira Cloud sites to sync from.</p>
          {sites ? (
            <div className="space-y-2">
              {sites.map((site: JiraSite) => (
                <label
                  key={site.id}
                  className="flex items-center justify-between p-3 rounded-lg border border-surface-200 hover:bg-surface-50 cursor-pointer"
                >
                  <div className="flex items-center gap-3">
                    <input
                      type="checkbox"
                      checked={site.isSelected}
                      onChange={() => handleToggleSite(site)}
                      className="rounded border-surface-300 text-accent-600"
                    />
                    <div>
                      <p className="text-sm font-medium text-surface-900">{site.siteName}</p>
                      <p className="text-xs text-surface-500">{site.siteUrl}</p>
                    </div>
                  </div>
                  {site.isSelected && (
                    <button
                      onClick={(e) => { e.preventDefault(); setSelectedSiteId(site.id); }}
                      className="text-xs text-accent-600 hover:text-accent-700 font-medium"
                    >
                      Configure Projects
                    </button>
                  )}
                </label>
              ))}
            </div>
          ) : (
            <p className="text-sm text-surface-500">Loading sites...</p>
          )}
        </section>
      )}

      {/* Projects */}
      {selectedSiteId && (
        <section className="bg-white rounded-xl border border-surface-200 p-6">
          <h2 className="text-lg font-semibold text-surface-900 mb-4">Projects</h2>
          <p className="text-sm text-surface-500 mb-4">Select which projects to sync.</p>
          {projects ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
              {projects.map((project: JiraProject) => (
                <label
                  key={project.id}
                  className="flex items-center gap-3 p-3 rounded-lg border border-surface-200 hover:bg-surface-50 cursor-pointer"
                >
                  <input
                    type="checkbox"
                    checked={project.isSelected}
                    onChange={() => handleToggleProject(project)}
                    className="rounded border-surface-300 text-accent-600"
                  />
                  <div>
                    <p className="text-sm font-medium text-surface-900">{project.key}</p>
                    <p className="text-xs text-surface-500">{project.name}</p>
                  </div>
                </label>
              ))}
            </div>
          ) : (
            <p className="text-sm text-surface-500">Loading projects...</p>
          )}
        </section>
      )}

      {/* Sync Status */}
      {syncStatus && (
        <section className="bg-white rounded-xl border border-surface-200 p-6">
          <h2 className="text-lg font-semibold text-surface-900 mb-4">Sync Status</h2>
          {syncStatus.cursors.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-surface-200">
                    <th className="text-left py-2 pr-4 font-medium text-surface-600">Site</th>
                    <th className="text-left py-2 pr-4 font-medium text-surface-600">Project</th>
                    <th className="text-left py-2 pr-4 font-medium text-surface-600">Last Synced</th>
                    <th className="text-left py-2 pr-4 font-medium text-surface-600">Cursor</th>
                  </tr>
                </thead>
                <tbody>
                  {syncStatus.cursors.map((cursor) => (
                    <tr key={cursor.id} className="border-b border-surface-100">
                      <td className="py-2 pr-4 text-surface-900">{cursor.jiraSite.siteName}</td>
                      <td className="py-2 pr-4 text-surface-700">{cursor.jiraProjectSelection.projectKey}</td>
                      <td className="py-2 pr-4 text-surface-500">
                        {new Date(cursor.lastSyncedAt).toLocaleString()}
                      </td>
                      <td className="py-2 pr-4 text-surface-500 text-xs font-mono">
                        {cursor.cursorValue ? new Date(cursor.cursorValue).toLocaleString() : 'Initial'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-sm text-surface-500">No sync cursors yet. Trigger a sync to begin.</p>
          )}
        </section>
      )}

      {/* Sync History */}
      <section className="bg-white rounded-xl border border-surface-200 p-6">
        <h2 className="text-lg font-semibold text-surface-900 mb-4">Sync History</h2>
        {syncRunsData?.data?.length ? (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-surface-200">
                    <th className="text-left py-2 pr-4 font-medium text-surface-600">Time</th>
                    <th className="text-left py-2 pr-4 font-medium text-surface-600">Site</th>
                    <th className="text-left py-2 pr-4 font-medium text-surface-600">Project</th>
                    <th className="text-left py-2 pr-4 font-medium text-surface-600">Status</th>
                    <th className="text-right py-2 pr-4 font-medium text-surface-600">Found</th>
                    <th className="text-right py-2 pr-4 font-medium text-surface-600">Created</th>
                    <th className="text-right py-2 pr-4 font-medium text-surface-600">Updated</th>
                    <th className="text-right py-2 font-medium text-surface-600">Skipped</th>
                  </tr>
                </thead>
                <tbody>
                  {syncRunsData.data.map((run) => (
                    <tr key={run.id} className="border-b border-surface-100">
                      <td className="py-2 pr-4 text-surface-500 text-xs">
                        {new Date(run.startedAt).toLocaleString()}
                      </td>
                      <td className="py-2 pr-4 text-surface-900">{run.jiraSite.siteName}</td>
                      <td className="py-2 pr-4 text-surface-700">{run.projectKey || '-'}</td>
                      <td className="py-2 pr-4">
                        <StatusBadge status={run.status} />
                      </td>
                      <td className="py-2 pr-4 text-right text-surface-700">{run.issuesFound}</td>
                      <td className="py-2 pr-4 text-right text-green-600">{run.issuesCreated}</td>
                      <td className="py-2 pr-4 text-right text-blue-600">{run.issuesUpdated}</td>
                      <td className="py-2 text-right text-surface-500">{run.issuesSkipped}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {syncRunsData.pagination.totalPages > 1 && (
              <div className="flex items-center justify-between mt-4 pt-4 border-t border-surface-100">
                <p className="text-xs text-surface-500">
                  Page {syncRunsData.pagination.page} of {syncRunsData.pagination.totalPages}
                </p>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setSyncRunsPage(p => Math.max(1, p - 1))}
                    disabled={syncRunsPage === 1}
                    className="px-3 py-1 text-xs border rounded disabled:opacity-50"
                  >
                    Previous
                  </button>
                  <button
                    onClick={() => setSyncRunsPage(p => p + 1)}
                    disabled={syncRunsPage >= syncRunsData.pagination.totalPages}
                    className="px-3 py-1 text-xs border rounded disabled:opacity-50"
                  >
                    Next
                  </button>
                </div>
              </div>
            )}
          </>
        ) : (
          <p className="text-sm text-surface-500">No sync runs yet.</p>
        )}
      </section>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    RUNNING: 'bg-yellow-100 text-yellow-700',
    COMPLETED: 'bg-green-100 text-green-700',
    FAILED: 'bg-red-100 text-red-700',
    PARTIAL: 'bg-orange-100 text-orange-700',
  };

  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${styles[status] || 'bg-surface-100 text-surface-600'}`}>
      {status}
    </span>
  );
}
