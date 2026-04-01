import { config } from "../config";
import type { Platform } from "../types";

// ---------------------------------------------------------------------------
// Per-platform rate limiting
// Prevents burning session cookies by enforcing minimum gaps between scrapes
// for the same platform.
// ---------------------------------------------------------------------------

/** Timestamp of last scrape start per platform */
const lastScrapeAt = new Map<string, number>();

/**
 * Check whether a scrape for the given platform is allowed right now.
 * Returns `{ allowed: true }` or `{ allowed: false, retryAfterMs }`.
 */
export function checkRateLimit(platform: Platform): { allowed: true } | { allowed: false; retryAfterMs: number } {
  const minGap = config.platformRateLimitMs[platform] ?? 0;
  if (minGap <= 0) return { allowed: true };

  const last = lastScrapeAt.get(platform) ?? 0;
  const elapsed = Date.now() - last;

  if (elapsed < minGap) {
    return { allowed: false, retryAfterMs: minGap - elapsed };
  }

  return { allowed: true };
}

/** Record that a scrape just started for the given platform. */
export function recordScrapeStart(platform: Platform): void {
  lastScrapeAt.set(platform, Date.now());
}

/**
 * Get the number of milliseconds to wait before a scrape for the given
 * platform is allowed. Returns 0 if no wait is needed.
 */
export function getWaitTimeMs(platform: Platform): number {
  const minGap = config.platformRateLimitMs[platform] ?? 0;
  if (minGap <= 0) return 0;
  const last = lastScrapeAt.get(platform) ?? 0;
  const elapsed = Date.now() - last;
  return Math.max(0, minGap - elapsed);
}
