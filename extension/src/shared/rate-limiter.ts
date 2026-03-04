import type { Platform } from "../types";

// ---------------------------------------------------------------------------
// Per-platform rate limiter — caps posts processed per minute
// ---------------------------------------------------------------------------

const PLATFORM_LIMITS: Record<Platform, number> = {
  Facebook: 60,
  LinkedIn: 40,
  Reddit: 80,
  X: 50,
};

const WINDOW_MS = 60_000;

const scanCounts = new Map<Platform, number>();
let windowStart = Date.now();

/** Returns true if the platform has capacity, false if rate limit hit. */
export function canProcess(platform: Platform): boolean {
  const now = Date.now();

  // Reset window every minute
  if (now - windowStart > WINDOW_MS) {
    scanCounts.clear();
    windowStart = now;
  }

  const limit = PLATFORM_LIMITS[platform];
  const count = scanCounts.get(platform) || 0;

  if (count >= limit) {
    console.warn(
      `[RateLimiter] ${platform} limit reached (${count}/${limit}/min) — throttling`
    );
    return false;
  }

  scanCounts.set(platform, count + 1);
  return true;
}
