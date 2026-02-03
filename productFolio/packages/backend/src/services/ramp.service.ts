import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import type { ScenarioAssumptions, RampBreakdown, DomainComplexityLevel, RampProfiles } from '../types/index.js';
import { DEFAULT_RAMP_PROFILES } from '../types/index.js';

class RampService {
  /**
   * Compute and store ramp modifiers on AllocationPeriod rows for a single allocation.
   */
  async computeRampModifiers(
    allocationId: string,
    assumptions: ScenarioAssumptions
  ): Promise<void> {
    const rampEnabled = assumptions.rampEnabled ?? false;

    // Fetch allocation with initiative and employee info
    const allocation = await prisma.allocation.findUnique({
      where: { id: allocationId },
      include: {
        initiative: { select: { id: true, domainComplexity: true } },
        allocationPeriods: true,
      },
    });

    if (!allocation || allocation.allocationPeriods.length === 0) return;

    // If ramp is disabled or no initiative, set modifier to 1.0
    if (!rampEnabled || !allocation.initiativeId || !allocation.initiative) {
      const source: RampBreakdown['source'] = !rampEnabled ? 'ramp_disabled' : 'familiar';
      const breakdown: RampBreakdown = {
        familiarityLevel: 1.0,
        domainComplexity: 'MEDIUM',
        rampProfile: [],
        baseRampModifier: 1.0,
        computedModifier: 1.0,
        source,
      };

      for (const ap of allocation.allocationPeriods) {
        await prisma.allocationPeriod.update({
          where: {
            allocationId_periodId: {
              allocationId: ap.allocationId,
              periodId: ap.periodId,
            },
          },
          data: {
            rampModifier: 1.0,
            rampBreakdown: breakdown as unknown as Prisma.InputJsonValue,
          },
        });
      }
      return;
    }

    // Lookup familiarity
    const familiarity = await prisma.employeeDomainFamiliarity.findUnique({
      where: {
        employeeId_initiativeId: {
          employeeId: allocation.employeeId,
          initiativeId: allocation.initiativeId,
        },
      },
    });

    const familiarityLevel = familiarity?.familiarityLevel ?? 0.0;

    // If fully familiar, set to 1.0
    if (familiarityLevel >= 1.0) {
      const breakdown: RampBreakdown = {
        familiarityLevel: 1.0,
        domainComplexity: allocation.initiative.domainComplexity as DomainComplexityLevel,
        rampProfile: [],
        baseRampModifier: 1.0,
        computedModifier: 1.0,
        source: 'familiar',
      };

      for (const ap of allocation.allocationPeriods) {
        await prisma.allocationPeriod.update({
          where: {
            allocationId_periodId: {
              allocationId: ap.allocationId,
              periodId: ap.periodId,
            },
          },
          data: {
            rampModifier: 1.0,
            rampBreakdown: breakdown as unknown as Prisma.InputJsonValue,
          },
        });
      }
      return;
    }

    // Look up ramp profile from assumptions or defaults
    const profiles: RampProfiles = assumptions.rampProfiles ?? DEFAULT_RAMP_PROFILES;
    const complexity = allocation.initiative.domainComplexity as DomainComplexityLevel;
    const profile = profiles[complexity] ?? profiles.MEDIUM;

    // Compute modifier
    const modifier = this.computeModifier(familiarityLevel, profile);

    const breakdown: RampBreakdown = {
      familiarityLevel,
      domainComplexity: complexity,
      rampProfile: profile,
      baseRampModifier: this.averageProfile(profile),
      computedModifier: modifier,
      source: 'ramp_applied',
    };

    for (const ap of allocation.allocationPeriods) {
      await prisma.allocationPeriod.update({
        where: {
          allocationId_periodId: {
            allocationId: ap.allocationId,
            periodId: ap.periodId,
          },
        },
        data: {
          rampModifier: modifier,
          rampBreakdown: breakdown as unknown as Prisma.InputJsonValue,
        },
      });
    }
  }

  /**
   * Recompute ramp modifiers for all allocations in a scenario.
   */
  async recomputeScenarioRamp(scenarioId: string): Promise<void> {
    const scenario = await prisma.scenario.findUnique({
      where: { id: scenarioId },
      select: { assumptions: true },
    });

    if (!scenario) return;

    const assumptions = (scenario.assumptions as ScenarioAssumptions) || {};

    const allocations = await prisma.allocation.findMany({
      where: { scenarioId },
      select: { id: true },
    });

    for (const allocation of allocations) {
      await this.computeRampModifiers(allocation.id, assumptions);
    }
  }

  /**
   * Compute ramp modifier from familiarity level and ramp profile.
   *
   * Formula:
   * 1. baseRampModifier = average(profile)
   * 2. modifier = familiarityLevel + (1 - familiarityLevel) * baseRampModifier
   * 3. Clamp to [0.1, 1.0]
   */
  private computeModifier(familiarityLevel: number, profile: number[]): number {
    const baseRampModifier = this.averageProfile(profile);
    const modifier = familiarityLevel + (1 - familiarityLevel) * baseRampModifier;
    return Math.max(0.1, Math.min(1.0, modifier));
  }

  private averageProfile(profile: number[]): number {
    if (profile.length === 0) return 1.0;
    return profile.reduce((sum, v) => sum + v, 0) / profile.length;
  }
}

export const rampService = new RampService();
