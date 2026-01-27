import Redis from 'ioredis';

let redisClient: Redis.Redis | null = null;

export const CACHE_KEYS = {
  scenarioCalculation: (id: string) => `scenario:${id}:calculations`,
};

export const CACHE_TTL = {
  CALCULATION: 300, // 5 minutes
};

/**
 * Get Redis client singleton with retry strategy
 */
export function getRedisClient(): Redis.Redis {
  if (redisClient) {
    return redisClient;
  }

  const host = process.env.REDIS_HOST || 'localhost';
  const port = parseInt(process.env.REDIS_PORT || '6379', 10);
  const password = process.env.REDIS_PASSWORD || undefined;
  const db = parseInt(process.env.REDIS_DB || '0', 10);

  redisClient = new Redis.default({
    host,
    port,
    password: password || undefined,
    db,
    retryStrategy: (times: number) => {
      if (times > 3) {
        // Stop retrying after 3 attempts
        return null;
      }
      // Exponential backoff: 100ms, 200ms, 400ms
      return Math.min(times * 100, 400);
    },
    maxRetriesPerRequest: 3,
    lazyConnect: true,
  });

  redisClient.on('error', (err: Error) => {
    console.error('Redis connection error:', err.message);
  });

  redisClient.on('connect', () => {
    console.log('Redis connected');
  });

  return redisClient;
}

/**
 * Get parsed JSON data from cache
 */
export async function getCachedData<T>(key: string): Promise<T | null> {
  try {
    const client = getRedisClient();
    const data = await client.get(key);
    if (!data) {
      return null;
    }
    return JSON.parse(data) as T;
  } catch (error) {
    console.error('Redis get error:', error);
    return null;
  }
}

/**
 * Set data in cache with TTL
 */
export async function setCachedData<T>(
  key: string,
  data: T,
  ttl: number = CACHE_TTL.CALCULATION
): Promise<boolean> {
  try {
    const client = getRedisClient();
    await client.setex(key, ttl, JSON.stringify(data));
    return true;
  } catch (error) {
    console.error('Redis set error:', error);
    return false;
  }
}

/**
 * Delete keys matching pattern
 */
export async function invalidateCache(pattern: string): Promise<number> {
  try {
    const client = getRedisClient();
    const keys = await client.keys(pattern);
    if (keys.length === 0) {
      return 0;
    }
    const deleted = await client.del(...keys);
    return deleted;
  } catch (error) {
    console.error('Redis invalidate error:', error);
    return 0;
  }
}

/**
 * Delete a specific key
 */
export async function deleteKey(key: string): Promise<boolean> {
  try {
    const client = getRedisClient();
    await client.del(key);
    return true;
  } catch (error) {
    console.error('Redis delete error:', error);
    return false;
  }
}

/**
 * Check if Redis is available
 */
export async function isRedisAvailable(): Promise<boolean> {
  try {
    const client = getRedisClient();
    await client.ping();
    return true;
  } catch {
    return false;
  }
}

/**
 * Close Redis connection (for cleanup)
 */
export async function closeRedisConnection(): Promise<void> {
  if (redisClient) {
    await redisClient.quit();
    redisClient = null;
  }
}
