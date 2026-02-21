import { prisma } from '../lib/prisma.js';
import { NotFoundError, ValidationError } from '../lib/errors.js';

/**
 * Parse a materialized path string into an array of node IDs,
 * optionally excluding a specific node ID.
 *
 * Example: "/aaa/bbb/ccc/" → ["aaa", "bbb", "ccc"]
 *          with excludeId="ccc" → ["aaa", "bbb"]
 */
export function parsePathToIds(path: string, excludeId?: string): string[] {
  const ids = path.split('/').filter((segment) => segment.length > 0);
  return excludeId ? ids.filter((id) => id !== excludeId) : ids;
}

/**
 * Fetch an OrgNode by ID and ensure it exists and is active.
 * Throws NotFoundError if missing, ValidationError if inactive.
 */
export async function requireActiveNode(nodeId: string) {
  const node = await prisma.orgNode.findUnique({ where: { id: nodeId } });
  if (!node) throw new NotFoundError('OrgNode', nodeId);
  if (!node.isActive) throw new ValidationError('Cannot operate on an inactive node');
  return node;
}
