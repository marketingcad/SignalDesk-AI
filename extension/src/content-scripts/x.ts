import { createPlatformObserver, type PlatformAdapter } from "../shared/observer-factory";
import { passesPreFilter } from "../shared/pre-filter";
import { getCleanText, parseEngagement, querySelectorFallback } from "../shared/dom-utils";
import { startAutoScroll, stopAutoScroll } from "../shared/auto-scroll";
import type { ExtractedPost, StartAutoScrollMessage } from "../types";

const PLATFORM = "X" as const;

// Selector fallback chains — self-healing against DOM changes
const SELECTORS = {
  feedContainer: '[data-testid="primaryColumn"] section, [aria-label*="Timeline"]',
  textContent: ['[data-testid="tweetText"]'],
  username: ['[data-testid="User-Name"]'],
  likes: ['[data-testid="like"] span', '[data-testid="unlike"] span'],
  retweets: ['[data-testid="retweet"] span', '[data-testid="unretweet"] span'],
};

const adapter: PlatformAdapter = {
  platform: PLATFORM,
  feedContainerSelector: SELECTORS.feedContainer,

  isPostNode(node: Node): node is HTMLElement {
    if (!(node instanceof HTMLElement)) return false;
    return (
      node.matches('article[data-testid="tweet"]') ||
      node.querySelector('article[data-testid="tweet"]') !== null
    );
  },

  extractPost(element: HTMLElement): ExtractedPost | null {
    const article =
      element.matches('article[data-testid="tweet"]')
        ? element
        : element.querySelector('article[data-testid="tweet"]');
    if (!article || !(article instanceof HTMLElement)) return null;

    // Extract tweet text — fallback chain
    const textEl = querySelectorFallback(article, SELECTORS.textContent, PLATFORM, "textContent");
    const text = getCleanText(textEl).slice(0, 2000);
    if (!text) return null;

    // Username — fallback chain
    const userEl = querySelectorFallback(article, SELECTORS.username, PLATFORM, "username");
    const username = userEl
      ? getCleanText(userEl).split("@")[0].trim()
      : "Unknown";

    // Tweet URL — look for the timestamp link
    const timeLink = article.querySelector('a[href*="/status/"] time');
    const tweetLink = timeLink?.closest("a") as HTMLAnchorElement | null;
    const url = tweetLink ? tweetLink.href : window.location.href;

    // Engagement — likes (fallback chain)
    const likeEl = querySelectorFallback(article, SELECTORS.likes, PLATFORM, "likes");
    const retweetEl = querySelectorFallback(article, SELECTORS.retweets, PLATFORM, "retweets");
    const likes = likeEl ? parseEngagement(getCleanText(likeEl)) : 0;
    const retweets = retweetEl ? parseEngagement(getCleanText(retweetEl)) : 0;
    const engagement = likes + retweets;

    // Timestamp
    const timeEl = article.querySelector("time");
    const timestamp =
      timeEl?.getAttribute("datetime") || new Date().toISOString();

    const source = "X Feed";

    return { platform: PLATFORM, text, username, url, timestamp, engagement, source };
  },
};

async function init() {
  const { platformToggles } = await chrome.storage.local.get("platformToggles");
  if (platformToggles && platformToggles.X === false) {
    console.log("[SignalDesk] X monitoring disabled");
    return;
  }

  console.log("[SignalDesk] X content script active");

  createPlatformObserver(adapter, (post) => {
    if (!passesPreFilter(post.text)) {
      console.log(`[SignalDesk] [X] Post FILTERED OUT: "${post.text.slice(0, 80)}..."`);
      return;
    }

    chrome.runtime.sendMessage(
      { type: "POST_DETECTED", payload: post },
      (response) => {
        if (chrome.runtime.lastError) {
          console.error(`[SignalDesk] [X] sendMessage error:`, chrome.runtime.lastError.message);
        } else {
          console.log(`[SignalDesk] [X] Background response:`, response);
        }
      }
    );
  });
}

init();

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === "START_AUTO_SCROLL") {
    startAutoScroll(message as StartAutoScrollMessage);
    sendResponse({ ok: true });
    return false;
  }
  if (message.type === "STOP_AUTO_SCROLL") {
    stopAutoScroll();
    sendResponse({ ok: true });
    return false;
  }
  return false;
});
