import { Job } from 'bullmq';
import { scenarioCalculatorService } from '../../services/scenario-calculator.service.js';
import { prisma } from '../../lib/prisma.js';
import type { ScenarioRecomputeJobData } from '../queue.js';

/**
 * Process scenario recomputation jobs
 *
 * This processor:
 * 1. Invalidates the existing cache for the scenario
 * 2. Recalculates all demand/capacity metrics
 * 3. Stores results in cache for fast retrieval
 */
export async function processScenarioRecompute(
  job: Job<ScenarioRecomputeJobData>
): Promise<{ success: boolean; calculatedAt: string; summary: Record<string, unknown> }> {
  const { scenarioId, triggeredBy } = job.data;

  job.log(`Starting scenario recomputation for ${scenarioId}`);
  job.log(`Triggered by: ${triggeredBy}`);

  // Verify scenario still exists
  const scenario = await prisma.scenario.findUnique({
    where: { id: scenarioId },
    select: { id: true, name: true },
  });

  if (!scenario) {
    job.log(`Scenario ${scenarioId} not found, skipping`);
    return {
      success: false,
      calculatedAt: new Date().toISOString(),
      summary: { error: 'Scenario not found' },
    };
  }

  job.log(`Processing scenario: ${scenario.name}`);
  await job.updateProgress(10);

  // Invalidate existing cache
  await scenarioCalculatorService.invalidateCache(scenarioId);
  job.log('Cache invalidated');
  await job.updateProgress(20);

  // Recalculate with skip cache to force fresh calculation
  const result = await scenarioCalculatorService.calculate(scenarioId, {
    skipCache: true,
    includeBreakdown: true,
  });

  await job.updateProgress(90);

  job.log(`Calculation complete. Summary:`);
  job.log(`- Total demand hours: ${result.summary.totalDemandHours}`);
  job.log(`- Total capacity hours: ${result.summary.totalCapacityHours}`);
  job.log(`- Overall gap: ${result.summary.overallGap}`);
  job.log(`- Shortages: ${result.summary.totalShortages}`);
  job.log(`- Overallocations: ${result.summary.totalOverallocations}`);

  await job.updateProgress(100);

  return {
    success: true,
    calculatedAt: result.calculatedAt.toISOString(),
    summary: result.summary,
  };
}
