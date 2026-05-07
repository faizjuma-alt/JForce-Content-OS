import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

// Upstash is optional; if not configured we noop.
const hasUpstash = !!process.env.UPSTASH_REDIS_REST_URL && !!process.env.UPSTASH_REDIS_REST_TOKEN;

const redis = hasUpstash ? Redis.fromEnv() : null;

function buildLimiter(prefix: string, requests: number, windowSec: number) {
  if (!redis) return null;
  return new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(requests, `${windowSec} s`),
    analytics: true,
    prefix,
  });
}

export const limiters = {
  auth:    buildLimiter("rl:auth",    5,  60),  // 5 per minute per IP
  api:     buildLimiter("rl:api",     60, 60),  // 60 per minute per session
  push:    buildLimiter("rl:push",    10, 60),  // 10 workflow pushes per minute per user
  upload:  buildLimiter("rl:upload",  20, 60),  // 20 uploads per minute per user
  webhook: buildLimiter("rl:webhook", 100, 60), // 100 inbound callbacks per minute per source
};

export async function ratelimit(
  limiter: Ratelimit | null,
  identifier: string,
): Promise<{ ok: boolean; remaining: number; reset: number }> {
  if (!limiter) return { ok: true, remaining: 999, reset: 0 };
  const r = await limiter.limit(identifier);
  return { ok: r.success, remaining: r.remaining, reset: r.reset };
}
