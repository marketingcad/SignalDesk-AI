/**
 * Check if a logged-in browser profile exists.
 */
export declare function hasSavedCookies(): boolean;
/**
 * Get the path to the persistent browser profile directory.
 */
export declare function getProfileDir(): string;
/**
 * Open a visible browser with a persistent profile so the user can log in.
 * The login session is saved automatically to the profile directory —
 * cookies persist even after the browser is closed, just like normal Chrome.
 *
 * Usage: npm run auth:login
 */
export declare function loginAndSave(): Promise<void>;
