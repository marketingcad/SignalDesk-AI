import type { ExtractedPost, Platform } from "../types";
import { canProcess } from "./rate-limiter";
import { recordScan, isPaused } from "./burst-detector";
import { isDuplicate, markProcessed } from "./persistent-dedup";

export interface PlatformAdapter {
  platform: Platform;
  /** CSS selector for the scrollable feed container to observe */
  feedContainerSelector: string;
  /** Returns true if this DOM node represents a new post to process */
  isPostNode(node: Node): node is HTMLElement;
  /** Extract structured data from a post DOM element */
  extractPost(element: HTMLElement): ExtractedPost | null;
}

/** DOM attribute used to mark elements as processed — prevents re-scanning */
const PROCESSED_MARKER = "data-sdai-seen";

/** Max posts to process per mutation batch (prevents UI jank on fast scrolling) */
const MAX_PER_CYCLE = 10;

/** Throttle interval between processing cycles (ms) */
const THROTTLE_MS = 200;

/**
 * Creates and starts a MutationObserver for a given platform.
 * Returns a disconnect function to stop observing.
 *
 * Enhanced with:
 * - DOM marker to prevent re-scanning already-processed elements
 * - Throttled processing queue to avoid jank during fast scrolling
 * - Per-platform rate limiting + burst detection
 */
export function createPlatformObserver(
  adapter: PlatformAdapter,
  onPostDetected: (post: ExtractedPost) => void
): { disconnect: () => void } {
  const processedPosts = new Set<string>();
  let observer: MutationObserver | null = null;
  let retryTimeout: ReturnType<typeof setTimeout> | null = null;
  let processingQueue: HTMLElement[] = [];
  let flushTimer: ReturnType<typeof setTimeout> | null = null;

  async function processElement(el: HTMLElement): Promise<void> {
    // Skip already-processed elements (DOM marker)
    if (el.hasAttribute(PROCESSED_MARKER)) return;

    if (!adapter.isPostNode(el)) return;

    // Mark as processed immediately
    el.setAttribute(PROCESSED_MARKER, "1");

    // Rate limit + burst check
    if (isPaused()) return;
    if (!canProcess(adapter.platform)) return;
    if (!recordScan()) return;

    const post = adapter.extractPost(el);
    if (!post || !post.text) return;

    // Dedup by URL or content fingerprint.
    // IMPORTANT: If URL is just the page URL (e.g. group page), it's the same for
    // every post — fall back to content fingerprint to avoid blocking all but the first.
    const isGenericUrl = !post.url || post.url === window.location.href;
    const key = isGenericUrl
      ? `${post.username}-${post.text.slice(0, 80)}`
      : post.url;

    // Fast path: in-memory check (synchronous)
    if (processedPosts.has(key)) return;

    // Slow path: persistent check (survives tab reloads from auto-monitor)
    if (await isDuplicate(key)) {
      processedPosts.add(key); // Cache locally to skip async next time
      return;
    }

    processedPosts.add(key);
    await markProcessed(key);

    // Cap in-memory dedup set size to prevent memory leaks
    if (processedPosts.size > 1000) {
      const entries = Array.from(processedPosts);
      entries.slice(0, 500).forEach((k) => processedPosts.delete(k));
    }

    console.log(
      `[SignalDesk] [${adapter.platform}] Post detected:`,
      `\n  User: ${post.username}`,
      `\n  Text: ${post.text.slice(0, 120)}...`,
      `\n  URL: ${post.url}`,
      `\n  Engagement: ${post.engagement}`
    );

    onPostDetected(post);
  }

  /** Throttled queue processor — caps at MAX_PER_CYCLE per THROTTLE_MS */
  async function flushQueue(): Promise<void> {
    flushTimer = null;
    if (processingQueue.length === 0) return;

    const batch = processingQueue.splice(0, MAX_PER_CYCLE);
    for (const el of batch) {
      await processElement(el);
    }

    // Continue processing if queue has more
    if (processingQueue.length > 0) {
      flushTimer = setTimeout(flushQueue, THROTTLE_MS);
    }
  }

  function enqueueNode(node: Node): void {
    if (node instanceof HTMLElement) {
      // Check the node itself
      if (!node.hasAttribute(PROCESSED_MARKER)) {
        processingQueue.push(node);
      }
      // Also check children (platforms nest posts in wrapper divs)
      node.querySelectorAll(`*:not([${PROCESSED_MARKER}])`).forEach((child) => {
        if (child instanceof HTMLElement) {
          processingQueue.push(child);
        }
      });
    }

    // Schedule processing
    if (!flushTimer && processingQueue.length > 0) {
      flushTimer = setTimeout(flushQueue, THROTTLE_MS);
    }
  }

  function startObserving() {
    const container = document.querySelector(adapter.feedContainerSelector);
    if (!container) {
      console.log(`[SignalDesk] [${adapter.platform}] Feed container "${adapter.feedContainerSelector}" not found — retrying in 2s...`);
      retryTimeout = setTimeout(startObserving, 2000);
      return;
    }
    console.log(`[SignalDesk] [${adapter.platform}] Feed container found:`, container.tagName, container.className?.slice(0, 60));

    observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        for (const node of mutation.addedNodes) {
          enqueueNode(node);
        }
      }
    });

    observer.observe(container, { childList: true, subtree: true });

    // Process existing posts on initial load
    let existingCount = 0;
    container.querySelectorAll(`*:not([${PROCESSED_MARKER}])`).forEach((el) => {
      existingCount++;
      if (el instanceof HTMLElement) {
        processingQueue.push(el);
      }
    });

    if (processingQueue.length > 0) {
      flushTimer = setTimeout(flushQueue, THROTTLE_MS);
    }

    console.log(`[SignalDesk] [${adapter.platform}] Observer started — queued ${existingCount} existing elements, ${processedPosts.size} posts tracked`);
  }

  function disconnect() {
    if (observer) observer.disconnect();
    if (retryTimeout) clearTimeout(retryTimeout);
    if (flushTimer) clearTimeout(flushTimer);
    processingQueue = [];
  }

  startObserving();

  return { disconnect };
}
