// ─────────────────────────────────────────────────────────────────────────────
// Shared detection for "this scrape failed because the platform login is gone".
// Used by both the global re-login modal and the run-history alert so they agree
// on what counts as an auth/login failure (vs. a transient crash or timeout).
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Words/phrases that appear in a run's error message when the failure is caused
 * by a missing/expired login session rather than a network or browser crash.
 * Kept deliberately login-specific so generic failures ("Browser crashed",
 * "Navigation timeout") don't masquerade as auth problems.
 */
const AUTH_FAILURE_PATTERN =
  /\b(re-?login|log\s?in|logged\s?out|not\s+logged\s?in|sign\s?in|please\s+log|session\s+(expired|invalid|has\s+expired)|expired\s+session|re-?authenticate|authwall|checkpoint|not\s+authenticated|unauthori[sz]ed|401|403)\b/i;

/** True when an error message indicates the scrape failed for lack of a valid login. */
export function isAuthFailureMessage(message?: string | null): boolean {
  if (!message) return false;
  return AUTH_FAILURE_PATTERN.test(message);
}
