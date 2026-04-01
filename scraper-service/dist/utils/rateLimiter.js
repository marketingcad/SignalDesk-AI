"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.checkRateLimit = checkRateLimit;
exports.recordScrapeStart = recordScrapeStart;
exports.getWaitTimeMs = getWaitTimeMs;
const config_1 = require("../config");
// ---------------------------------------------------------------------------
// Per-platform rate limiting
// Prevents burning session cookies by enforcing minimum gaps between scrapes
// for the same platform.
// ---------------------------------------------------------------------------
/** Timestamp of last scrape start per platform */
const lastScrapeAt = new Map();
/**
 * Check whether a scrape for the given platform is allowed right now.
 * Returns `{ allowed: true }` or `{ allowed: false, retryAfterMs }`.
 */
function checkRateLimit(platform) {
    const minGap = config_1.config.platformRateLimitMs[platform] ?? 0;
    if (minGap <= 0)
        return { allowed: true };
    const last = lastScrapeAt.get(platform) ?? 0;
    const elapsed = Date.now() - last;
    if (elapsed < minGap) {
        return { allowed: false, retryAfterMs: minGap - elapsed };
    }
    return { allowed: true };
}
/** Record that a scrape just started for the given platform. */
function recordScrapeStart(platform) {
    lastScrapeAt.set(platform, Date.now());
}
/**
 * Get the number of milliseconds to wait before a scrape for the given
 * platform is allowed. Returns 0 if no wait is needed.
 */
function getWaitTimeMs(platform) {
    const minGap = config_1.config.platformRateLimitMs[platform] ?? 0;
    if (minGap <= 0)
        return 0;
    const last = lastScrapeAt.get(platform) ?? 0;
    const elapsed = Date.now() - last;
    return Math.max(0, minGap - elapsed);
}
//# sourceMappingURL=rateLimiter.js.map