import type { OrgNode } from '../types';

export interface FlatOrgNode {
  id: string;
  name: string;
  depth: number;
}

/**
 * Flatten a nested OrgNode tree into a depth-tagged list.
 * Useful for building dropdown/select options from the org tree.
 */
export function flattenOrgTree(nodes: OrgNode[], depth = 0): FlatOrgNode[] {
  const result: FlatOrgNode[] = [];
  for (const node of nodes) {
    result.push({ id: node.id, name: node.name, depth });
    if (node.children?.length) {
      result.push(...flattenOrgTree(node.children, depth + 1));
    }
  }
  return result;
}
