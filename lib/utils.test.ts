import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { formatNumber, timeAgo, getIntentColor, getPlatformColor } from "./utils";

describe("formatNumber", () => {
  it("returns number as-is below 1000", () => {
    expect(formatNumber(0)).toBe("0");
    expect(formatNumber(1)).toBe("1");
    expect(formatNumber(999)).toBe("999");
  });

  it("formats thousands with k suffix", () => {
    expect(formatNumber(1000)).toBe("1.0k");
    expect(formatNumber(1234)).toBe("1.2k");
    expect(formatNumber(5678)).toBe("5.7k");
    expect(formatNumber(10000)).toBe("10.0k");
  });

  it("handles negative numbers", () => {
    expect(formatNumber(-5)).toBe("-5");
  });
});

describe("timeAgo", () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it("returns 'Just now' for less than 1 minute", () => {
    const now = new Date("2026-04-10T12:00:00Z");
    vi.setSystemTime(now);
    expect(timeAgo(new Date("2026-04-10T11:59:30Z"))).toBe("Just now");
  });

  it("returns minutes ago", () => {
    const now = new Date("2026-04-10T12:00:00Z");
    vi.setSystemTime(now);
    expect(timeAgo(new Date("2026-04-10T11:55:00Z"))).toBe("5m ago");
    expect(timeAgo(new Date("2026-04-10T11:30:00Z"))).toBe("30m ago");
  });

  it("returns hours ago", () => {
    const now = new Date("2026-04-10T12:00:00Z");
    vi.setSystemTime(now);
    expect(timeAgo(new Date("2026-04-10T09:00:00Z"))).toBe("3h ago");
  });

  it("returns days ago", () => {
    const now = new Date("2026-04-10T12:00:00Z");
    vi.setSystemTime(now);
    expect(timeAgo(new Date("2026-04-08T12:00:00Z"))).toBe("2d ago");
  });

  it("accepts string dates", () => {
    const now = new Date("2026-04-10T12:00:00Z");
    vi.setSystemTime(now);
    expect(timeAgo("2026-04-10T11:00:00Z")).toBe("1h ago");
  });
});

describe("getIntentColor", () => {
  it("returns High config for score >= 80", () => {
    expect(getIntentColor(80).label).toBe("High");
    expect(getIntentColor(100).label).toBe("High");
    expect(getIntentColor(95).text).toContain("emerald");
  });

  it("returns Medium config for 50-79", () => {
    expect(getIntentColor(50).label).toBe("Medium");
    expect(getIntentColor(79).label).toBe("Medium");
    expect(getIntentColor(65).text).toContain("amber");
  });

  it("returns Low config for < 50", () => {
    expect(getIntentColor(0).label).toBe("Low");
    expect(getIntentColor(49).label).toBe("Low");
    expect(getIntentColor(25).text).toContain("zinc");
  });
});

describe("getPlatformColor", () => {
  it("returns correct colors for known platforms", () => {
    expect(getPlatformColor("Facebook")).toBe("#1877F2");
    expect(getPlatformColor("LinkedIn")).toBe("#0A66C2");
    expect(getPlatformColor("Reddit")).toBe("#FF4500");
    expect(getPlatformColor("X")).toBe("#a1a1aa");
  });

  it("returns default color for unknown platforms", () => {
    expect(getPlatformColor("TikTok")).toBe("#71717a");
    expect(getPlatformColor("Other")).toBe("#71717a");
  });
});
