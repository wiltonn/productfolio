import { prisma } from '../lib/prisma.js';
import { Prisma } from '@prisma/client';
import { deriveSeatType, ROLE_PERMISSIONS } from '../lib/permissions.js';
import type { SeatType } from '../lib/permissions.js';

// Roles whose default permissions include decision-level access
const DECISION_ROLES = Object.entries(ROLE_PERMISSIONS)
  .filter(([_, perms]) => deriveSeatType(perms) === 'decision')
  .map(([role]) => role);

const OBSERVER_ROLES = Object.entries(ROLE_PERMISSIONS)
  .filter(([_, perms]) => deriveSeatType(perms) === 'observer')
  .map(([role]) => role);

class EntitlementService {
  async getTenantConfig() {
    let config = await prisma.tenantConfig.findFirst();
    if (!config) {
      config = await prisma.tenantConfig.create({
        data: { tier: 'starter', seatLimit: 5 },
      });
    }
    return config;
  }

  async updateTenantConfig(data: { tier?: string; seatLimit?: number }) {
    const config = await this.getTenantConfig();
    return prisma.tenantConfig.update({
      where: { id: config.id },
      data,
    });
  }

  async getLicensedUsers() {
    const users = await prisma.user.findMany({
      where: { role: { in: DECISION_ROLES as any }, isActive: true },
      orderBy: { name: 'asc' },
    });
    return { users, count: users.length };
  }

  async getNonLicensedUsers() {
    const users = await prisma.user.findMany({
      where: { role: { in: OBSERVER_ROLES as any }, isActive: true },
      orderBy: { name: 'asc' },
    });
    return { users, count: users.length };
  }

  async getEntitlementSummary() {
    const config = await this.getTenantConfig();
    const [licensedCount, observerCount] = await Promise.all([
      prisma.user.count({ where: { role: { in: DECISION_ROLES as any }, isActive: true } }),
      prisma.user.count({ where: { role: { in: OBSERVER_ROLES as any }, isActive: true } }),
    ]);
    return {
      licensed: licensedCount,
      observers: observerCount,
      seatLimit: config.seatLimit,
      tier: config.tier,
      utilizationPct: config.seatLimit > 0 ? Math.round((licensedCount / config.seatLimit) * 100) : 0,
    };
  }

  async recordEvent(event: {
    eventName: string;
    userId?: string;
    seatType: SeatType;
    metadata?: Record<string, unknown>;
  }) {
    return prisma.entitlementEvent.create({
      data: {
        eventName: event.eventName,
        userId: event.userId,
        seatType: event.seatType,
        metadata: event.metadata ? (event.metadata as Prisma.InputJsonValue) : undefined,
      },
    });
  }

  async getEvents(options: {
    page: number;
    limit: number;
    eventName?: string;
    userId?: string;
  }) {
    const where: Prisma.EntitlementEventWhereInput = {};
    if (options.eventName) where.eventName = options.eventName;
    if (options.userId) where.userId = options.userId;

    const [data, total] = await Promise.all([
      prisma.entitlementEvent.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (options.page - 1) * options.limit,
        take: options.limit,
      }),
      prisma.entitlementEvent.count({ where }),
    ]);

    return {
      data,
      page: options.page,
      limit: options.limit,
      total,
      totalPages: Math.ceil(total / options.limit),
    };
  }

  async getExpansionSignals() {
    const config = await this.getTenantConfig();
    const [licensedCount, blockedAttempts] = await Promise.all([
      prisma.user.count({ where: { role: { in: DECISION_ROLES as any }, isActive: true } }),
      prisma.entitlementEvent.count({
        where: {
          eventName: 'decision_seat_blocked',
          createdAt: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) }, // last 30 days
        },
      }),
    ]);

    return {
      blockedAttempts,
      nearLimit: licensedCount >= config.seatLimit - 1,
      utilizationPct: config.seatLimit > 0 ? Math.round((licensedCount / config.seatLimit) * 100) : 0,
      licensed: licensedCount,
      seatLimit: config.seatLimit,
      tier: config.tier,
    };
  }
}

export const entitlementService = new EntitlementService();
