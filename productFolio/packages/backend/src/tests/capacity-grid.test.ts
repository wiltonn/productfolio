import { describe, it, expect } from 'vitest';
import { CapacityGrid } from '../engine/constraints/capacity-grid.js';
import type { GridWorkItem } from '../engine/constraints/capacity-grid.js';
import type { Team } from '../engine/constraints/types.js';

// ─── Test Helpers ────────────────────────────────────────────────────────────

function makeTeams(...specs: Array<{ id: string; name: string; capacity: number[] }>): Team[] {
  return specs.map((s) => ({ id: s.id, name: s.name, capacityByPeriod: s.capacity }));
}

function makeItem(overrides: Partial<GridWorkItem> & { id: string }): GridWorkItem {
  return {
    name: overrides.name ?? `Item ${overrides.id}`,
    duration: overrides.duration ?? 1,
    teamDemands: overrides.teamDemands ?? [],
    ...overrides,
  };
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('CapacityGrid', () => {
  const teams = makeTeams(
    { id: 'backend', name: 'Backend', capacity: [10, 10, 10, 10] },
    { id: 'frontend', name: 'Frontend', capacity: [8, 8, 8, 8] },
    { id: 'qa', name: 'QA', capacity: [5, 5, 5, 5] },
  );

  describe('construction', () => {
    it('initialises all slots with zero allocation', () => {
      const grid = new CapacityGrid(teams, 4);

      expect(grid.getSlot('backend', 0)).toEqual({
        total: 10,
        allocated: 0,
        remaining: 10,
        utilization: 0,
      });
      expect(grid.horizon).toBe(4);
    });

    it('handles teams with uneven capacity arrays', () => {
      const unevenTeams = makeTeams({ id: 't1', name: 'T1', capacity: [10, 5] });
      const grid = new CapacityGrid(unevenTeams, 4);

      expect(grid.getSlot('t1', 0).total).toBe(10);
      expect(grid.getSlot('t1', 1).total).toBe(5);
      // periods beyond the capacity array get 0
      expect(grid.getSlot('t1', 2).total).toBe(0);
      expect(grid.getSlot('t1', 3).total).toBe(0);
    });
  });

  describe('allocate / deallocate', () => {
    it('allocate returns a new grid with updated slot', () => {
      const grid = new CapacityGrid(teams, 4);
      const updated = grid.allocate('backend', 0, 6);

      // Original unchanged
      expect(grid.getSlot('backend', 0).allocated).toBe(0);
      // New grid has allocation
      expect(updated.getSlot('backend', 0)).toEqual({
        total: 10,
        allocated: 6,
        remaining: 4,
        utilization: 0.6,
      });
    });

    it('allocate allows over-allocation (utilization > 1)', () => {
      const grid = new CapacityGrid(teams, 4);
      const updated = grid.allocate('backend', 0, 15);

      expect(updated.getSlot('backend', 0).allocated).toBe(15);
      expect(updated.getSlot('backend', 0).remaining).toBe(-5);
      expect(updated.getSlot('backend', 0).utilization).toBe(1.5);
    });

    it('deallocate reduces allocation', () => {
      const grid = new CapacityGrid(teams, 4);
      const allocated = grid.allocate('backend', 0, 8);
      const deallocated = allocated.deallocate('backend', 0, 3);

      expect(deallocated.getSlot('backend', 0).allocated).toBe(5);
      expect(deallocated.getSlot('backend', 0).remaining).toBe(5);
    });

    it('deallocate floors allocation at zero', () => {
      const grid = new CapacityGrid(teams, 4);
      const deallocated = grid.deallocate('backend', 0, 100);

      expect(deallocated.getSlot('backend', 0).allocated).toBe(0);
    });

    it('throws on unknown team', () => {
      const grid = new CapacityGrid(teams, 4);
      expect(() => grid.allocate('nonexistent', 0, 5)).toThrow('Unknown team: nonexistent');
    });

    it('throws on out-of-range period', () => {
      const grid = new CapacityGrid(teams, 4);
      expect(() => grid.allocate('backend', 4, 5)).toThrow('Period 4 out of range [0, 4)');
      expect(() => grid.allocate('backend', -1, 5)).toThrow('Period -1 out of range [0, 4)');
    });
  });

  describe('scheduleItem', () => {
    it('allocates across all required teams for the duration', () => {
      const grid = new CapacityGrid(teams, 4);
      const item = makeItem({
        id: 'feature-1',
        duration: 2,
        teamDemands: [
          { teamId: 'backend', tokensPerPeriod: 4 },
          { teamId: 'frontend', tokensPerPeriod: 3 },
        ],
      });

      const updated = grid.scheduleItem(item, 1);

      // Period 1 and 2 should be allocated
      expect(updated.getSlot('backend', 1).allocated).toBe(4);
      expect(updated.getSlot('backend', 2).allocated).toBe(4);
      expect(updated.getSlot('frontend', 1).allocated).toBe(3);
      expect(updated.getSlot('frontend', 2).allocated).toBe(3);

      // Period 0 and 3 untouched
      expect(updated.getSlot('backend', 0).allocated).toBe(0);
      expect(updated.getSlot('backend', 3).allocated).toBe(0);

      // QA untouched
      expect(updated.getSlot('qa', 1).allocated).toBe(0);
    });

    it('clips allocations that extend past the horizon', () => {
      const grid = new CapacityGrid(teams, 4);
      const item = makeItem({
        id: 'long-item',
        duration: 3,
        teamDemands: [{ teamId: 'backend', tokensPerPeriod: 5 }],
      });

      const updated = grid.scheduleItem(item, 2);

      // Only periods 2 and 3 should be allocated (period 4 is out of range)
      expect(updated.getSlot('backend', 2).allocated).toBe(5);
      expect(updated.getSlot('backend', 3).allocated).toBe(5);
    });

    it('is immutable — original grid unchanged', () => {
      const grid = new CapacityGrid(teams, 4);
      const item = makeItem({
        id: 'x',
        duration: 1,
        teamDemands: [{ teamId: 'backend', tokensPerPeriod: 5 }],
      });

      grid.scheduleItem(item, 0);
      expect(grid.getSlot('backend', 0).allocated).toBe(0);
    });
  });

  describe('getUtilization', () => {
    it('returns correct utilization ratio', () => {
      const grid = new CapacityGrid(teams, 4).allocate('backend', 0, 7);
      expect(grid.getUtilization('backend', 0)).toBeCloseTo(0.7);
    });

    it('returns 0 for unallocated slots', () => {
      const grid = new CapacityGrid(teams, 4);
      expect(grid.getUtilization('frontend', 2)).toBe(0);
    });

    it('returns Infinity when total capacity is zero but tokens allocated', () => {
      const zeroTeams = makeTeams({ id: 't1', name: 'T1', capacity: [0] });
      const grid = new CapacityGrid(zeroTeams, 1).allocate('t1', 0, 5);
      expect(grid.getUtilization('t1', 0)).toBe(Infinity);
    });
  });

  describe('findFeasibleWindow', () => {
    it('returns earliest period where item fits', () => {
      const grid = new CapacityGrid(teams, 4);
      const item = makeItem({
        id: 'fit-test',
        duration: 2,
        teamDemands: [{ teamId: 'backend', tokensPerPeriod: 5 }],
      });

      expect(grid.findFeasibleWindow(item, 0)).toBe(0);
    });

    it('skips periods with insufficient capacity', () => {
      // Fill backend periods 0 and 1 to near-full
      const grid = new CapacityGrid(teams, 4)
        .allocate('backend', 0, 8)
        .allocate('backend', 1, 8);

      const item = makeItem({
        id: 'needs-space',
        duration: 2,
        teamDemands: [{ teamId: 'backend', tokensPerPeriod: 5 }],
      });

      // Periods 0-1 have only 2 remaining each, so earliest 2-period window is period 2
      expect(grid.findFeasibleWindow(item, 0)).toBe(2);
    });

    it('returns null when no feasible window exists', () => {
      // Fill all periods
      let grid = new CapacityGrid(teams, 4);
      for (let p = 0; p < 4; p++) {
        grid = grid.allocate('backend', p, 10);
      }

      const item = makeItem({
        id: 'no-room',
        duration: 1,
        teamDemands: [{ teamId: 'backend', tokensPerPeriod: 1 }],
      });

      expect(grid.findFeasibleWindow(item, 0)).toBeNull();
    });

    it('returns null when item duration exceeds remaining horizon', () => {
      const grid = new CapacityGrid(teams, 4);
      const item = makeItem({
        id: 'too-long',
        duration: 5,
        teamDemands: [{ teamId: 'backend', tokensPerPeriod: 1 }],
      });

      expect(grid.findFeasibleWindow(item, 0)).toBeNull();
    });

    it('respects earliestStart parameter', () => {
      const grid = new CapacityGrid(teams, 4);
      const item = makeItem({
        id: 'delayed',
        duration: 1,
        teamDemands: [{ teamId: 'backend', tokensPerPeriod: 5 }],
      });

      expect(grid.findFeasibleWindow(item, 2)).toBe(2);
    });

    it('considers all team demands simultaneously', () => {
      // Frontend full in period 0, backend has space everywhere
      const grid = new CapacityGrid(teams, 4).allocate('frontend', 0, 8);

      const item = makeItem({
        id: 'multi-team',
        duration: 1,
        teamDemands: [
          { teamId: 'backend', tokensPerPeriod: 5 },
          { teamId: 'frontend', tokensPerPeriod: 3 },
        ],
      });

      // Period 0: frontend has 0 remaining → skip. Period 1: both fit.
      expect(grid.findFeasibleWindow(item, 0)).toBe(1);
    });
  });

  describe('getContention', () => {
    it('returns teams sorted by utilization descending', () => {
      const grid = new CapacityGrid(teams, 4)
        .allocate('backend', 0, 5) // 50%
        .allocate('frontend', 0, 6) // 75%
        .allocate('qa', 0, 4); // 80%

      const contention = grid.getContention(0);

      expect(contention).toHaveLength(3);
      expect(contention[0].teamId).toBe('qa');
      expect(contention[0].utilization).toBeCloseTo(0.8);
      expect(contention[1].teamId).toBe('frontend');
      expect(contention[1].utilization).toBeCloseTo(0.75);
      expect(contention[2].teamId).toBe('backend');
      expect(contention[2].utilization).toBeCloseTo(0.5);
    });

    it('includes team names', () => {
      const grid = new CapacityGrid(teams, 4);
      const contention = grid.getContention(0);

      const names = contention.map((c) => c.teamName);
      expect(names).toContain('Backend');
      expect(names).toContain('Frontend');
      expect(names).toContain('QA');
    });
  });

  // ─── Realistic Scenarios ──────────────────────────────────────────────────

  describe('realistic scenario: items competing for the same team', () => {
    it('two items compete for backend in the same period', () => {
      const grid = new CapacityGrid(teams, 4);

      const itemA = makeItem({
        id: 'A',
        name: 'Auth Module',
        duration: 2,
        teamDemands: [{ teamId: 'backend', tokensPerPeriod: 6 }],
      });

      const itemB = makeItem({
        id: 'B',
        name: 'Payment API',
        duration: 2,
        teamDemands: [{ teamId: 'backend', tokensPerPeriod: 7 }],
      });

      // Schedule A at period 0 → uses 6/10 per period
      const afterA = grid.scheduleItem(itemA, 0);
      expect(afterA.getSlot('backend', 0).remaining).toBe(4);

      // B needs 7 tokens — won't fit alongside A in periods 0-1
      expect(afterA.findFeasibleWindow(itemB, 0)).toBe(2);

      // Schedule B at period 2
      const afterBoth = afterA.scheduleItem(itemB, 2);
      expect(afterBoth.getSlot('backend', 2).allocated).toBe(7);
      expect(afterBoth.getSlot('backend', 3).allocated).toBe(7);
    });
  });

  describe('realistic scenario: cascading allocation', () => {
    it('scheduling item A shifts item B feasible window, which shifts C', () => {
      // Single team with tight capacity
      const tightTeams = makeTeams(
        { id: 'dev', name: 'Dev Team', capacity: [8, 8, 8, 8, 8, 8] },
      );
      let grid = new CapacityGrid(tightTeams, 6);

      const itemA = makeItem({
        id: 'A',
        duration: 2,
        teamDemands: [{ teamId: 'dev', tokensPerPeriod: 6 }],
      });
      const itemB = makeItem({
        id: 'B',
        duration: 2,
        teamDemands: [{ teamId: 'dev', tokensPerPeriod: 5 }],
      });
      const itemC = makeItem({
        id: 'C',
        duration: 2,
        teamDemands: [{ teamId: 'dev', tokensPerPeriod: 5 }],
      });

      // A at period 0: 6/8 used → 2 remaining in periods 0,1
      const startA = grid.findFeasibleWindow(itemA, 0);
      expect(startA).toBe(0);
      grid = grid.scheduleItem(itemA, startA!);

      // B needs 5 tokens → can't fit in periods 0-1 (only 2 remaining)
      const startB = grid.findFeasibleWindow(itemB, 0);
      expect(startB).toBe(2); // pushed to period 2
      grid = grid.scheduleItem(itemB, startB!);

      // C also needs 5 → can't fit in 0-1 (2 remaining) or 2-3 (3 remaining)
      const startC = grid.findFeasibleWindow(itemC, 0);
      expect(startC).toBe(4); // pushed to period 4
      grid = grid.scheduleItem(itemC, startC!);

      // Verify final grid state
      expect(grid.getSlot('dev', 0).allocated).toBe(6); // A
      expect(grid.getSlot('dev', 1).allocated).toBe(6); // A
      expect(grid.getSlot('dev', 2).allocated).toBe(5); // B
      expect(grid.getSlot('dev', 3).allocated).toBe(5); // B
      expect(grid.getSlot('dev', 4).allocated).toBe(5); // C
      expect(grid.getSlot('dev', 5).allocated).toBe(5); // C
    });
  });

  describe('realistic scenario: bottleneck identification', () => {
    it('identifies QA as the bottleneck when it has highest utilization', () => {
      const grid = new CapacityGrid(teams, 4)
        .allocate('backend', 1, 3) // 30%
        .allocate('frontend', 1, 4) // 50%
        .allocate('qa', 1, 4); // 80% — bottleneck!

      const contention = grid.getContention(1);
      expect(contention[0].teamId).toBe('qa');
      expect(contention[0].teamName).toBe('QA');
      expect(contention[0].utilization).toBeCloseTo(0.8);
    });

    it('tracks bottleneck shifting across periods after scheduling', () => {
      let grid = new CapacityGrid(teams, 4);

      // Heavy backend item in periods 0-1
      grid = grid.scheduleItem(
        makeItem({
          id: 'heavy-be',
          duration: 2,
          teamDemands: [{ teamId: 'backend', tokensPerPeriod: 9 }],
        }),
        0,
      );

      // Heavy QA item in periods 2-3
      grid = grid.scheduleItem(
        makeItem({
          id: 'heavy-qa',
          duration: 2,
          teamDemands: [{ teamId: 'qa', tokensPerPeriod: 4 }],
        }),
        2,
      );

      // Period 0: backend is bottleneck (90%)
      expect(grid.getContention(0)[0].teamId).toBe('backend');
      expect(grid.getContention(0)[0].utilization).toBeCloseTo(0.9);

      // Period 2: QA is bottleneck (80%)
      expect(grid.getContention(2)[0].teamId).toBe('qa');
      expect(grid.getContention(2)[0].utilization).toBeCloseTo(0.8);
    });
  });

  describe('realistic scenario: multi-team scheduling', () => {
    it('finds window that satisfies all team constraints simultaneously', () => {
      const wideTeams = makeTeams(
        { id: 'backend', name: 'Backend', capacity: [10, 10, 10, 10, 10, 10] },
        { id: 'frontend', name: 'Frontend', capacity: [8, 8, 8, 8, 8, 8] },
        { id: 'qa', name: 'QA', capacity: [5, 5, 5, 5, 5, 5] },
      );
      let grid = new CapacityGrid(wideTeams, 6);

      // Fill backend in periods 0-1
      grid = grid.allocate('backend', 0, 10).allocate('backend', 1, 10);

      // Fill frontend in periods 2-3
      grid = grid.allocate('frontend', 2, 8).allocate('frontend', 3, 8);

      // Item needs both backend AND frontend for 2 periods
      const crossTeamItem = makeItem({
        id: 'cross-team',
        duration: 2,
        teamDemands: [
          { teamId: 'backend', tokensPerPeriod: 3 },
          { teamId: 'frontend', tokensPerPeriod: 3 },
        ],
      });

      // Periods 0-1: no backend space. Periods 2-3: no frontend space.
      // First window: period 4.
      expect(grid.findFeasibleWindow(crossTeamItem, 0)).toBe(4);
    });
  });
});
