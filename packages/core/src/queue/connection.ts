import IORedis, { type Redis } from "ioredis";

/**
 * Create a Redis connection for BullMQ. `maxRetriesPerRequest: null` is required by
 * BullMQ workers (blocking commands must not time out).
 */
export function makeRedisConnection(url: string): Redis {
  return new IORedis(url, { maxRetriesPerRequest: null });
}
