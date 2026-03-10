/**
 * Disables Crawlee's disk persistence globally and sets an isolated
 * storage dir per platform. With CRAWLEE_PERSIST_STORAGE=false,
 * Crawlee keeps everything in memory — no file read/write race conditions.
 */
export declare function useStorageDir(platform: string): void;
/**
 * No-op now that persistence is disabled. Kept for API compatibility.
 */
export declare function cleanStorage(_platform: string): void;
