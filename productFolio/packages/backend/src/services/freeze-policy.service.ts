import { PeriodType } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { NotFoundError, ValidationError } from '../lib/errors.js';

export class FreezePolicyService {
  /**
   * Get freeze policy for a period.
   */
  async getByPeriod(periodId: string) {
    const policy = await prisma.freezePolicy.findUnique({
      where: { periodId },
      include: { period: true },
    });

    return policy;
  }

  /**
   * Create or update a freeze policy for a period.
   */
  async upsert(periodId: string, changeFreezeDate: Date) {
    // Validate period exists and is a QUARTER
    const period = await prisma.period.findUnique({
      where: { id: periodId },
    });

    if (!period) {
      throw new NotFoundError('Period', periodId);
    }

    if (period.type !== PeriodType.QUARTER) {
      throw new ValidationError(`Freeze policies can only be set on QUARTER periods, got ${period.type}`);
    }

    const policy = await prisma.freezePolicy.upsert({
      where: { periodId },
      update: { changeFreezeDate },
      create: { periodId, changeFreezeDate },
      include: { period: true },
    });

    return policy;
  }

  /**
   * Delete freeze policy for a period.
   */
  async delete(periodId: string) {
    const policy = await prisma.freezePolicy.findUnique({
      where: { periodId },
    });

    if (!policy) {
      throw new NotFoundError('FreezePolicy', periodId);
    }

    await prisma.freezePolicy.delete({
      where: { periodId },
    });
  }

  /**
   * Check if a period is currently frozen.
   */
  async isFrozen(periodId: string): Promise<boolean> {
    const policy = await prisma.freezePolicy.findUnique({
      where: { periodId },
    });

    if (!policy) return false;

    return policy.changeFreezeDate <= new Date();
  }

  /**
   * Validate whether a revision is allowed for a period.
   * Returns { allowed, requiresReason, message? }
   */
  async validateRevisionAllowed(
    periodId: string,
    reason?: string
  ): Promise<{ allowed: boolean; requiresReason: boolean; message?: string }> {
    const frozen = await this.isFrozen(periodId);

    if (!frozen) {
      return { allowed: true, requiresReason: false };
    }

    if (!reason) {
      return {
        allowed: false,
        requiresReason: true,
        message: 'Period is frozen. A revision reason is required to create changes.',
      };
    }

    // Frozen but valid reason provided
    return { allowed: true, requiresReason: false };
  }
}

export const freezePolicyService = new FreezePolicyService();
