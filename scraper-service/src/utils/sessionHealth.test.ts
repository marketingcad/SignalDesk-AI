import { describe, it, expect, beforeEach } from "vitest";
import {
  reportRunResult,
  reportValidationResult,
  getPlatformHealth,
  getAllHealth,
  getAllAuthHealth,
  resetHealth,
} from "./sessionHealth";

beforeEach(() => {
  // Reset all platforms before each test
  resetHealth("Facebook");
  resetHealth("LinkedIn");
  resetHealth("Reddit");
  resetHealth("X");
});

describe("reportRunResult", () => {
  it("tracks consecutive zero-post runs", () => {
    reportRunResult("Facebook", 0);
    reportRunResult("Facebook", 0);
    expect(getPlatformHealth("Facebook").consecutiveZeroRuns).toBe(2);
  });

  it("resets streak when posts are found", () => {
    reportRunResult("Facebook", 0);
    reportRunResult("Facebook", 0);
    reportRunResult("Facebook", 5);
    expect(getPlatformHealth("Facebook").consecutiveZeroRuns).toBe(0);
  });

  it("returns true when threshold is crossed (default 3)", () => {
    expect(reportRunResult("Facebook", 0)).toBe(false); // 1
    expect(reportRunResult("Facebook", 0)).toBe(false); // 2
    expect(reportRunResult("Facebook", 0)).toBe(true);  // 3 = threshold
  });

  it("returns false after threshold already crossed", () => {
    reportRunResult("Facebook", 0); // 1
    reportRunResult("Facebook", 0); // 2
    reportRunResult("Facebook", 0); // 3 — triggers
    expect(reportRunResult("Facebook", 0)).toBe(false); // 4 — already past
  });

  it("sets status to expired at threshold", () => {
    reportRunResult("Facebook", 0);
    reportRunResult("Facebook", 0);
    reportRunResult("Facebook", 0);
    expect(getPlatformHealth("Facebook").status).toBe("expired");
  });

  it("updates lastRunAt and lastPostCount", () => {
    reportRunResult("LinkedIn", 7);
    const health = getPlatformHealth("LinkedIn");
    expect(health.lastRunAt).toBeTruthy();
    expect(health.lastPostCount).toBe(7);
  });

  it("tracks platforms independently", () => {
    reportRunResult("Facebook", 0);
    reportRunResult("Facebook", 0);
    reportRunResult("LinkedIn", 5);
    expect(getPlatformHealth("Facebook").consecutiveZeroRuns).toBe(2);
    expect(getPlatformHealth("LinkedIn").consecutiveZeroRuns).toBe(0);
  });
});

describe("reportValidationResult", () => {
  it("marks platform expired on 'expired' result", () => {
    reportValidationResult("Facebook", "expired");
    const health = getPlatformHealth("Facebook");
    expect(health.status).toBe("expired");
    expect(health.lastValidationResult).toBe("expired");
    expect(health.lastValidatedAt).toBeTruthy();
  });

  it("marks platform expired on 'no_cookies' result", () => {
    reportValidationResult("LinkedIn", "no_cookies");
    expect(getPlatformHealth("LinkedIn").status).toBe("expired");
  });

  it("keeps healthy status on 'valid' result", () => {
    reportValidationResult("Facebook", "valid");
    expect(getPlatformHealth("Facebook").status).toBe("healthy");
  });

  it("valid cookies with zero runs still shows warning from zero-run streak", () => {
    reportRunResult("Facebook", 0);
    reportRunResult("Facebook", 0);
    reportValidationResult("Facebook", "valid");
    // Cookie validation is valid, but 2 consecutive zero-runs still triggers warning
    // (zero-run streak is independent of cookie validity — could be a content issue)
    const health = getPlatformHealth("Facebook");
    expect(health.lastValidationResult).toBe("valid");
    expect(health.consecutiveZeroRuns).toBe(2);
  });
});

describe("resetHealth", () => {
  it("resets a platform back to default state", () => {
    reportRunResult("Facebook", 0);
    reportRunResult("Facebook", 0);
    reportRunResult("Facebook", 0);
    resetHealth("Facebook");
    const health = getPlatformHealth("Facebook");
    expect(health.consecutiveZeroRuns).toBe(0);
    expect(health.status).toBe("healthy");
    expect(health.lastRunAt).toBeNull();
  });
});

describe("getAllHealth / getAllAuthHealth", () => {
  it("getAllHealth returns all 4 platforms", () => {
    const health = getAllHealth();
    expect(health).toHaveLength(4);
    const platforms = health.map((h) => h.platform);
    expect(platforms).toContain("Reddit");
    expect(platforms).toContain("X");
    expect(platforms).toContain("LinkedIn");
    expect(platforms).toContain("Facebook");
  });

  it("getAllAuthHealth returns only Facebook and LinkedIn", () => {
    const health = getAllAuthHealth();
    expect(health).toHaveLength(2);
    const platforms = health.map((h) => h.platform);
    expect(platforms).toContain("Facebook");
    expect(platforms).toContain("LinkedIn");
  });
});
