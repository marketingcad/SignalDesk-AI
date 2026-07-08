/**
 * Exported storageState JSON file (portable — works on Render).
 * Exported so the Live Login engine writes the session to the same file the
 * scrapers read from via {@link getStorageState}.
 */
export declare const STORAGE_STATE_PATH: string;
/**
 * Check if auth is available — either local profile, storage-state file, or env var.
 */
export declare function hasSavedCookies(): boolean;
/**
 * Get the path to the persistent browser profile directory.
 */
export declare function getProfileDir(): string;
export type AuthPlatformKey = "facebook" | "linkedin" | "x";
/**
 * Inspect the saved session and report which platforms are actually logged in,
 * based on the presence of their auth marker cookie. Drives the per-platform
 * status cards in Settings → Browser Login so an unauthenticated platform isn't
 * shown as "active".
 */
export declare function getAuthenticatedPlatforms(): Record<AuthPlatformKey, boolean>;
type PWCookie = {
    name: string;
    value: string;
    domain: string;
    path: string;
    expires: number;
    httpOnly: boolean;
    secure: boolean;
    sameSite: "Strict" | "Lax" | "None";
};
type PWOrigin = {
    origin: string;
    localStorage: {
        name: string;
        value: string;
    }[];
};
/**
 * Build a storageState OBJECT safe to pass to browser.newContext().
 *
 * Playwright rejects the entire context if ANY cookie lacks a `url` or a
 * `domain`+`path` pair ("Cookie should have a url or a domain/path pair"),
 * which crashes the scrape outright. A minimally-seeded session can contain
 * exactly such a cookie (a bare `xs`). Drop those unusable cookies and
 * normalise the rest so the context always builds — logged-out at worst, never
 * a crash. Returns undefined when there is no session data at all.
 */
export declare function getStorageStateForContext(): {
    cookies: PWCookie[];
    origins: PWOrigin[];
} | undefined;
/**
 * Get storageState for use with browser.newContext().
 *
 * The on-disk storage-state.json file is the single source of truth. It is the
 * "rolling session": every authenticated scrape re-exports the (rotated, freshly
 * extended) cookies back to it via {@link saveStorageState}, so the session stays
 * alive indefinitely as long as the scraper keeps running — no re-login needed.
 *
 * The BROWSER_STORAGE_STATE env var (Render / production) is only a BOOTSTRAP
 * seed: it is written to the file once, on first use, and from then on the
 * refreshed file takes priority. (On a fresh deploy the ephemeral file is gone,
 * so the env var seeds it again — and if the env var is ever stale, re-pasting a
 * fresh value + restart re-seeds cleanly.)
 */
export declare function getStorageState(): string | undefined;
/**
 * Persist the current browser cookies/localStorage back to the rolling session
 * file. Call this after a scrape where we CONFIRMED the session is still logged
 * in — it captures the cookies Facebook/LinkedIn just rotated and re-extended,
 * which is what keeps the login from expiring over time.
 *
 * Never call this on a logged-out context: it would overwrite good saved cookies
 * with an empty session.
 */
export declare function saveStorageState(context: import("playwright").BrowserContext): Promise<void>;
/**
 * Load the durable session from Supabase into the local rolling file.
 * Returns true if a session was found and written. This is the source of truth
 * that survives container redeploys (where the local file is wiped).
 */
export declare function loadSessionFromSupabase(): Promise<boolean>;
/**
 * Persist the current rolling session to Supabase so it survives redeploys.
 * Called after every successful scrape (via saveStorageState) and after a Live
 * Login save, so the freshest cookies are always durably stored.
 */
export declare function saveSessionToSupabase(rawJson?: string): Promise<void>;
/**
 * Startup: make the rolling session durable.
 *
 * Priority order:
 *   1. Supabase row — auto-refreshed and survives redeploys (the steady state).
 *   2. BROWSER_STORAGE_STATE env — one-time bootstrap; once present it is migrated
 *      into Supabase so future boots use the durable copy and you never re-paste.
 */
export declare function initSession(): Promise<void>;
/**
 * Check if we should use storageState (server mode) vs persistent profile (local mode).
 * On Render, there's no persistent profile dir, so we always use storageState.
 */
export declare function shouldUseStorageState(): boolean;
/**
 * Open a visible browser with a persistent profile so the user can log in.
 * After login, exports a portable storage-state.json for server deployment.
 *
 * Usage:
 *   npm run auth:login              → opens all platforms in tabs
 *   npm run auth:login -- linkedin  → opens only LinkedIn
 *   npm run auth:login -- facebook  → opens only Facebook
 *   npm run auth:login -- twitter   → opens only Twitter
 */
export declare function loginAndSave(platform?: string): Promise<void>;
export type CookieValidationResult = "valid" | "expired" | "no_cookies" | "error";
/**
 * Validate cookies for a specific platform by loading a page that requires auth
 * and checking if we get redirected to a login page.
 *
 * Returns: "valid" | "expired" | "no_cookies" | "error"
 */
export declare function validateCookies(platform: "facebook" | "linkedin"): Promise<CookieValidationResult>;
/**
 * Validate cookies for all auth-requiring platforms.
 * Returns a map of platform → validation result.
 */
export declare function validateAllCookies(): Promise<Record<string, CookieValidationResult>>;
export {};
