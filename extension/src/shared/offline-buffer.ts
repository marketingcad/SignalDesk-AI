import type { ExtractedPost } from "../types";

// ---------------------------------------------------------------------------
// IndexedDB offline buffer — persists posts when the backend is unreachable
// so they can be recovered when the service worker wakes up.
// ---------------------------------------------------------------------------

const DB_NAME = "signaldesk-buffer";
const STORE_NAME = "pending-posts";
const DB_VERSION = 1;

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);

    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "id", autoIncrement: true });
      }
    };

    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/** Persist an array of posts for later retry. */
export async function persistPosts(posts: ExtractedPost[]): Promise<void> {
  if (posts.length === 0) return;

  try {
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);

    for (const post of posts) {
      store.add({ ...post, _bufferedAt: Date.now() });
    }

    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });

    console.log(`[OfflineBuffer] Persisted ${posts.length} posts`);
    db.close();
  } catch (err) {
    console.error("[OfflineBuffer] Failed to persist posts:", err);
  }
}

/** Retrieve and delete all pending posts (atomic drain). */
export async function drainPendingPosts(): Promise<ExtractedPost[]> {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);

    const posts = await new Promise<ExtractedPost[]>((resolve, reject) => {
      const req = store.getAll();
      req.onsuccess = () => {
        // Strip the internal _bufferedAt / id fields
        const raw = req.result as Array<ExtractedPost & { id?: number; _bufferedAt?: number }>;
        resolve(
          raw.map(({ id: _id, _bufferedAt: _ba, ...post }) => post as ExtractedPost)
        );
      };
      req.onerror = () => reject(req.error);
    });

    // Clear the store after retrieval
    store.clear();

    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });

    if (posts.length > 0) {
      console.log(`[OfflineBuffer] Drained ${posts.length} pending posts`);
    }

    db.close();
    return posts;
  } catch (err) {
    console.error("[OfflineBuffer] Failed to drain pending posts:", err);
    return [];
  }
}
