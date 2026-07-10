/**
 * Fixed-window in-process rate limiter. Deliberately dependency-free and
 * per-instance: like cache.ts, it degrades on serverless (each instance
 * counts separately, and a cold start resets it), which weakens but does not
 * remove the protection. Good enough to blunt cost abuse of the paid Claude
 * vision call in Phase 1; a shared store (or auth, Phase 2) tightens it.
 */

export interface RateLimiter {
  /** True if the call is allowed; false if the key is over its limit. */
  allow(key: string, now?: number): boolean;
}

export function createRateLimiter(options: { windowMs: number; max: number }): RateLimiter {
  const { windowMs, max } = options;
  const hits = new Map<string, number[]>();

  return {
    allow(key: string, now: number = Date.now()): boolean {
      const cutoff = now - windowMs;
      const recent = (hits.get(key) ?? []).filter((t) => t > cutoff);
      if (recent.length >= max) {
        hits.set(key, recent);
        return false;
      }
      recent.push(now);
      hits.set(key, recent);
      return true;
    },
  };
}

/** Client key for rate limiting: first hop of x-forwarded-for, or a shared
 * bucket when no address is available. */
export function clientKey(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  return forwarded?.split(",")[0]?.trim() || "unknown";
}
