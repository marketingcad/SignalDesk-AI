/**
 * Get the cutoff date: 7 days ago at 00:00:00 UTC.
 * This is a rolling window — always includes the last 7 full days,
 * regardless of which day of the week it is.
 */
export declare function getStartOfWeek(): Date;
/**
 * Check if a timestamp string falls within the last 7 days.
 * Returns true if:
 *  - timestamp is null/undefined/empty (keep posts with no date — don't discard valid leads)
 *  - timestamp is unparseable (keep)
 *  - timestamp is within the last 7 days
 */
export declare function isCurrentWeek(ts: string | null | undefined): boolean;
/**
 * Check if a timestamp is OLDER than 7 days.
 * Used for early-stop logic: when we detect a post older than 7 days,
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
