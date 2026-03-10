import path from "path";

const STORAGE_ROOT = path.resolve(__dirname, "../../storage");

/**
 * Disables Crawlee's disk persistence globally and sets an isolated
 * storage dir per platform. With CRAWLEE_PERSIST_STORAGE=false,
 * Crawlee keeps everything in memory — no file read/write race conditions.
 */
export function useStorageDir(platform: string): void {
  process.env.CRAWLEE_PERSIST_STORAGE = "false";
  process.env.CRAWLEE_STORAGE_DIR = path.join(STORAGE_ROOT, platform.toLowerCase());
}

/**
 * No-op now that persistence is disabled. Kept for API compatibility.
 */
export function cleanStorage(_platform: string): void {
  // Nothing to clean — storage is in-memory only
}
