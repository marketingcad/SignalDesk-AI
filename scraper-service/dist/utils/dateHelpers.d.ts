/**
 * Get the start of the current week (Monday 00:00:00 UTC).
 */
export declare function getStartOfWeek(): Date;
/**
 * Check if a timestamp string falls within the current week (since Monday).
 * Returns true if:
 *  - timestamp is null/undefined/empty (keep posts with no date — don't discard valid leads)
 *  - timestamp is unparseable (keep)
 *  - timestamp is >= start of current week
 */
export declare function isCurrentWeek(ts: string | null | undefined): boolean;
/**
 * Check if a timestamp is OLDER than the current week.
 * Used for early-stop logic: when we detect a post older than this week,
 * we can stop scrolling because subsequent posts will be even older.
 * Returns false if timestamp is missing/unparseable (we can't be sure it's old).
 */
export declare function isOlderThanCurrentWeek(ts: string | null | undefined): boolean;
/**
 * Parse relative time strings ("2h", "3 days ago", "1w", "just now") → ISO string.
 * Returns null if the string can't be parsed.
 */
export declare function parseRelativeTs(text: string): string | null;
/**
 * Resolve a raw timestamp — if it looks like ISO, return as-is; otherwise parse as relative.
 */
export declare function resolveTimestamp(rawTs: string): string;
