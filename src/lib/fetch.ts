/**
 * Shared fetch utilities — in-memory cache + retry.
 * Drop-in replacement for fetch() in all API modules.
 */

// ── In-memory cache ───────────────────────────────────────────────

interface CacheEntry {
  data: unknown;
  timestamp: number;
}

const cache = new Map<string, CacheEntry>();

// Default TTLs (milliseconds)
export const TTL = {
  SHORT: 1 * 60 * 60 * 1000,   // 1 hour  — schedules, scoreboards
  MEDIUM: 3 * 60 * 60 * 1000,  // 3 hours — player stats, game logs
  LONG: 6 * 60 * 60 * 1000,    // 6 hours — team records, season stats
} as const;

function getCached(key: string, ttl: number): unknown | null {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.timestamp > ttl) {
    cache.delete(key);
    return null;
  }
  return entry.data;
}

function setCache(key: string, data: unknown): void {
  // Cap cache at 500 entries to avoid unbounded memory growth
  if (cache.size > 500) {
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }
  cache.set(key, { data, timestamp: Date.now() });
}

// ── Retry logic ───────────────────────────────────────────────────

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Fetch with retry. Returns Response (caller parses JSON).
 * Retries on network errors and 5xx responses. Does NOT retry 4xx.
 */
export async function fetchWithRetry(
  url: string,
  options?: RequestInit,
  retries: number = 1,
  delayMs: number = 2000
): Promise<Response> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, options);
      // Don't retry client errors (4xx) — only server errors
      if (res.ok || (res.status >= 400 && res.status < 500)) {
        return res;
      }
      // 5xx — worth retrying
      if (attempt < retries) {
        console.log(`[fetch] ${res.status} on ${url.slice(0, 80)}… retrying in ${delayMs}ms`);
        await sleep(delayMs);
        continue;
      }
      return res; // Return the bad response on final attempt
    } catch (err) {
      lastError = err;
      if (attempt < retries) {
        console.log(`[fetch] Network error on ${url.slice(0, 80)}… retrying in ${delayMs}ms`);
        await sleep(delayMs);
      }
    }
  }
  throw lastError;
}

// ── Combined: cached fetch with retry ─────────────────────────────

/**
 * Fetch JSON with in-memory caching and retry.
 * Returns parsed JSON or null on failure.
 */
export async function cachedFetch<T = unknown>(
  url: string,
  ttl: number = TTL.MEDIUM,
  options?: RequestInit
): Promise<T | null> {
  // Check cache first
  const cached = getCached(url, ttl);
  if (cached !== null) return cached as T;

  try {
    const res = await fetchWithRetry(url, options);
    if (!res.ok) return null;
    const data = await res.json();
    setCache(url, data);
    return data as T;
  } catch {
    return null;
  }
}

/**
 * Same as cachedFetch but returns an empty array on failure.
 * Convenient for endpoints that return lists.
 */
export async function cachedFetchArray<T = unknown>(
  url: string,
  ttl: number = TTL.MEDIUM,
  options?: RequestInit
): Promise<T[]> {
  const result = await cachedFetch<T[]>(url, ttl, options);
  return result ?? [];
}
