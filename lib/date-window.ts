// Date window resolution for lead ingestion.
//
// Every scraped post (scheduled or manual) is gated by a date window before it
// can become a lead and trigger a Discord alert. The window is driven by the
// user's "Date Range" setting (Settings page), with a default fallback.
//
// This module is the single source of truth for that logic so it can be unit
// tested independently of the Next.js route, Supabase, and the AI pipeline.

/** Shape of the `date_range_filter` setting stored in the `settings` table. */
export type DateRangeFilter = {
  enabled?: boolean;
  mode?: "today" | "range";
  startDate?: string;
  endDate?: string;
};

/** A resolved window. `null` on either bound means "unbounded on that side". */
export interface DateWindow {
  rangeStart: Date | null;
  rangeEnd: Date | null;
}

/** Verdict for a single post timestamp against a window. */
export type DateVerdict = "ok" | "too_old" | "too_new";

/** Default rolling window (days) used when no custom range is active. */
export const DEFAULT_WINDOW_DAYS = 7;

// ---------------------------------------------------------------------------
// Timezone helpers
//
// Day boundaries ("today", a custom range, the rolling default) are interpreted
// in a configurable timezone offset so that "Today" means the user's local day,
// not UTC. The offset is hours from UTC (e.g. 8 = Philippines UTC+8, -5 = US
// Eastern). Default 0 keeps pure-UTC behavior. All returned bounds are still
// absolute instants (Date), so post-timestamp comparison is unaffected.
// ---------------------------------------------------------------------------

const pad2 = (n: number) => String(n).padStart(2, "0");

/** ISO offset suffix for a given hours-from-UTC, e.g. 8 → "+08:00", -5 → "-05:00". */
function tzSuffix(offsetHours: number): string {
  const sign = offsetHours < 0 ? "-" : "+";
  const abs = Math.abs(offsetHours);
  const h = Math.floor(abs);
  const m = Math.round((abs - h) * 60);
  return `${sign}${pad2(h)}:${pad2(m)}`;
}

/** The Y-M-D calendar date that `instant` falls on, in the given offset. */
function localYMD(instant: Date, offsetHours: number): string {
  const shifted = new Date(instant.getTime() + offsetHours * 3_600_000);
  return `${shifted.getUTCFullYear()}-${pad2(shifted.getUTCMonth() + 1)}-${pad2(shifted.getUTCDate())}`;
}

/** Absolute instant for the start (00:00:00.000) of `ymd` in the given offset. */
function startOfDay(ymd: string, offsetHours: number): Date {
  return new Date(`${ymd}T00:00:00.000${tzSuffix(offsetHours)}`);
}

/** Absolute instant for the end (23:59:59.999) of `ymd` in the given offset. */
function endOfDay(ymd: string, offsetHours: number): Date {
  return new Date(`${ymd}T23:59:59.999${tzSuffix(offsetHours)}`);
}

/**
 * Resolve the active date window from the user's setting.
 *
 * Precedence:
 *  1. enabled + mode "today"          → today only, auto-adapts to `now`
 *  2. enabled + mode "range" w/ dates → fixed [startDate 00:00, endDate 23:59]
 *  3. anything else (disabled, no dates, unknown mode) → rolling default window
 *
 * All day boundaries are interpreted in `offsetHours` (hours from UTC) so that
 * "today" / a custom date means the user's local day. Default 0 = UTC.
 *
 * @param filter      The stored setting (may be null/undefined/partial).
 * @param now         Reference time — inject in tests for determinism.
 * @param offsetHours Timezone offset in hours from UTC (e.g. 8 for PH). Default 0.
 */
export function resolveDateWindow(
  filter: DateRangeFilter | null | undefined,
  now: Date = new Date(),
  offsetHours = 0
): DateWindow {
  // 1. Current-day only — auto-adapts to the local "today"
  if (filter?.enabled && filter.mode === "today") {
    const today = localYMD(now, offsetHours);
    return { rangeStart: startOfDay(today, offsetHours), rangeEnd: endOfDay(today, offsetHours) };
  }

  // 2. Custom fixed range — needs at least one bound
  if (filter?.enabled && (filter.startDate || filter.endDate)) {
    return {
      rangeStart: filter.startDate ? startOfDay(filter.startDate, offsetHours) : null,
      rangeEnd: filter.endDate ? endOfDay(filter.endDate, offsetHours) : null,
    };
  }

  // 3. Default rolling N-day window (open-ended into the future)
  const back = new Date(now.getTime() + offsetHours * 3_600_000);
  back.setUTCDate(back.getUTCDate() - DEFAULT_WINDOW_DAYS);
  const startYMD = `${back.getUTCFullYear()}-${pad2(back.getUTCMonth() + 1)}-${pad2(back.getUTCDate())}`;
  return { rangeStart: startOfDay(startYMD, offsetHours), rangeEnd: null };
}

/**
 * Classify a post timestamp against a resolved window.
 *
 * Posts with a missing or unparseable timestamp are allowed through ("ok"),
 * matching the ingestion route: we never drop a post just because we couldn't
 * read its date.
 */
export function classifyPostDate(
  timestamp: string | null | undefined,
  window: DateWindow
): DateVerdict {
  if (!timestamp) return "ok";

  const postDate = new Date(timestamp);
  if (isNaN(postDate.getTime())) return "ok";

  if (window.rangeStart && postDate < window.rangeStart) return "too_old";
  if (window.rangeEnd && postDate > window.rangeEnd) return "too_new";
  return "ok";
}

/** Convenience predicate: does this timestamp pass the window? */
export function isWithinDateWindow(
  timestamp: string | null | undefined,
  window: DateWindow
): boolean {
  return classifyPostDate(timestamp, window) === "ok";
}
