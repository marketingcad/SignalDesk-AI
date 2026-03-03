import type { ExtractedPost, Platform } from "../types";

export interface PlatformAdapter {
  platform: Platform;
  /** CSS selector for the scrollable feed container to observe */
  feedContainerSelector: string;
  /** Returns true if this DOM node represents a new post to process */
  isPostNode(node: Node): node is HTMLElement;
  /** Extract structured data from a post DOM element */
  extractPost(element: HTMLElement): ExtractedPost | null;
}

/**
 * Creates and starts a MutationObserver for a given platform.
 * Returns a disconnect function to stop observing.
 */
export function createPlatformObserver(
  adapter: PlatformAdapter,
  onPostDetected: (post: ExtractedPost) => void
): { disconnect: () => void } {
  const processedPosts = new Set<string>();
  let observer: MutationObserver | null = null;
  let retryTimeout: ReturnType<typeof setTimeout> | null = null;

  function processNode(node: Node) {
    if (!adapter.isPostNode(node)) return;

    const post = adapter.extractPost(node);
    if (!post || !post.text) return;

    // Dedup by URL or content fingerprint
    const key = post.url || `${post.username}-${post.text.slice(0, 80)}`;
    if (processedPosts.has(key)) return;
    processedPosts.add(key);

    // Cap dedup set size to prevent memory leaks
    if (processedPosts.size > 1000) {
      const entries = Array.from(processedPosts);
      entries.slice(0, 500).forEach((k) => processedPosts.delete(k));
    }

    onPostDetected(post);
  }

  function startObserving() {
    const container = document.querySelector(adapter.feedContainerSelector);
    if (!container) {
      // SPA may not have rendered the feed yet — retry
      retryTimeout = setTimeout(startObserving, 2000);
      return;
    }

    observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        for (const node of mutation.addedNodes) {
          processNode(node);
          // Also check children (platforms nest posts in wrapper divs)
          if (node instanceof HTMLElement) {
            node.querySelectorAll("*").forEach((child) => processNode(child));
          }
        }
      }
    });

    observer.observe(container, { childList: true, subtree: true });

    // Process existing posts on initial load
    container.querySelectorAll("*").forEach((el) => processNode(el));

    console.log(`[SignalDesk] Observer started for ${adapter.platform}`);
  }

  function disconnect() {
    if (observer) observer.disconnect();
    if (retryTimeout) clearTimeout(retryTimeout);
  }

  startObserving();

  return { disconnect };
}
