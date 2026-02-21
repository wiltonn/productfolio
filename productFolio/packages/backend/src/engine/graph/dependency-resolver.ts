import type { WorkItem, CyclePath, DependencyCheckResult } from './types.js';
import { ValidationError } from '../../lib/errors.js';

export class DependencyResolver {
  private items: Map<string, WorkItem>;
  /** forward edges: item → items that depend on it */
  private forward: Map<string, string[]>;
  /** reverse edges: item → items it depends on */
  private reverse: Map<string, string[]>;

  constructor(items: WorkItem[]) {
    this.items = new Map();
    this.forward = new Map();
    this.reverse = new Map();

    // Index items by ID, check for duplicates
    for (const item of items) {
      if (this.items.has(item.id)) {
        throw new ValidationError(`Duplicate item ID: '${item.id}'`);
      }
      this.items.set(item.id, item);
      this.forward.set(item.id, []);
      this.reverse.set(item.id, []);
    }

    // Build adjacency lists and validate references
    for (const item of items) {
      if (!item.dependsOn) continue;
      for (const depId of item.dependsOn) {
        if (!this.items.has(depId)) {
          throw new ValidationError(
            `Item '${item.id}' depends on unknown item '${depId}'`,
          );
        }
        this.forward.get(depId)!.push(item.id);
        this.reverse.get(item.id)!.push(depId);
      }
    }
  }

  getItem(id: string): WorkItem {
    const item = this.items.get(id);
    if (!item) {
      throw new ValidationError(`Unknown item ID: '${id}'`);
    }
    return item;
  }

  topologicalSort(): string[] {
    // Kahn's algorithm (BFS)
    const inDegree = new Map<string, number>();
    for (const id of this.items.keys()) {
      inDegree.set(id, this.reverse.get(id)!.length);
    }

    // Use sorted queue for deterministic output
    const queue: string[] = [];
    for (const [id, deg] of inDegree) {
      if (deg === 0) queue.push(id);
    }
    queue.sort();

    const result: string[] = [];
    while (queue.length > 0) {
      const current = queue.shift()!;
      result.push(current);

      const neighbors = [...this.forward.get(current)!].sort();
      for (const neighbor of neighbors) {
        const newDeg = inDegree.get(neighbor)! - 1;
        inDegree.set(neighbor, newDeg);
        if (newDeg === 0) {
          // Insert in sorted position
          const idx = queue.findIndex((q) => q > neighbor);
          if (idx === -1) {
            queue.push(neighbor);
          } else {
            queue.splice(idx, 0, neighbor);
          }
        }
      }
    }

    if (result.length !== this.items.size) {
      throw new ValidationError(
        'Cycle detected: topological sort could not resolve all items',
      );
    }

    return result;
  }

  canStart(itemId: string): DependencyCheckResult {
    if (!this.items.has(itemId)) {
      throw new ValidationError(`Unknown item ID: '${itemId}'`);
    }

    const deps = this.reverse.get(itemId)!;
    const pending: string[] = [];

    for (const depId of deps) {
      const dep = this.items.get(depId)!;
      if (dep.state !== 'done' && dep.state !== 'review') {
        pending.push(depId);
      }
    }

    pending.sort();

    if (pending.length > 0) {
      return {
        allowed: false,
        reason: `Blocked by pending dependencies: ${pending.join(', ')}`,
        pendingDependencies: pending,
      };
    }

    return {
      allowed: true,
      reason: 'All dependencies satisfied',
      pendingDependencies: [],
    };
  }

  detectCycles(): CyclePath[] {
    const WHITE = 0;
    const GRAY = 1;
    const BLACK = 2;

    const color = new Map<string, number>();
    for (const id of this.items.keys()) {
      color.set(id, WHITE);
    }

    const parent = new Map<string, string | null>();
    const cycles: CyclePath[] = [];

    const dfs = (node: string) => {
      color.set(node, GRAY);

      const deps = this.reverse.get(node)!;
      for (const dep of deps) {
        if (color.get(dep) === GRAY) {
          // Back edge found — extract cycle
          const path: string[] = [dep];
          let cur = node;
          while (cur !== dep) {
            path.push(cur);
            cur = parent.get(cur)!;
          }
          path.push(dep);
          path.reverse();
          cycles.push({ path });
        } else if (color.get(dep) === WHITE) {
          parent.set(dep, node);
          dfs(dep);
        }
      }

      color.set(node, BLACK);
    };

    // Process nodes in sorted order for determinism
    const sortedIds = [...this.items.keys()].sort();
    for (const id of sortedIds) {
      if (color.get(id) === WHITE) {
        parent.set(id, null);
        dfs(id);
      }
    }

    return cycles;
  }

  criticalPath(): string[] {
    const order = this.topologicalSort();

    // DP: longest path ending at each node
    const dist = new Map<string, number>();
    const prev = new Map<string, string | null>();

    for (const id of order) {
      dist.set(id, 0);
      prev.set(id, null);
    }

    for (const id of order) {
      const currentDist = dist.get(id)!;
      for (const neighbor of this.forward.get(id)!) {
        if (currentDist + 1 > dist.get(neighbor)!) {
          dist.set(neighbor, currentDist + 1);
          prev.set(neighbor, id);
        }
      }
    }

    // Find the node with the longest path
    let maxDist = -1;
    let endNode = order[0];
    for (const [id, d] of dist) {
      if (d > maxDist) {
        maxDist = d;
        endNode = id;
      }
    }

    // Trace back the path
    const path: string[] = [];
    let cur: string | null = endNode;
    while (cur !== null) {
      path.push(cur);
      cur = prev.get(cur)!;
    }
    path.reverse();

    return path;
  }
}
