import { describe, it, expect } from "vitest";
import {
  getStartOfWeek,
  isCurrentWeek,
  isOlderThanCurrentWeek,
  parseRelativeTs,
  resolveTimestamp,
} from "./dateHelpers";

describe("getStartOfWeek", () => {
  it("returns a date 7 days ago at midnight UTC", () => {
    const cutoff = getStartOfWeek();
    const now = new Date();
    const diffMs = now.getTime() - cutoff.getTime();
    const diffDays = diffMs / (1000 * 60 * 60 * 24);
    // Should be between 7 and 8 days ago (7 days + whatever time has passed today)
    expect(diffDays).toBeGreaterThanOrEqual(7);
    expect(diffDays).toBeLessThan(8);
    expect(cutoff.getUTCHours()).toBe(0);
    expect(cutoff.getUTCMinutes()).toBe(0);
  });
});

describe("isCurrentWeek", () => {
  it("returns true for null/undefined/empty timestamps", () => {
    expect(isCurrentWeek(null)).toBe(true);
    expect(isCurrentWeek(undefined)).toBe(true);
    expect(isCurrentWeek("")).toBe(true);
  });

  it("returns true for unparseable timestamps", () => {
    expect(isCurrentWeek("not a date")).toBe(true);
  });

  it("returns true for today's date", () => {
    expect(isCurrentWeek(new Date().toISOString())).toBe(true);
  });

  it("returns true for 3 days ago", () => {
    const d = new Date();
    d.setDate(d.getDate() - 3);
    expect(isCurrentWeek(d.toISOString())).toBe(true);
  });

  it("returns false for 30 days ago", () => {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    expect(isCurrentWeek(d.toISOString())).toBe(false);
  });
});

describe("isOlderThanCurrentWeek", () => {
  it("returns false for null/undefined/empty", () => {
    expect(isOlderThanCurrentWeek(null)).toBe(false);
    expect(isOlderThanCurrentWeek("")).toBe(false);
  });

  it("returns false for recent dates", () => {
    expect(isOlderThanCurrentWeek(new Date().toISOString())).toBe(false);
  });

  it("returns true for dates older than 7 days", () => {
    const d = new Date();
    d.setDate(d.getDate() - 14);
    expect(isOlderThanCurrentWeek(d.toISOString())).toBe(true);
  });
});

describe("parseRelativeTs", () => {
  it("returns null for empty/falsy input", () => {
    expect(parseRelativeTs("")).toBeNull();
  });

  it("parses 'just now'", () => {
    const result = parseRelativeTs("just now");
    expect(result).toBeTruthy();
    const d = new Date(result!);
    expect(Date.now() - d.getTime()).toBeLessThan(5000);
  });

  it("parses '2h' as ~2 hours ago", () => {
    const result = parseRelativeTs("2h");
    expect(result).toBeTruthy();
    const d = new Date(result!);
    const diffH = (Date.now() - d.getTime()) / (1000 * 60 * 60);
    expect(diffH).toBeGreaterThan(1.9);
    expect(diffH).toBeLessThan(2.1);
  });

  it("parses '3 days ago'", () => {
    const result = parseRelativeTs("3 days ago");
    expect(result).toBeTruthy();
    const d = new Date(result!);
    const diffD = (Date.now() - d.getTime()) / (1000 * 60 * 60 * 24);
    expect(diffD).toBeGreaterThan(2.9);
    expect(diffD).toBeLessThan(3.1);
  });

  it("parses '1w' as ~7 days ago", () => {
    const result = parseRelativeTs("1w");
    expect(result).toBeTruthy();
    const d = new Date(result!);
    const diffD = (Date.now() - d.getTime()) / (1000 * 60 * 60 * 24);
    expect(diffD).toBeGreaterThan(6.9);
    expect(diffD).toBeLessThan(7.1);
  });

  it("parses 'yesterday'", () => {
    const result = parseRelativeTs("yesterday");
    expect(result).toBeTruthy();
    const d = new Date(result!);
    const diffD = (Date.now() - d.getTime()) / (1000 * 60 * 60 * 24);
    expect(diffD).toBeGreaterThan(0.9);
    expect(diffD).toBeLessThan(1.1);
  });

  it("returns null for unrecognized strings", () => {
    expect(parseRelativeTs("some random text")).toBeNull();
  });
});

describe("resolveTimestamp", () => {
  it("returns empty string for empty input", () => {
    expect(resolveTimestamp("")).toBe("");
  });

  it("returns ISO strings as-is", () => {
    const iso = "2026-04-01T12:00:00.000Z";
    expect(resolveTimestamp(iso)).toBe(iso);
  });

  it("resolves relative timestamps", () => {
    const result = resolveTimestamp("2h");
    expect(result).toBeTruthy();
    expect(result).toMatch(/^\d{4}-/); // ISO format
  });

  it("returns empty for unparseable relative strings", () => {
    expect(resolveTimestamp("foobar")).toBe("");
  });
});
