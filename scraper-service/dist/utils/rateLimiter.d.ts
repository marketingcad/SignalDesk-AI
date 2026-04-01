import type { Platform } from "../types";
/**
 * Check whether a scrape for the given platform is allowed right now.
 * Returns `{ allowed: true }` or `{ allowed: false, retryAfterMs }`.
 */
export declare function checkRateLimit(platform: Platform): {
    allowed: true;
} | {
    allowed: false;
    retryAfterMs: number;
};
/** Record that a scrape just started for the given platform. */
export declare function recordScrapeStart(platform: Platform): void;
/**
 * Get the number of milliseconds to wait before a scrape for the given
 * platform is allowed. Returns 0 if no wait is needed.
 */
export declare function getWaitTimeMs(platform: Platform): number;
