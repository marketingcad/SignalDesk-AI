/**
 * Persistent dedup using chrome.storage.session.
 * Survives content script restarts (tab reloads) but clears on browser close.
 * Prevents duplicate posts when auto-monitor reloads tabs.
 */

const STORAGE_KEY = "sdai_dedup_keys";
const MAX_ENTRIES = 2000;
const PRUNE_TO = 1000;

/** Check if a dedup key already exists in session storage */
export async function isDuplicate(key: string): Promise<boolean> {
  try {
    const result = await chrome.storage.session.get(STORAGE_KEY);
    const keys: string[] = result[STORAGE_KEY] || [];
    return keys.includes(key);
  } catch {
    // Fallback: if session storage unavailable, don't block
    return false;
  }
}

/** Mark a dedup key as processed in session storage */
export async function markProcessed(key: string): Promise<void> {
  try {
    const result = await chrome.storage.session.get(STORAGE_KEY);
    const keys: string[] = result[STORAGE_KEY] || [];

    if (keys.includes(key)) return;

    keys.push(key);

    // Prune oldest entries when too large
    if (keys.length > MAX_ENTRIES) {
      keys.splice(0, keys.length - PRUNE_TO);
    }

    await chrome.storage.session.set({ [STORAGE_KEY]: keys });
  } catch {
    // Non-critical — in-memory dedup still works as primary
  }
}
