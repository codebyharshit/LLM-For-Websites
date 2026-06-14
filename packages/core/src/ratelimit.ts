import type { Redis } from "ioredis";

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  limit: number;
  resetSec: number;
}

/**
 * Fixed-window rate limit backed by Redis INCR + EXPIRE. The first request in a window
 * sets the TTL; subsequent ones increment. Returns allowed=false once count exceeds limit.
 */
export async function rateLimit(
  redis: Redis,
  key: string,
  limit: number,
  windowSec: number,
): Promise<RateLimitResult> {
  const rkey = `rl:${key}`;
  const count = await redis.incr(rkey);
  if (count === 1) {
    await redis.expire(rkey, windowSec);
  }
  const ttl = await redis.ttl(rkey);
  return {
    allowed: count <= limit,
    remaining: Math.max(0, limit - count),
    limit,
    resetSec: ttl < 0 ? windowSec : ttl,
  };
}
