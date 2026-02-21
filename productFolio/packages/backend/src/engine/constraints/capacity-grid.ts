import type { Team } from './types.js';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface CapacitySlot {
  readonly total: number;
  readonly allocated: number;
  readonly remaining: number;
  readonly utilization: number; // 0-1 (can exceed 1 if over-allocated)
}

/** A work item to schedule onto the grid. */
export interface GridWorkItem {
  readonly id: string;
  readonly name: string;
  /** Duration in periods. */
  readonly duration: number;
  /** Tokens required per team per period. */
  readonly teamDemands: ReadonlyArray<{ teamId: string; tokensPerPeriod: number }>;
}

export interface ContentionEntry {
  readonly teamId: string;
  readonly teamName: string;
  readonly utilization: number;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeSlot(total: number, allocated: number): CapacitySlot {
  const remaining = total - allocated;
  const utilization = total > 0 ? allocated / total : allocated > 0 ? Infinity : 0;
  return Object.freeze({ total, allocated, remaining, utilization });
}

// ─── CapacityGrid ────────────────────────────────────────────────────────────

/**
 * Temporal capacity hypergraph materialised as a 2D matrix.
 *
 * Rows = teams, columns = planning periods.
 * All mutation methods return a *new* CapacityGrid (immutable).
 *
 * V1 solver: greedy forward scan via `findFeasibleWindow`.
 * Designed to be replaced by a CP solver in V2 without changing the interface.
 */
export class CapacityGrid {
  /** Map<teamId, CapacitySlot[]> — one slot per period. */
  private readonly grid: ReadonlyMap<string, readonly CapacitySlot[]>;
  /** Quick lookup for team metadata. */
  private readonly teamIndex: ReadonlyMap<string, Team>;
  /** Number of planning periods. */
  readonly horizon: number;

  // ── Construction ──────────────────────────────────────────────────────────

  constructor(teams: readonly Team[], horizon: number) {
    const grid = new Map<string, CapacitySlot[]>();
    const teamIndex = new Map<string, Team>();

    for (const team of teams) {
      teamIndex.set(team.id, team);
      const slots: CapacitySlot[] = [];
      for (let p = 0; p < horizon; p++) {
        const total = team.capacityByPeriod[p] ?? 0;
        slots.push(makeSlot(total, 0));
      }
      grid.set(team.id, slots);
    }

    this.grid = grid;
    this.teamIndex = teamIndex;
    this.horizon = horizon;
  }

  /** Internal constructor for producing a new grid from existing slot data. */
  private static fromRaw(
    grid: Map<string, CapacitySlot[]>,
    teamIndex: ReadonlyMap<string, Team>,
    horizon: number,
  ): CapacityGrid {
    const instance = Object.create(CapacityGrid.prototype) as CapacityGrid;
    (instance as any).grid = grid;
    (instance as any).teamIndex = teamIndex;
    (instance as any).horizon = horizon;
    return instance;
  }

  /** Deep-clone the internal grid for mutation in a new instance. */
  private cloneGrid(): Map<string, CapacitySlot[]> {
    const clone = new Map<string, CapacitySlot[]>();
    for (const [teamId, slots] of this.grid) {
      clone.set(teamId, slots.map((s) => ({ ...s })));
    }
    return clone;
  }

  // ── Core mutations (immutable — return new grid) ──────────────────────────

  /**
   * Allocate `tokens` to a team in a specific period.
   * Returns a new CapacityGrid with the updated allocation.
   * Throws if teamId is unknown.
   */
  allocate(teamId: string, periodId: number, tokens: number): CapacityGrid {
    this.assertTeam(teamId);
    this.assertPeriod(periodId);

    const grid = this.cloneGrid();
    const slots = grid.get(teamId)!;
    const old = slots[periodId];
    slots[periodId] = makeSlot(old.total, old.allocated + tokens);

    return CapacityGrid.fromRaw(grid, this.teamIndex, this.horizon);
  }

  /**
   * Deallocate `tokens` from a team in a specific period.
   * Allocated will not go below zero.
   */
  deallocate(teamId: string, periodId: number, tokens: number): CapacityGrid {
    this.assertTeam(teamId);
    this.assertPeriod(periodId);

    const grid = this.cloneGrid();
    const slots = grid.get(teamId)!;
    const old = slots[periodId];
    slots[periodId] = makeSlot(old.total, Math.max(0, old.allocated - tokens));

    return CapacityGrid.fromRaw(grid, this.teamIndex, this.horizon);
  }

  /**
   * Schedule a work item starting at `startPeriod`.
   * Allocates tokens across all required teams for the item's duration.
   */
  scheduleItem(workItem: GridWorkItem, startPeriod: number): CapacityGrid {
    let grid = this.cloneGrid();

    for (const demand of workItem.teamDemands) {
      this.assertTeam(demand.teamId);
      const slots = grid.get(demand.teamId)!;

      for (let offset = 0; offset < workItem.duration; offset++) {
        const p = startPeriod + offset;
        if (p >= this.horizon) break;
        const old = slots[p];
        slots[p] = makeSlot(old.total, old.allocated + demand.tokensPerPeriod);
      }
    }

    return CapacityGrid.fromRaw(grid, this.teamIndex, this.horizon);
  }

  // ── Queries ───────────────────────────────────────────────────────────────

  /** Get utilization (0-1+) for a team in a specific period. */
  getUtilization(teamId: string, periodId: number): number {
    this.assertTeam(teamId);
    this.assertPeriod(periodId);
    return this.grid.get(teamId)![periodId].utilization;
  }

  /** Get the full CapacitySlot for a team in a period. */
  getSlot(teamId: string, periodId: number): CapacitySlot {
    this.assertTeam(teamId);
    this.assertPeriod(periodId);
    return this.grid.get(teamId)![periodId];
  }

  /**
   * Greedy forward scan: find the earliest period >= `earliestStart` where
   * the work item can be fully scheduled without exceeding any team's capacity.
   *
   * Returns the start period index, or `null` if no feasible window exists
   * within the horizon.
   */
  findFeasibleWindow(workItem: GridWorkItem, earliestStart: number): number | null {
    const lastPossibleStart = this.horizon - workItem.duration;

    for (let start = earliestStart; start <= lastPossibleStart; start++) {
      if (this.canFit(workItem, start)) {
        return start;
      }
    }

    return null;
  }

  /**
   * Get teams sorted by utilization (descending) for a given period.
   * Identifies bottlenecks — most-loaded teams first.
   */
  getContention(periodId: number): ContentionEntry[] {
    this.assertPeriod(periodId);

    const entries: ContentionEntry[] = [];
    for (const [teamId, slots] of this.grid) {
      const team = this.teamIndex.get(teamId)!;
      entries.push({
        teamId,
        teamName: team.name,
        utilization: slots[periodId].utilization,
      });
    }

    return entries.sort((a, b) => b.utilization - a.utilization);
  }

  // ── Internals ─────────────────────────────────────────────────────────────

  /** Check whether a work item fits at a given start period without over-allocation. */
  private canFit(workItem: GridWorkItem, startPeriod: number): boolean {
    for (const demand of workItem.teamDemands) {
      const slots = this.grid.get(demand.teamId);
      if (!slots) return false;

      for (let offset = 0; offset < workItem.duration; offset++) {
        const p = startPeriod + offset;
        if (p >= this.horizon) return false;
        if (slots[p].remaining < demand.tokensPerPeriod) return false;
      }
    }
    return true;
  }

  private assertTeam(teamId: string): void {
    if (!this.grid.has(teamId)) {
      throw new Error(`Unknown team: ${teamId}`);
    }
  }

  private assertPeriod(periodId: number): void {
    if (periodId < 0 || periodId >= this.horizon) {
      throw new Error(`Period ${periodId} out of range [0, ${this.horizon})`);
    }
  }
}
