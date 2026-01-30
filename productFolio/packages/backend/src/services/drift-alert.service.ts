import { Prisma, DriftAlertStatus, ScenarioStatus, ScenarioType } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { NotFoundError } from '../lib/errors.js';
import { deltaEngineService } from './delta-engine.service.js';
import type { DriftAlertSummary, DriftCheckResult } from '../types/index.js';

export class DriftAlertService {
  /**
   * Check drift for a single locked baseline scenario.
   */
  async checkDrift(scenarioId: string): Promise<DriftCheckResult> {
    const scenario = await prisma.scenario.findUnique({
      where: { id: scenarioId },
      include: { period: true },
    });

    if (!scenario) {
      throw new NotFoundError('Scenario', scenarioId);
    }

    // Only check LOCKED BASELINE scenarios with snapshots
    if (scenario.status !== ScenarioStatus.LOCKED || scenario.scenarioType !== ScenarioType.BASELINE) {
      return {
        driftsDetected: false,
        alerts: [],
        thresholds: { capacityThresholdPct: 0, demandThresholdPct: 0 },
      };
    }

    // Check if snapshot exists
    const snapshot = await prisma.baselineSnapshot.findUnique({
      where: { scenarioId },
    });

    if (!snapshot) {
      return {
        driftsDetected: false,
        alerts: [],
        thresholds: { capacityThresholdPct: 0, demandThresholdPct: 0 },
      };
    }

    const delta = await deltaEngineService.computeDelta(scenarioId);
    const thresholds = await this.getThresholds(scenario.periodId);

    const capDriftPct = Math.abs(delta.summary.totalCapacityDriftPct);
    const demDriftPct = Math.abs(delta.summary.totalDemandDriftPct);
    const exceeds =
      capDriftPct > thresholds.capacityThresholdPct ||
      demDriftPct > thresholds.demandThresholdPct;

    const alerts: DriftAlertSummary[] = [];

    if (exceeds) {
      // Upsert an alert: if an ACTIVE alert exists for this scenario+period, update it
      const existingAlert = await prisma.driftAlert.findFirst({
        where: {
          scenarioId,
          periodId: scenario.periodId,
          status: DriftAlertStatus.ACTIVE,
        },
      });

      if (existingAlert) {
        await prisma.driftAlert.update({
          where: { id: existingAlert.id },
          data: {
            capacityDriftPct: delta.summary.totalCapacityDriftPct,
            demandDriftPct: delta.summary.totalDemandDriftPct,
            netGapDrift: delta.summary.netGapDrift,
            driftDetails: delta.summary as unknown as Prisma.InputJsonValue,
            detectedAt: new Date(),
          },
        });

        alerts.push({
          id: existingAlert.id,
          scenarioId,
          scenarioName: scenario.name,
          periodId: scenario.periodId,
          periodLabel: scenario.period.label,
          status: DriftAlertStatus.ACTIVE,
          capacityDriftPct: delta.summary.totalCapacityDriftPct,
          demandDriftPct: delta.summary.totalDemandDriftPct,
          netGapDrift: delta.summary.netGapDrift,
          detectedAt: new Date(),
          acknowledgedAt: null,
          resolvedAt: null,
        });
      } else {
        const newAlert = await prisma.driftAlert.create({
          data: {
            scenarioId,
            periodId: scenario.periodId,
            status: DriftAlertStatus.ACTIVE,
            capacityDriftPct: delta.summary.totalCapacityDriftPct,
            demandDriftPct: delta.summary.totalDemandDriftPct,
            netGapDrift: delta.summary.netGapDrift,
            driftDetails: delta.summary as unknown as Prisma.InputJsonValue,
          },
        });

        alerts.push({
          id: newAlert.id,
          scenarioId,
          scenarioName: scenario.name,
          periodId: scenario.periodId,
          periodLabel: scenario.period.label,
          status: DriftAlertStatus.ACTIVE,
          capacityDriftPct: delta.summary.totalCapacityDriftPct,
          demandDriftPct: delta.summary.totalDemandDriftPct,
          netGapDrift: delta.summary.netGapDrift,
          detectedAt: newAlert.detectedAt,
          acknowledgedAt: null,
          resolvedAt: null,
        });
      }
    }

    return {
      driftsDetected: exceeds,
      alerts,
      thresholds: {
        capacityThresholdPct: thresholds.capacityThresholdPct,
        demandThresholdPct: thresholds.demandThresholdPct,
      },
    };
  }

  /**
   * Check drift for all locked baseline scenarios.
   */
  async checkAllBaselines(): Promise<DriftCheckResult[]> {
    const baselines = await prisma.scenario.findMany({
      where: {
        status: ScenarioStatus.LOCKED,
        scenarioType: ScenarioType.BASELINE,
      },
      select: { id: true },
    });

    const results: DriftCheckResult[] = [];
    for (const baseline of baselines) {
      try {
        const result = await this.checkDrift(baseline.id);
        results.push(result);
      } catch {
        // Skip scenarios that fail (e.g., missing snapshot)
      }
    }

    return results;
  }

  /**
   * Get drift alerts with optional filters.
   */
  async getAlerts(filters?: {
    scenarioId?: string;
    periodId?: string;
    status?: string;
  }): Promise<DriftAlertSummary[]> {
    const where: Record<string, unknown> = {};
    if (filters?.scenarioId) where.scenarioId = filters.scenarioId;
    if (filters?.periodId) where.periodId = filters.periodId;
    if (filters?.status) where.status = filters.status as DriftAlertStatus;

    const alerts = await prisma.driftAlert.findMany({
      where,
      include: {
        scenario: { select: { name: true } },
        period: { select: { label: true } },
      },
      orderBy: { detectedAt: 'desc' },
    });

    return alerts.map((alert) => ({
      id: alert.id,
      scenarioId: alert.scenarioId,
      scenarioName: alert.scenario.name,
      periodId: alert.periodId,
      periodLabel: alert.period.label,
      status: alert.status,
      capacityDriftPct: alert.capacityDriftPct,
      demandDriftPct: alert.demandDriftPct,
      netGapDrift: alert.netGapDrift,
      detectedAt: alert.detectedAt,
      acknowledgedAt: alert.acknowledgedAt,
      resolvedAt: alert.resolvedAt,
    }));
  }

  /**
   * Acknowledge drift alerts.
   */
  async acknowledgeAlerts(alertIds: string[]) {
    const now = new Date();
    await prisma.driftAlert.updateMany({
      where: {
        id: { in: alertIds },
        status: DriftAlertStatus.ACTIVE,
      },
      data: {
        status: DriftAlertStatus.ACKNOWLEDGED,
        acknowledgedAt: now,
      },
    });

    return { acknowledged: alertIds.length, at: now };
  }

  /**
   * Resolve drift alerts.
   */
  async resolveAlerts(alertIds: string[]) {
    const now = new Date();
    await prisma.driftAlert.updateMany({
      where: {
        id: { in: alertIds },
        status: { in: [DriftAlertStatus.ACTIVE, DriftAlertStatus.ACKNOWLEDGED] },
      },
      data: {
        status: DriftAlertStatus.RESOLVED,
        resolvedAt: now,
      },
    });

    return { resolved: alertIds.length, at: now };
  }

  /**
   * Get drift thresholds. Returns period-specific if available, else global.
   */
  async getThresholds(periodId?: string) {
    if (periodId) {
      const periodThreshold = await prisma.driftThreshold.findFirst({
        where: { periodId, isGlobal: false },
      });
      if (periodThreshold) return periodThreshold;
    }

    // Fall back to global
    const globalThreshold = await prisma.driftThreshold.findFirst({
      where: { isGlobal: true },
    });

    if (globalThreshold) return globalThreshold;

    // Return defaults if nothing configured
    return {
      id: 'default',
      capacityThresholdPct: 5.0,
      demandThresholdPct: 10.0,
      isGlobal: true,
      periodId: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
  }

  /**
   * Update drift thresholds.
   */
  async updateThresholds(data: {
    capacityThresholdPct: number;
    demandThresholdPct: number;
  }, periodId?: string) {
    if (periodId) {
      // Upsert period-specific threshold
      const existing = await prisma.driftThreshold.findFirst({
        where: { periodId, isGlobal: false },
      });

      if (existing) {
        return prisma.driftThreshold.update({
          where: { id: existing.id },
          data: {
            capacityThresholdPct: data.capacityThresholdPct,
            demandThresholdPct: data.demandThresholdPct,
          },
        });
      }

      return prisma.driftThreshold.create({
        data: {
          capacityThresholdPct: data.capacityThresholdPct,
          demandThresholdPct: data.demandThresholdPct,
          isGlobal: false,
          periodId,
        },
      });
    }

    // Upsert global threshold
    const existing = await prisma.driftThreshold.findFirst({
      where: { isGlobal: true },
    });

    if (existing) {
      return prisma.driftThreshold.update({
        where: { id: existing.id },
        data: {
          capacityThresholdPct: data.capacityThresholdPct,
          demandThresholdPct: data.demandThresholdPct,
        },
      });
    }

    return prisma.driftThreshold.create({
      data: {
        capacityThresholdPct: data.capacityThresholdPct,
        demandThresholdPct: data.demandThresholdPct,
        isGlobal: true,
      },
    });
  }
}

export const driftAlertService = new DriftAlertService();
