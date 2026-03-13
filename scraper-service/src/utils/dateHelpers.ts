// ---------------------------------------------------------------------------
// Shared date helpers — filter posts to current week only
// Used by all scrapers (urlScraper, platform scrapers)
// ---------------------------------------------------------------------------

/**
 * Get the start of the current week (Monday 00:00:00 UTC).
 */
export function getStartOfWeek(): Date {
  const now = new Date();
  const day = now.getUTCDay(); // 0=Sun, 1=Mon, ..., 6=Sat
  const diffToMonday = day === 0 ? 6 : day - 1;
  const monday = new Date(now);
  monday.setUTCDate(monday.getUTCDate() - diffToMonday);
  monday.setUTCHours(0, 0, 0, 0);
  return monday;
}

/**
 * Check if a timestamp string falls within the current week (since Monday).
 * Returns true if:
 *  - timestamp is null/undefined/empty (keep posts with no date — don't discard valid leads)
 *  - timestamp is unparseable (keep)
 *  - timestamp is >= start of current week
 */
export function isCurrentWeek(ts: string | null | undefined): boolean {
  if (!ts) return true; // no date found → keep post
  const d = new Date(ts);
  if (isNaN(d.getTime())) return true; // unparseable → keep
  return d >= getStartOfWeek();
}

/**
 * Check if a timestamp is OLDER than the current week.
 * Used for early-stop logic: when we detect a post older than this week,
 * we can stop scrolling because subsequent posts will be even older.
 * Returns false if timestamp is missing/unparseable (we can't be sure it's old).
 */
export function isOlderThanCurrentWeek(ts: string | null | undefined): boolean {
  if (!ts) return false; // can't determine → don't trigger early stop
  const d = new Date(ts);
  if (isNaN(d.getTime())) return false;
  return d < getStartOfWeek();
}

/**
 * Parse relative time strings ("2h", "3 days ago", "1w", "just now") → ISO string.
 * Returns null if the string can't be parsed.
 */
export function parseRelativeTs(text: string): string | null {
  if (!text) return null;
  const now = new Date();
  const s = text.toLowerCase().trim();
  if (/^(just now|now|moment|seconds? ago)/.test(s)) return now.toISOString();
  if (s === "yesterday") {
    const d = new Date(now);
    d.setDate(d.getDate() - 1);
    return d.toISOString();
  }
  const m = s.match(/(\d+)\s*(s(?:ec)?|m(?:in)?(?!o)|h(?:r|our)?|d(?:ay)?|w(?:k|eek)?|mo(?:nth)?|y(?:r|ear)?)/);
  if (!m) return null;
  const n = parseInt(m[1]);
  const unit = m[2];
  const d = new Date(now);
  if (/^s/.test(unit))       d.setSeconds(d.getSeconds() - n);
  else if (/^m/.test(unit))  d.setMinutes(d.getMinutes() - n);
  else if (/^h/.test(unit))  d.setHours(d.getHours() - n);
  else if (/^d/.test(unit))  d.setDate(d.getDate() - n);
  else if (/^w/.test(unit))  d.setDate(d.getDate() - n * 7);
  else if (/^mo/.test(unit)) d.setMonth(d.getMonth() - n);
  else if (/^y/.test(unit))  d.setFullYear(d.getFullYear() - n);
  else return null;
  return d.toISOString();
}

/**
 * Resolve a raw timestamp — if it looks like ISO, return as-is; otherwise parse as relative.
 */
export function resolveTimestamp(rawTs: string): string {
  if (!rawTs) return "";
  if (/^\d{4}-/.test(rawTs)) return rawTs;
  return parseRelativeTs(rawTs) ?? "";
}
