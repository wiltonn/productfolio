// ============================================================================
// Decision Log — Audit trail for all governance decisions
// ============================================================================

import type { DecisionLogEntry, ProjectedScenario, Violation, Warning } from './types.js';

let logIdCounter = 0;

export class DecisionLog {
  private entries: DecisionLogEntry[] = [];

  record(params: {
    action: DecisionLogEntry['action'];
    request: unknown;
    projectedScenario: ProjectedScenario;
    constraintsEvaluated: string[];
    result: DecisionLogEntry['result'];
    violations: Violation[];
    warnings: Warning[];
    durationMs: number;
  }): DecisionLogEntry {
    const entry: DecisionLogEntry = {
      id: `decision-${++logIdCounter}`,
      timestamp: new Date(),
      ...params,
    };
    this.entries.push(entry);
    return entry;
  }

  getAll(): DecisionLogEntry[] {
    return [...this.entries];
  }

  getById(id: string): DecisionLogEntry | undefined {
    return this.entries.find((e) => e.id === id);
  }

  clear(): void {
    this.entries = [];
  }
}
