/**
 * Single source of truth for the alert intent-score threshold.
 *
 * The persisted alerts query (getAlerts) and the realtime badge counters (header,
 * sidebar) must agree, or leads scoring just above the list threshold appear on
 * refresh but never increment the live badge. Import this everywhere instead of
 * hard-coding the number. Client-safe (no server imports).
 */
export const ALERT_MIN_SCORE = 60;
