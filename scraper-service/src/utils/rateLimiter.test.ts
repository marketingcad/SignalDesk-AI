import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { checkRateLimit, recordScrapeStart, getWaitTimeMs } from "./rateLimiter";

// We need to manipulate time for rate limiter tests
beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("checkRateLimit", () => {
  it("allows first scrape for any platform", () => {
    expect(checkRateLimit("Reddit")).toEqual({ allowed: true });
  });

  it("blocks rapid consecutive scrapes", () => {
    recordScrapeStart("Facebook");
    const result = checkRateLimit("Facebook");
    expect(result.allowed).toBe(false);
    if (!result.allowed) {
      expect(result.retryAfterMs).toBeGreaterThan(0);
    }
  });

  it("allows scrape after rate limit window passes", () => {
    recordScrapeStart("Reddit");
    // Reddit rate limit is 60000ms (1 min)
    vi.advanceTimersByTime(61000);
    expect(checkRateLimit("Reddit")).toEqual({ allowed: true });
  });

  it("tracks platforms independently", () => {
    // Advance past any prior rate limits from other tests
    vi.advanceTimersByTime(600000);
    recordScrapeStart("Facebook");
    // Facebook is rate limited, but X should be fine (never recorded in this test)
    expect(checkRateLimit("Other")).toEqual({ allowed: true });
  });
});

describe("getWaitTimeMs", () => {
  it("returns 0 when no prior scrape", () => {
    expect(getWaitTimeMs("X")).toBe(0);
  });

  it("returns remaining wait time after recent scrape", () => {
    recordScrapeStart("LinkedIn");
    vi.advanceTimersByTime(100000); // 100s into 300s (5min) window
    const wait = getWaitTimeMs("LinkedIn");
    expect(wait).toBeGreaterThan(0);
    expect(wait).toBeLessThanOrEqual(200000); // ~200s remaining
  });

  it("returns 0 after rate limit window expires", () => {
    recordScrapeStart("LinkedIn");
    vi.advanceTimersByTime(301000); // Past the 5min window
    expect(getWaitTimeMs("LinkedIn")).toBe(0);
  });
});
