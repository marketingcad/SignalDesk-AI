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

/**
 * Resolve the active date window from the user's setting.
 *
 * Precedence:
 *  1. enabled + mode "today"          → today only (UTC), auto-adapts to `now`
 *  2. enabled + mode "range" w/ dates → fixed [startDate 00:00, endDate 23:59] UTC
 *  3. anything else (disabled, no dates, unknown mode) → rolling default window
 *
 * @param filter The stored setting (may be null/undefined/partial).
 * @param now    Reference time — inject in tests for determinism.
 */
export function resolveDateWindow(
  filter: DateRangeFilter | null | undefined,
  now: Date = new Date()
): DateWindow {
  // 1. Current-day only — auto-adapts to today (UTC)
  if (filter?.enabled && filter.mode === "today") {
    const rangeStart = new Date(now);
    rangeStart.setUTCHours(0, 0, 0, 0);
    const rangeEnd = new Date(now);
    rangeEnd.setUTCHours(23, 59, 59, 999);
    return { rangeStart, rangeEnd };
  }

  // 2. Custom fixed range — needs at least one bound
  if (filter?.enabled && (filter.startDate || filter.endDate)) {
    let rangeStart: Date | null = null;
    let rangeEnd: Date | null = null;
    if (filter.startDate) {
      rangeStart = new Date(filter.startDate);
      rangeStart.setUTCHours(0, 0, 0, 0);
    }
    if (filter.endDate) {
      rangeEnd = new Date(filter.endDate);
      rangeEnd.setUTCHours(23, 59, 59, 999);
    }
    return { rangeStart, rangeEnd };
  }

  // 3. Default rolling N-day window (open-ended into the future)
  const rangeStart = new Date(now);
  rangeStart.setUTCDate(rangeStart.getUTCDate() - DEFAULT_WINDOW_DAYS);
  rangeStart.setUTCHours(0, 0, 0, 0);
  return { rangeStart, rangeEnd: null };
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
