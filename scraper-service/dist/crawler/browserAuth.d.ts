/**
 * Check if auth is available — either local profile, storage-state file, or env var.
 */
export declare function hasSavedCookies(): boolean;
/**
 * Get the path to the persistent browser profile directory.
 */
export declare function getProfileDir(): string;
/**
 * Get storageState for use with browser.newContext().
 * Priority: env var > storage-state.json file > undefined (no auth).
 */
export declare function getStorageState(): string | undefined;
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
