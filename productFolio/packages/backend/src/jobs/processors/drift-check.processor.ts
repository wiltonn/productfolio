import { Job } from 'bullmq';
import type { DriftCheckJobData } from '../queue.js';
import { driftAlertService } from '../../services/drift-alert.service.js';

export async function processDriftCheck(
  job: Job<DriftCheckJobData>
): Promise<{ alertsCreated: number; scenariosChecked: number }> {
  const { scenarioId, triggeredBy } = job.data;

  console.log(`[drift-check] Processing drift check (triggeredBy: ${triggeredBy})`);

  let alertsCreated = 0;
  let scenariosChecked = 0;

  if (scenarioId) {
    // Check single baseline
    const result = await driftAlertService.checkDrift(scenarioId);
    scenariosChecked = 1;
    alertsCreated = result.alerts.length;
  } else {
    // Check all locked baselines
    const results = await driftAlertService.checkAllBaselines();
    scenariosChecked = results.length;
    alertsCreated = results.reduce((sum, r) => sum + r.alerts.length, 0);
  }

  console.log(
    `[drift-check] Complete: ${scenariosChecked} scenarios checked, ${alertsCreated} alerts created/updated`
  );

  return { alertsCreated, scenariosChecked };
}
