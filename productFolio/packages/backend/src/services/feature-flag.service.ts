import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { getRedisClient } from '../lib/redis.js';
import { NotFoundError } from '../lib/errors.js';
import type { UpdateFeatureFlagInput } from '../schemas/feature-flags.schema.js';

const FF_PREFIX = 'ff:';
const FF_TTL = 60; // 60 seconds

function cacheKey(key: string): string {
  return `${FF_PREFIX}${key}`;
}

/**
 * Check if a feature flag is enabled.
 * Hot path — uses Redis cache with DB fallback.
 * Returns false for unknown keys (feature not found = disabled).
 */
export async function isEnabled(key: string): Promise<boolean> {
  try {
    const redis = getRedisClient();
    const cached = await redis.get(cacheKey(key));
    if (cached !== null) {
      return cached === '1';
    }
  } catch {
    // Redis unavailable — fall through to DB
  }

  const flag = await prisma.featureFlag.findUnique({
    where: { key },
    select: { enabled: true },
  });

  const enabled = flag?.enabled ?? false;

  // Warm cache
  try {
    const redis = getRedisClient();
    await redis.setex(cacheKey(key), FF_TTL, enabled ? '1' : '0');
  } catch {
    // Cache warming failed — non-fatal
  }

  return enabled;
}

/**
 * Get a single feature flag by key (direct DB, for admin use).
 */
export async function getFlag(key: string) {
  const flag = await prisma.featureFlag.findUnique({
    where: { key },
  });

  if (!flag) {
    throw new NotFoundError('FeatureFlag', key);
  }

  return flag;
}

/**
 * List all feature flags (direct DB, for admin use).
 */
export async function listFlags() {
  return prisma.featureFlag.findMany({
    orderBy: { key: 'asc' },
  });
}

/**
 * Update a feature flag and invalidate its Redis cache.
 */
export async function setFlag(key: string, data: UpdateFeatureFlagInput) {
  const flag = await prisma.featureFlag.findUnique({
    where: { key },
  });

  if (!flag) {
    throw new NotFoundError('FeatureFlag', key);
  }

  const updated = await prisma.featureFlag.update({
    where: { key },
    data: {
      ...(data.enabled !== undefined && { enabled: data.enabled }),
      ...(data.description !== undefined && { description: data.description }),
      ...(data.metadata !== undefined && {
        metadata: data.metadata === null
          ? Prisma.JsonNull
          : (data.metadata as Prisma.InputJsonValue),
      }),
    },
  });

  // Invalidate cache immediately
  try {
    const redis = getRedisClient();
    await redis.del(cacheKey(key));
  } catch {
    // Cache invalidation failed — will expire via TTL
  }

  return updated;
}
