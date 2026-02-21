import { useState } from 'react';
import type { OrgNode } from '../types';

const typeColors: Record<string, string> = {
  ROOT: 'text-purple-600 bg-purple-50',
  DIVISION: 'text-blue-600 bg-blue-50',
  DEPARTMENT: 'text-green-600 bg-green-50',
  TEAM: 'text-orange-600 bg-orange-50',
  VIRTUAL: 'text-gray-600 bg-gray-50',
  PRODUCT: 'text-teal-600 bg-teal-50',
  PLATFORM: 'text-cyan-600 bg-cyan-50',
  FUNCTIONAL: 'text-pink-600 bg-pink-50',
  CHAPTER: 'text-rose-600 bg-rose-50',
};

export function TreeNodeItem({
  node,
  selectedId,
  onSelect,
  depth = 0,
  showPortfolioAreaBadge = false,
}: {
  node: OrgNode;
  selectedId: string | null;
  onSelect: (id: string) => void;
  depth?: number;
  showPortfolioAreaBadge?: boolean;
}) {
  const [expanded, setExpanded] = useState(depth < 2);
  const hasChildren = node.children && node.children.length > 0;
  const isSelected = node.id === selectedId;

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
        <span
          className={`text-xs font-medium px-1.5 py-0.5 rounded ${typeColors[node.type] ?? ''}`}
        >
          {node.type.slice(0, 3)}
        </span>
        <span className="text-sm font-medium text-surface-800 truncate">
          {node.name}
        </span>
        {showPortfolioAreaBadge && node.isPortfolioArea && (
          <span className="text-xs font-medium px-1.5 py-0.5 rounded text-indigo-600 bg-indigo-50">
            PA
          </span>
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
              showPortfolioAreaBadge={showPortfolioAreaBadge}
            />
          ))}
        </div>
      )}
    </div>
  );
}
