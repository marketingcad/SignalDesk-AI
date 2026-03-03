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
    if (!post || !post.text) {
      console.log(`[SignalDesk] [${adapter.platform}] Post node found but no text extracted`);
      return;
    }

    // Dedup by URL or content fingerprint
    const key = post.url || `${post.username}-${post.text.slice(0, 80)}`;
    if (processedPosts.has(key)) return;
    processedPosts.add(key);

    // Cap dedup set size to prevent memory leaks
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
    const existingCount = { total: 0 };
    container.querySelectorAll("*").forEach((el) => {
      existingCount.total++;
      processNode(el);
    });

    console.log(`[SignalDesk] [${adapter.platform}] Observer started — scanned ${existingCount.total} existing elements, ${processedPosts.size} posts tracked`);
  }

  function disconnect() {
    if (observer) observer.disconnect();
    if (retryTimeout) clearTimeout(retryTimeout);
  }

  startObserving();

  return { disconnect };
}
