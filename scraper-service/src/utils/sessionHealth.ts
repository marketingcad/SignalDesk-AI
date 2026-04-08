import { config } from "../config";
import type { Platform } from "../types";

// ---------------------------------------------------------------------------
// Session Health Tracker
// Monitors consecutive zero-post runs per platform and tracks cookie
// validation results. When a platform exceeds the configured threshold
// of consecutive zero-post runs, it signals that cookies likely expired.
// ---------------------------------------------------------------------------

export type SessionStatus = "healthy" | "warning" | "expired";

export interface PlatformHealth {
  platform: Platform;
  consecutiveZeroRuns: number;
  lastRunAt: string | null;
  lastPostCount: number;
  status: SessionStatus;
  /** Last time cookies were validated (null = never checked) */
  lastValidatedAt: string | null;
  /** Result of the last cookie validation */
  lastValidationResult: "valid" | "expired" | "no_cookies" | null;
}

/** Platforms that require authentication (cookies) */
const AUTH_PLATFORMS: Platform[] = ["Facebook", "LinkedIn"];

/** In-memory health state per platform */
const healthState = new Map<Platform, PlatformHealth>();

function getOrCreate(platform: Platform): PlatformHealth {
  if (!healthState.has(platform)) {
    healthState.set(platform, {
      platform,
      consecutiveZeroRuns: 0,
      lastRunAt: null,
      lastPostCount: 0,
      status: "healthy",
      lastValidatedAt: null,
      lastValidationResult: null,
    });
  }
  return healthState.get(platform)!;
}

function resolveStatus(health: PlatformHealth): SessionStatus {
  // Cookie validation takes priority if recently checked
  if (health.lastValidationResult === "expired") return "expired";
  if (health.lastValidationResult === "no_cookies") return "expired";

  // Zero-post streak check
  if (health.consecutiveZeroRuns >= config.sessionHealthThreshold) return "expired";
  if (
    config.sessionHealthThreshold >= 3 &&
    health.consecutiveZeroRuns >= config.sessionHealthThreshold - 1
  ) return "warning";

  return "healthy";
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Report the result of a platform scrape run. Call this after every
 * scheduled or manual platform scrape to track zero-post streaks.
 *
 * Returns true if the platform just crossed the health threshold
 * (i.e. this is the run that should trigger an alert).
 */
export function reportRunResult(platform: Platform, postCount: number): boolean {
  const health = getOrCreate(platform);
  const prevZeroRuns = health.consecutiveZeroRuns;

  health.lastRunAt = new Date().toISOString();
  health.lastPostCount = postCount;

  if (postCount === 0) {
    health.consecutiveZeroRuns++;
  } else {
    health.consecutiveZeroRuns = 0;
  }

  health.status = resolveStatus(health);

  // Return true if we just hit the threshold (exact match = first alert)
  return (
    postCount === 0 &&
    health.consecutiveZeroRuns === config.sessionHealthThreshold &&
    prevZeroRuns < config.sessionHealthThreshold
  );
}

/**
 * Record the result of a cookie validation check.
 */
export function reportValidationResult(
  platform: Platform,
  result: "valid" | "expired" | "no_cookies"
): void {
  const health = getOrCreate(platform);
  health.lastValidatedAt = new Date().toISOString();
  health.lastValidationResult = result;

  // If cookies are valid, reset zero-run streak concern
  if (result === "valid") {
    health.status = resolveStatus(health);
  } else {
    health.status = "expired";
  }
}

/**
 * Get health status for a single platform.
 */
export function getPlatformHealth(platform: Platform): PlatformHealth {
  return { ...getOrCreate(platform) };
}

/**
 * Get health status for all auth-requiring platforms.
 */
export function getAllAuthHealth(): PlatformHealth[] {
  return AUTH_PLATFORMS.map((p) => getPlatformHealth(p));
}

/**
 * Get health status for all tracked platforms (including non-auth).
 */
export function getAllHealth(): PlatformHealth[] {
  const platforms: Platform[] = ["Reddit", "X", "LinkedIn", "Facebook"];
  return platforms.map((p) => getPlatformHealth(p));
}

/**
 * Returns the list of platforms that require cookie-based auth.
 */
export function getAuthPlatforms(): Platform[] {
  return [...AUTH_PLATFORMS];
}

/**
 * Reset health state for a platform (e.g., after re-login).
 */
export function resetHealth(platform: Platform): void {
  healthState.delete(platform);
}
