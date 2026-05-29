import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  resolveDateWindow,
  classifyPostDate,
  isWithinDateWindow,
  DEFAULT_WINDOW_DAYS,
  type DateRangeFilter,
} from "./date-window";

// Fixed reference "now" for deterministic tests: 2026-05-30T14:30:00Z
const NOW = new Date("2026-05-30T14:30:00Z");

describe("resolveDateWindow", () => {
  describe("default rolling window (filter disabled / absent)", () => {
    it("returns a 7-day-back start and open end when filter is undefined", () => {
      const { rangeStart, rangeEnd } = resolveDateWindow(undefined, NOW);
      expect(rangeStart?.toISOString()).toBe("2026-05-23T00:00:00.000Z");
      expect(rangeEnd).toBeNull();
    });

    it("returns the default window when filter is null", () => {
      const { rangeStart, rangeEnd } = resolveDateWindow(null, NOW);
      expect(rangeStart?.toISOString()).toBe("2026-05-23T00:00:00.000Z");
      expect(rangeEnd).toBeNull();
    });

    it("returns the default window when enabled is false (even if dates set)", () => {
      const filter: DateRangeFilter = {
        enabled: false,
        mode: "range",
        startDate: "2026-01-01",
        endDate: "2026-01-31",
      };
      const { rangeStart, rangeEnd } = resolveDateWindow(filter, NOW);
      expect(rangeStart?.toISOString()).toBe("2026-05-23T00:00:00.000Z");
      expect(rangeEnd).toBeNull();
    });

    it("uses DEFAULT_WINDOW_DAYS for the look-back", () => {
      const { rangeStart } = resolveDateWindow(undefined, NOW);
      const expected = new Date(NOW);
      expected.setUTCDate(expected.getUTCDate() - DEFAULT_WINDOW_DAYS);
      expected.setUTCHours(0, 0, 0, 0);
      expect(rangeStart?.toISOString()).toBe(expected.toISOString());
    });

    it("falls back to default when enabled but mode is 'range' with no dates", () => {
      const filter: DateRangeFilter = { enabled: true, mode: "range", startDate: "", endDate: "" };
      const { rangeStart, rangeEnd } = resolveDateWindow(filter, NOW);
      expect(rangeStart?.toISOString()).toBe("2026-05-23T00:00:00.000Z");
      expect(rangeEnd).toBeNull();
    });
  });

  describe("today mode (auto-adapting)", () => {
    it("returns today's UTC start and end of day", () => {
      const filter: DateRangeFilter = { enabled: true, mode: "today" };
      const { rangeStart, rangeEnd } = resolveDateWindow(filter, NOW);
      expect(rangeStart?.toISOString()).toBe("2026-05-30T00:00:00.000Z");
      expect(rangeEnd?.toISOString()).toBe("2026-05-30T23:59:59.999Z");
    });

    it("ignores any startDate/endDate when mode is 'today'", () => {
      const filter: DateRangeFilter = {
        enabled: true,
        mode: "today",
        startDate: "2020-01-01",
        endDate: "2020-12-31",
      };
      const { rangeStart, rangeEnd } = resolveDateWindow(filter, NOW);
      expect(rangeStart?.toISOString()).toBe("2026-05-30T00:00:00.000Z");
      expect(rangeEnd?.toISOString()).toBe("2026-05-30T23:59:59.999Z");
    });

    it("auto-adapts to a different reference day", () => {
      const filter: DateRangeFilter = { enabled: true, mode: "today" };
      const otherDay = new Date("2026-12-25T08:00:00Z");
      const { rangeStart, rangeEnd } = resolveDateWindow(filter, otherDay);
      expect(rangeStart?.toISOString()).toBe("2026-12-25T00:00:00.000Z");
      expect(rangeEnd?.toISOString()).toBe("2026-12-25T23:59:59.999Z");
    });

    it("defaults to system time when `now` is omitted", () => {
      vi.useFakeTimers();
      vi.setSystemTime(NOW);
      const { rangeStart, rangeEnd } = resolveDateWindow({ enabled: true, mode: "today" });
      expect(rangeStart?.toISOString()).toBe("2026-05-30T00:00:00.000Z");
      expect(rangeEnd?.toISOString()).toBe("2026-05-30T23:59:59.999Z");
      vi.useRealTimers();
    });
  });

  describe("custom range mode", () => {
    it("returns start-of-day and end-of-day bounds for both dates", () => {
      const filter: DateRangeFilter = {
        enabled: true,
        mode: "range",
        startDate: "2026-05-01",
        endDate: "2026-05-15",
      };
      const { rangeStart, rangeEnd } = resolveDateWindow(filter, NOW);
      expect(rangeStart?.toISOString()).toBe("2026-05-01T00:00:00.000Z");
      expect(rangeEnd?.toISOString()).toBe("2026-05-15T23:59:59.999Z");
    });

    it("supports a start-only range (open-ended end)", () => {
      const filter: DateRangeFilter = { enabled: true, mode: "range", startDate: "2026-05-01" };
      const { rangeStart, rangeEnd } = resolveDateWindow(filter, NOW);
      expect(rangeStart?.toISOString()).toBe("2026-05-01T00:00:00.000Z");
      expect(rangeEnd).toBeNull();
    });

    it("supports an end-only range (open-ended start)", () => {
      const filter: DateRangeFilter = { enabled: true, mode: "range", endDate: "2026-05-15" };
      const { rangeStart, rangeEnd } = resolveDateWindow(filter, NOW);
      expect(rangeStart).toBeNull();
      expect(rangeEnd?.toISOString()).toBe("2026-05-15T23:59:59.999Z");
    });

    it("treats a missing mode with dates as a custom range", () => {
      // mode omitted but enabled with dates → precedence falls to the range branch
      const filter: DateRangeFilter = { enabled: true, startDate: "2026-05-01", endDate: "2026-05-15" };
      const { rangeStart, rangeEnd } = resolveDateWindow(filter, NOW);
      expect(rangeStart?.toISOString()).toBe("2026-05-01T00:00:00.000Z");
      expect(rangeEnd?.toISOString()).toBe("2026-05-15T23:59:59.999Z");
    });
  });
});

describe("classifyPostDate", () => {
  const todayWindow = resolveDateWindow({ enabled: true, mode: "today" }, NOW);
  const rangeWindow = resolveDateWindow(
    { enabled: true, mode: "range", startDate: "2026-05-01", endDate: "2026-05-15" },
    NOW
  );
  const defaultWindow = resolveDateWindow(undefined, NOW);

  describe("missing / unparseable timestamps pass through", () => {
    it("returns 'ok' for undefined timestamp", () => {
      expect(classifyPostDate(undefined, todayWindow)).toBe("ok");
    });

    it("returns 'ok' for null timestamp", () => {
      expect(classifyPostDate(null, todayWindow)).toBe("ok");
    });

    it("returns 'ok' for empty string", () => {
      expect(classifyPostDate("", todayWindow)).toBe("ok");
    });

    it("returns 'ok' for an unparseable date string", () => {
      expect(classifyPostDate("not-a-date", rangeWindow)).toBe("ok");
    });
  });

  describe("today window", () => {
    it("accepts a post from earlier today", () => {
      expect(classifyPostDate("2026-05-30T02:00:00Z", todayWindow)).toBe("ok");
    });

    it("accepts a post at the very start of today", () => {
      expect(classifyPostDate("2026-05-30T00:00:00.000Z", todayWindow)).toBe("ok");
    });

    it("accepts a post at the very end of today", () => {
      expect(classifyPostDate("2026-05-30T23:59:59.999Z", todayWindow)).toBe("ok");
    });

    it("rejects yesterday's post as too_old", () => {
      expect(classifyPostDate("2026-05-29T23:59:59Z", todayWindow)).toBe("too_old");
    });

    it("rejects tomorrow's post as too_new", () => {
      expect(classifyPostDate("2026-05-31T00:00:00Z", todayWindow)).toBe("too_new");
    });
  });

  describe("custom range window", () => {
    it("accepts a post inside the range", () => {
      expect(classifyPostDate("2026-05-10T12:00:00Z", rangeWindow)).toBe("ok");
    });

    it("accepts a post on the start boundary", () => {
      expect(classifyPostDate("2026-05-01T00:00:00Z", rangeWindow)).toBe("ok");
    });

    it("accepts a post on the end boundary (end of day)", () => {
      expect(classifyPostDate("2026-05-15T23:59:59Z", rangeWindow)).toBe("ok");
    });

    it("rejects a post before the start as too_old", () => {
      expect(classifyPostDate("2026-04-30T23:59:59Z", rangeWindow)).toBe("too_old");
    });

    it("rejects a post after the end as too_new", () => {
      expect(classifyPostDate("2026-05-16T00:00:00Z", rangeWindow)).toBe("too_new");
    });
  });

  describe("default window (open-ended end)", () => {
    it("accepts a recent post", () => {
      expect(classifyPostDate("2026-05-28T12:00:00Z", defaultWindow)).toBe("ok");
    });

    it("accepts a future post (no upper bound)", () => {
      expect(classifyPostDate("2027-01-01T00:00:00Z", defaultWindow)).toBe("ok");
    });

    it("rejects a post older than 7 days as too_old", () => {
      expect(classifyPostDate("2026-05-22T12:00:00Z", defaultWindow)).toBe("too_old");
    });
  });
});

describe("isWithinDateWindow", () => {
  const rangeWindow = resolveDateWindow(
    { enabled: true, mode: "range", startDate: "2026-05-01", endDate: "2026-05-15" },
    NOW
  );

  it("is true for an in-range post", () => {
    expect(isWithinDateWindow("2026-05-10T00:00:00Z", rangeWindow)).toBe(true);
  });

  it("is false for an out-of-range post", () => {
    expect(isWithinDateWindow("2026-06-01T00:00:00Z", rangeWindow)).toBe(false);
  });

  it("is true for a missing timestamp", () => {
    expect(isWithinDateWindow(undefined, rangeWindow)).toBe(true);
  });
});

describe("end-to-end: scheduled scraping scenarios", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("a daily run with 'today only' keeps just today's posts", () => {
    const window = resolveDateWindow({ enabled: true, mode: "today" });
    const scraped = [
      "2026-05-30T09:00:00Z", // today  → keep
      "2026-05-30T22:00:00Z", // today  → keep
      "2026-05-29T09:00:00Z", // yesterday → drop
      "2026-05-23T09:00:00Z", // last week → drop
    ];
    const kept = scraped.filter((ts) => isWithinDateWindow(ts, window));
    expect(kept).toEqual(["2026-05-30T09:00:00Z", "2026-05-30T22:00:00Z"]);
  });

  it("the same 'today only' setting auto-adapts on the next day's run", () => {
    // Simulate the run happening a day later — no setting change needed.
    vi.setSystemTime(new Date("2026-05-31T06:00:00Z"));
    const window = resolveDateWindow({ enabled: true, mode: "today" });
    expect(isWithinDateWindow("2026-05-31T01:00:00Z", window)).toBe(true);
    expect(isWithinDateWindow("2026-05-30T23:00:00Z", window)).toBe(false);
  });

  it("with no date filter, a run keeps the rolling 7-day window", () => {
    const window = resolveDateWindow(undefined);
    expect(isWithinDateWindow("2026-05-25T00:00:00Z", window)).toBe(true);
    expect(isWithinDateWindow("2026-05-20T00:00:00Z", window)).toBe(false);
  });
});
