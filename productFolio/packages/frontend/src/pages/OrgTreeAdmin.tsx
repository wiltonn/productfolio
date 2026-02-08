import { useState } from 'react';
import {
  useOrgTree,
  useOrgNode,
  useCoverageReport,
  useCreateNode,
  useDeleteNode,
  useMemberships,
} from '../hooks/useOrgTree';
import {
  useNodePolicies,
  useCreatePolicy,
  useDeletePolicy,
} from '../hooks/useApprovals';
import { Modal } from '../components/ui';
import type { OrgNode, OrgNodeType, ApprovalScope, ApprovalRuleType } from '../types';

// ============================================================================
// Tree Node Component
// ============================================================================

function TreeNodeItem({
  node,
  selectedId,
  onSelect,
  depth = 0,
}: {
  node: OrgNode;
  selectedId: string | null;
  onSelect: (id: string) => void;
  depth?: number;
}) {
  const [expanded, setExpanded] = useState(depth < 2);
  const hasChildren = node.children && node.children.length > 0;
  const isSelected = node.id === selectedId;

  const typeColors: Record<string, string> = {
    ROOT: 'text-purple-600 bg-purple-50',
    DIVISION: 'text-blue-600 bg-blue-50',
    DEPARTMENT: 'text-green-600 bg-green-50',
    TEAM: 'text-orange-600 bg-orange-50',
    VIRTUAL: 'text-gray-600 bg-gray-50',
  };

  return (
    <div>
      <div
        className={`flex items-center gap-2 px-3 py-2 rounded cursor-pointer hover:bg-surface-100 ${
          isSelected ? 'bg-accent-50 border-l-2 border-accent-500' : ''
        }`}
        style={{ paddingLeft: `${depth * 20 + 12}px` }}
        onClick={() => onSelect(node.id)}
      >
        {hasChildren ? (
          <button
            className="w-4 h-4 flex items-center justify-center text-surface-400"
            onClick={(e) => {
              e.stopPropagation();
              setExpanded(!expanded);
            }}
          >
            {expanded ? '▾' : '▸'}
          </button>
        ) : (
          <span className="w-4" />
        )}
        <span className={`text-xs font-medium px-1.5 py-0.5 rounded ${typeColors[node.type] ?? ''}`}>
          {node.type.slice(0, 3)}
        </span>
        <span className="text-sm font-medium text-surface-800 truncate">{node.name}</span>
        {node.isPortfolioArea && (
          <span className="text-xs font-medium px-1.5 py-0.5 rounded text-indigo-600 bg-indigo-50">PA</span>
        )}
        <span className="text-xs text-surface-400 ml-auto">
          {node._count?.memberships ?? 0}
        </span>
      </div>
      {expanded && hasChildren && (
        <div>
          {node.children!.map((child) => (
            <TreeNodeItem
              key={child.id}
              node={child}
              selectedId={selectedId}
              onSelect={onSelect}
              depth={depth + 1}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Node Detail Panel
// ============================================================================

function NodeDetailPanel({ nodeId }: { nodeId: string }) {
  const { data: node } = useOrgNode(nodeId);
  const { data: policies } = useNodePolicies(nodeId);
  const { data: membershipsData } = useMemberships({ orgNodeId: nodeId, limit: 10 });
  const memberships = membershipsData?.data ?? [];
  const deleteNode = useDeleteNode();

  const [showPolicyModal, setShowPolicyModal] = useState(false);

  if (!node) return <div className="p-4 text-surface-500">Loading...</div>;

  return (
    <div className="p-4 space-y-6 overflow-y-auto">
      {/* Header */}
      <div>
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-surface-900">{node.name}</h2>
          {node.type !== 'ROOT' && (
            <button
              className="text-xs text-red-600 hover:text-red-700"
              onClick={() => {
                if (confirm(`Delete "${node.name}"?`)) deleteNode.mutate(node.id);
              }}
            >
              Delete
            </button>
          )}
        </div>
        <p className="text-sm text-surface-500">
          {node.code} &middot; {node.type}
          {node.parent && <> &middot; under {node.parent.name}</>}
        </p>
        {node.isPortfolioArea && (
          <span className="inline-flex items-center mt-1 text-xs font-medium px-2 py-0.5 rounded bg-indigo-50 text-indigo-700">
            Portfolio Area
          </span>
        )}
      </div>

      {/* Manager */}
      <div>
        <h3 className="text-sm font-medium text-surface-700 mb-1">Manager</h3>
        <p className="text-sm text-surface-600">
          {node.manager ? node.manager.name : 'None assigned'}
        </p>
      </div>

      {/* Members */}
      <div>
        <h3 className="text-sm font-medium text-surface-700 mb-2">
          Members ({node._count?.memberships ?? 0})
        </h3>
        {memberships.length === 0 ? (
          <p className="text-sm text-surface-400">No members</p>
        ) : (
          <div className="space-y-1">
            {memberships.map((m) => (
              <div key={m.id} className="flex items-center gap-2 text-sm">
                <span className="font-medium text-surface-700">{m.employee?.name}</span>
                <span className="text-surface-400">{m.employee?.role}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Approval Policies */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-medium text-surface-700">
            Approval Policies ({policies?.length ?? 0})
          </h3>
          <button
            className="px-2 py-1 text-xs font-medium text-accent-700 hover:bg-accent-50 rounded transition-colors"
            onClick={() => setShowPolicyModal(true)}
          >
            + Add Policy
          </button>
        </div>
        {!policies || policies.length === 0 ? (
          <p className="text-sm text-surface-400">No policies configured</p>
        ) : (
          <div className="space-y-2">
            {policies.map((p) => (
              <PolicyCard key={p.id} policy={p} />
            ))}
          </div>
        )}
      </div>

      {showPolicyModal && (
        <AddPolicyModal nodeId={nodeId} onClose={() => setShowPolicyModal(false)} />
      )}
    </div>
  );
}

function PolicyCard({ policy }: { policy: { id: string; scope: string; level: number; ruleType: string } }) {
  const deletePolicy = useDeletePolicy();

  return (
    <div className="flex items-center justify-between p-2 bg-surface-50 rounded text-sm">
      <div>
        <span className="font-medium text-surface-700">{policy.scope}</span>
        <span className="text-surface-400 mx-1">&middot;</span>
        <span className="text-surface-500">L{policy.level}</span>
        <span className="text-surface-400 mx-1">&middot;</span>
        <span className="text-surface-500">{policy.ruleType}</span>
      </div>
      <button
        className="text-xs text-red-500 hover:text-red-600"
        onClick={() => deletePolicy.mutate(policy.id)}
      >
        Remove
      </button>
    </div>
  );
}

// ============================================================================
// Add Policy Modal
// ============================================================================

function AddPolicyModal({ nodeId, onClose }: { nodeId: string; onClose: () => void }) {
  const createPolicy = useCreatePolicy();
  const [scope, setScope] = useState<ApprovalScope>('INITIATIVE');
  const [level, setLevel] = useState(1);
  const [ruleType, setRuleType] = useState<ApprovalRuleType>('NODE_MANAGER');
  const [userId, setUserId] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const ruleConfig: Record<string, unknown> = {};
    if (ruleType === 'SPECIFIC_PERSON') ruleConfig.userId = userId;

    createPolicy.mutate(
      { nodeId, scope, level, ruleType, ruleConfig },
      { onSuccess: onClose },
    );
  };

  return (
    <Modal isOpen title="Add Approval Policy" onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-surface-700 mb-1">Scope</label>
          <select
            className="w-full border rounded px-3 py-2 text-sm"
            value={scope}
            onChange={(e) => setScope(e.target.value as ApprovalScope)}
          >
            <option value="RESOURCE_ALLOCATION">Resource Allocation</option>
            <option value="INITIATIVE">Initiative</option>
            <option value="SCENARIO">Scenario</option>
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-surface-700 mb-1">Level</label>
          <input
            type="number"
            min={1}
            className="w-full border rounded px-3 py-2 text-sm"
            value={level}
            onChange={(e) => setLevel(Number(e.target.value))}
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-surface-700 mb-1">Rule Type</label>
          <select
            className="w-full border rounded px-3 py-2 text-sm"
            value={ruleType}
            onChange={(e) => setRuleType(e.target.value as ApprovalRuleType)}
          >
            <option value="NODE_MANAGER">Node Manager</option>
            <option value="SPECIFIC_PERSON">Specific Person</option>
            <option value="ROLE_BASED">Role Based</option>
            <option value="ANCESTOR_MANAGER">Ancestor Manager</option>
            <option value="COMMITTEE">Committee</option>
            <option value="FALLBACK_ADMIN">Fallback Admin</option>
          </select>
        </div>
        {ruleType === 'SPECIFIC_PERSON' && (
          <div>
            <label className="block text-sm font-medium text-surface-700 mb-1">User ID</label>
            <input
              type="text"
              className="w-full border rounded px-3 py-2 text-sm"
              value={userId}
              onChange={(e) => setUserId(e.target.value)}
              placeholder="Enter user UUID"
            />
          </div>
        )}
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" className="btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button
            type="submit"
            className="btn-primary"
            disabled={createPolicy.isPending}
          >
            {createPolicy.isPending ? 'Creating...' : 'Create Policy'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

// ============================================================================
// Coverage Stats
// ============================================================================

function CoverageStats() {
  const { data: report, isLoading } = useCoverageReport();

  if (isLoading || !report) return null;

  return (
    <div className="grid grid-cols-4 gap-4 mb-6">
      <div className="bg-white rounded-lg border p-4">
        <p className="text-2xl font-bold text-surface-900">{report.coveragePercentage}%</p>
        <p className="text-sm text-surface-500">Coverage</p>
      </div>
      <div className="bg-white rounded-lg border p-4">
        <p className="text-2xl font-bold text-surface-900">{report.totalEmployees}</p>
        <p className="text-sm text-surface-500">Total Employees</p>
      </div>
      <div className="bg-white rounded-lg border p-4">
        <p className="text-2xl font-bold text-orange-600">{report.unassignedCount}</p>
        <p className="text-sm text-surface-500">Unassigned</p>
      </div>
      <div className="bg-white rounded-lg border p-4">
        <p className="text-2xl font-bold text-surface-900">{report.totalActiveNodes}</p>
        <p className="text-sm text-surface-500">Active Nodes</p>
      </div>
    </div>
  );
}

// ============================================================================
// Create Node Modal
// ============================================================================

function CreateNodeModal({
  parentId,
  onClose,
}: {
  parentId?: string | null;
  onClose: () => void;
}) {
  const createNode = useCreateNode();
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [type, setType] = useState<OrgNodeType>(parentId ? 'TEAM' : 'ROOT');
  const [isPortfolioArea, setIsPortfolioArea] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    createNode.mutate(
      { name, code, type, parentId, isPortfolioArea },
      { onSuccess: onClose },
    );
  };

  return (
    <Modal isOpen title="Create Node" onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-surface-700 mb-1">Name</label>
          <input
            className="w-full border rounded px-3 py-2 text-sm"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Engineering"
            required
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-surface-700 mb-1">Code</label>
          <input
            className="w-full border rounded px-3 py-2 text-sm"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="e.g. ENG"
            required
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-surface-700 mb-1">Type</label>
          <select
            className="w-full border rounded px-3 py-2 text-sm"
            value={type}
            onChange={(e) => setType(e.target.value as OrgNodeType)}
          >
            {!parentId && <option value="ROOT">Root</option>}
            <option value="DIVISION">Division</option>
            <option value="DEPARTMENT">Department</option>
            <option value="TEAM">Team</option>
            <option value="VIRTUAL">Virtual</option>
          </select>
        </div>
        <div className="flex items-center gap-2">
          <input
            type="checkbox"
            id="isPortfolioArea"
            checked={isPortfolioArea}
            onChange={(e) => setIsPortfolioArea(e.target.checked)}
            className="h-4 w-4 rounded border-surface-300 text-accent-600 focus:ring-accent-500"
          />
          <label htmlFor="isPortfolioArea" className="text-sm font-medium text-surface-700">
            Designate as Portfolio Area
          </label>
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" className="btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button
            type="submit"
            className="btn-primary"
            disabled={createNode.isPending}
          >
            {createNode.isPending ? 'Creating...' : 'Create'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

// ============================================================================
// Main Page
// ============================================================================

export function OrgTreeAdmin() {
  const { data: tree, isLoading } = useOrgTree();
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="px-6 py-4 border-b bg-white">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold text-surface-900">Organization Structure</h1>
            <p className="text-sm text-surface-500 mt-1">
              Manage business units, teams, and approval policies
            </p>
          </div>
          <button
            className="btn-primary"
            onClick={() => setShowCreateModal(true)}
          >
            + Add Node
          </button>
        </div>
      </div>

      {/* Coverage stats */}
      <div className="px-6 pt-4">
        <CoverageStats />
      </div>

      {/* Main content: tree + detail */}
      <div className="flex-1 flex min-h-0 px-6 pb-6 gap-4">
        {/* Tree panel */}
        <div className="w-1/3 bg-white rounded-lg border overflow-y-auto">
          {isLoading ? (
            <div className="p-4 text-sm text-surface-400">Loading tree...</div>
          ) : !tree || tree.length === 0 ? (
            <div className="p-4 text-sm text-surface-400">
              No org structure yet. Create a ROOT node to start.
            </div>
          ) : (
            <div className="py-2">
              {tree.map((root) => (
                <TreeNodeItem
                  key={root.id}
                  node={root}
                  selectedId={selectedNodeId}
                  onSelect={setSelectedNodeId}
                />
              ))}
            </div>
          )}
        </div>

        {/* Detail panel */}
        <div className="flex-1 bg-white rounded-lg border overflow-hidden">
          {selectedNodeId ? (
            <NodeDetailPanel nodeId={selectedNodeId} />
          ) : (
            <div className="flex items-center justify-center h-full text-sm text-surface-400">
              Select a node to view details
            </div>
          )}
        </div>
      </div>

      {showCreateModal && (
        <CreateNodeModal
          parentId={selectedNodeId}
          onClose={() => setShowCreateModal(false)}
        />
      )}
    </div>
  );
}
