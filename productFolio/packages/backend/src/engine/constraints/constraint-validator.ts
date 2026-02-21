import type {
  ConstraintViolation,
  ConstraintWarning,
  Scenario,
  UtilizationCell,
  ValidationResult,
} from './types.js';
import type { CapacityConstraintResult } from './types.js';
import { ConstraintRegistry } from './constraint-registry.js';

export class ConstraintValidator {
  private registry: ConstraintRegistry;

  constructor(registry?: ConstraintRegistry) {
    this.registry = registry ?? new ConstraintRegistry();
  }

  validate(scenario: Scenario): ValidationResult {
    const violations: ConstraintViolation[] = [];
    const warnings: ConstraintWarning[] = [];
    let utilizationMap: UtilizationCell[] = [];

    for (const evaluator of this.registry.getAll()) {
      const result = evaluator.evaluate(scenario);
      violations.push(...result.violations);
      warnings.push(...result.warnings);

      if ('utilizationGrid' in result) {
        utilizationMap = (result as CapacityConstraintResult).utilizationGrid;
      }
    }

    return {
      feasible: violations.length === 0,
      violations,
      warnings,
      utilizationMap,
    };
  }
}
