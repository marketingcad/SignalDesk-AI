/**
 * Single source of truth for the alert intent-score threshold.
 *
 * The persisted alerts query (getAlerts) and the realtime badge counters (header,
 * sidebar) must agree, or leads scoring just above the list threshold appear on
 * refresh but never increment the live badge. Import this everywhere instead of
 * hard-coding the number. Client-safe (no server imports).
 */
export const ALERT_MIN_SCORE = 60;

/**
 * localStorage key holding the ISO timestamp the user last opened the Alerts
 * page. The header bell and sidebar badge both read it so they show the same
 * "new since last seen" count and clear together.
 */
export const ALERTS_LAST_SEEN_KEY = "alertsLastSeenAt";
