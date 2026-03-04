import type { ExtractedPost } from "../types";
import { persistPosts, drainPendingPosts } from "./offline-buffer";

// ---------------------------------------------------------------------------
// BatchQueue — accumulates posts and flushes in batches to service worker
// ---------------------------------------------------------------------------

export interface BatchQueueConfig {
  /** Max posts per batch (default: 50) */
  maxBatchSize: number;
  /** ms to wait before flushing a partial batch (default: 5000) */
  flushIntervalMs: number;
  /** Max retry attempts before persisting to IndexedDB (default: 3) */
  maxRetries: number;
  /** Callback to send a batch to the backend — return true on success */
  onFlush: (posts: ExtractedPost[]) => Promise<boolean>;
}

const DEFAULT_CONFIG: BatchQueueConfig = {
  maxBatchSize: 50,
  flushIntervalMs: 5_000,
  maxRetries: 3,
  onFlush: async () => false,
};

export class BatchQueue {
  private queue: ExtractedPost[] = [];
  private timer: ReturnType<typeof setTimeout> | null = null;
  private retryCount = 0;
  private config: BatchQueueConfig;
  private flushing = false;

  constructor(config: Partial<BatchQueueConfig> & Pick<BatchQueueConfig, "onFlush">) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /** Add a post to the queue. Triggers flush when batch is full. */
  push(post: ExtractedPost): void {
    this.queue.push(post);

    if (this.queue.length >= this.config.maxBatchSize) {
      this.flush();
    } else if (!this.timer) {
      this.timer = setTimeout(() => this.flush(), this.config.flushIntervalMs);
    }
  }

  /** Add multiple posts at once (e.g. recovered from IndexedDB). */
  pushMany(posts: ExtractedPost[]): void {
    for (const p of posts) this.push(p);
  }

  /** Immediately flush the current queue. */
  async flush(): Promise<void> {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    if (this.queue.length === 0 || this.flushing) return;

    this.flushing = true;
    const batch = this.queue.splice(0, this.config.maxBatchSize);

    try {
      const success = await this.config.onFlush(batch);

      if (!success) {
        this.retryCount++;
        if (this.retryCount <= this.config.maxRetries) {
          // Exponential backoff: 1s → 4s → 16s
          const delay = Math.pow(4, this.retryCount - 1) * 1_000;
          console.warn(
            `[BatchQueue] Flush failed — retry ${this.retryCount}/${this.config.maxRetries} in ${delay}ms`
          );
          this.queue.unshift(...batch);
          setTimeout(() => this.flush(), delay);
        } else {
          // All retries exhausted — persist to IndexedDB
          console.error(
            `[BatchQueue] All ${this.config.maxRetries} retries exhausted — persisting ${batch.length} posts to IndexedDB`
          );
          await persistPosts(batch);
          this.retryCount = 0;
        }
      } else {
        this.retryCount = 0;
        console.log(`[BatchQueue] Flushed ${batch.length} posts successfully`);
      }
    } catch (err) {
      console.error("[BatchQueue] Unexpected flush error:", err);
      await persistPosts(batch);
      this.retryCount = 0;
    } finally {
      this.flushing = false;
    }

    // Continue flushing if more items remain
    if (this.queue.length > 0) {
      this.timer = setTimeout(() => this.flush(), this.config.flushIntervalMs);
    }
  }

  /** Drain any posts that were persisted to IndexedDB during previous failures. */
  async recoverPending(): Promise<void> {
    try {
      const pending = await drainPendingPosts();
      if (pending.length > 0) {
        console.log(`[BatchQueue] Recovered ${pending.length} pending posts from IndexedDB`);
        this.pushMany(pending);
      }
    } catch (err) {
      console.error("[BatchQueue] Failed to recover pending posts:", err);
    }
  }

  /** Number of posts currently waiting in the queue. */
  get pending(): number {
    return this.queue.length;
  }
}
