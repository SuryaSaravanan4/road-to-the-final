import { prisma } from "./db";

export interface CacheResult<T> {
  data: T;
  cachedAt: Date;
  /** True if the underlying fetch failed and this is a stale fallback. */
  stale: boolean;
}

// The cache is an optimization, not a dependency: if the store can't be read
// or written (unreachable db, connection limit), callers should degrade to
// "always fetch fresh" instead of failing the whole request. The CacheEntry
// table itself is created by `prisma migrate deploy` in the build step.
async function readEntry(key: string) {
  try {
    return await prisma.cacheEntry.findUnique({ where: { key } });
  } catch {
    return null;
  }
}

async function writeEntry(key: string, payload: string, fetchedAt: Date): Promise<void> {
  try {
    await prisma.cacheEntry.upsert({
      where: { key },
      create: { key, payload, fetchedAt },
      update: { payload, fetchedAt },
    });
  } catch {
    // Best-effort: failing to persist shouldn't fail the request.
  }
}

// Collapses concurrent callers for the same key onto a single in-flight
// fetch. Without this, N requests arriving after the TTL expires (e.g. a
// burst of visitors, or standings+fixtures both expiring at once) would each
// independently call `fetcher`, and football-data.org's free tier allows
// only 10 requests/minute.
const inFlight = new Map<string, Promise<CacheResult<unknown>>>();

/**
 * Returns cached data for `key` if it's younger than `ttlMs`, otherwise calls
 * `fetcher` and caches the result. If `fetcher` throws and a stale cache
 * entry exists, the stale entry is returned instead of propagating the
 * error — this is what lets the UI show "stale data" instead of a hard
 * failure when the upstream API is rate-limited or down.
 */
export async function getCached<T>(
  key: string,
  ttlMs: number,
  fetcher: () => Promise<T>
): Promise<CacheResult<T>> {
  const existing = await readEntry(key);

  if (existing && Date.now() - existing.fetchedAt.getTime() < ttlMs) {
    return { data: JSON.parse(existing.payload) as T, cachedAt: existing.fetchedAt, stale: false };
  }

  const pending = inFlight.get(key);
  if (pending) return pending as Promise<CacheResult<T>>;

  const run = (async (): Promise<CacheResult<T>> => {
    try {
      const data = await fetcher();
      const fetchedAt = new Date();
      await writeEntry(key, JSON.stringify(data), fetchedAt);
      return { data, cachedAt: fetchedAt, stale: false };
    } catch (err) {
      if (existing) {
        return { data: JSON.parse(existing.payload) as T, cachedAt: existing.fetchedAt, stale: true };
      }
      throw err;
    } finally {
      inFlight.delete(key);
    }
  })();

  inFlight.set(key, run);
  return run;
}
