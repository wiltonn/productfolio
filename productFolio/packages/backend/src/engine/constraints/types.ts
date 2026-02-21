export interface TeamAllocation {
  teamId: string;
  periodIndex: number;
  tokens: number;
}

export interface ScheduledItem {
  id: string;
  name: string;
  teamAllocations: TeamAllocation[];
  startPeriod: number;
  duration: number;
  dependencies: string[];
}

export interface Team {
  id: string;
  name: string;
  capacityByPeriod: number[];
}

export interface Scenario {
  id: string;
  name: string;
  horizon: number;
  teams: Team[];
  items: ScheduledItem[];
}

export interface ConstraintViolation {
  constraintId: string;
  severity: 'error';
  message: string;
  affectedItemIds: string[];
  affectedTeamIds: string[];
  affectedPeriods: number[];
}

export interface ConstraintWarning {
  constraintId: string;
  severity: 'warning';
  message: string;
  metric: string;
  threshold: number;
  actual: number;
}

export interface UtilizationCell {
  teamId: string;
  periodIndex: number;
  allocated: number;
  available: number;
  utilization: number;
}

export interface ValidationResult {
  feasible: boolean;
  violations: ConstraintViolation[];
  warnings: ConstraintWarning[];
  utilizationMap: UtilizationCell[];
}

export interface ConstraintEvaluatorResult {
  violations: ConstraintViolation[];
  warnings: ConstraintWarning[];
}

export interface CapacityConstraintResult extends ConstraintEvaluatorResult {
  utilizationGrid: UtilizationCell[];
}

export interface ConstraintEvaluator {
  id: string;
  name: string;
  evaluate(scenario: Scenario): ConstraintEvaluatorResult;
}
